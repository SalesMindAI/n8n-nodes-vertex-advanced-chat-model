import { ProjectsClient } from '@google-cloud/resource-manager';
import { ChatVertexAI, type ChatVertexAIInput } from '@langchain/google-vertexai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type ILoadOptionsFunctions,
	type JsonObject,
	type INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';
import {
	N8nLlmTracing,
	makeN8nLlmFailedAttemptHandler,
	getConnectionHintNoticeField,
} from '@n8n/ai-utilities';
import { makeErrorFromStatus } from './error-handling';

/**
 * Safety setting type matching GoogleAISafetySetting from @langchain/google-common.
 * Defined inline to avoid import resolution issues with nested node_modules.
 */
interface SafetySetting {
	category: string;
	threshold: string;
}

/**
 * Subclass of ChatVertexAI that injects `includeThoughts` into the
 * thinkingConfig of the Vertex AI API request body.
 *
 * LangChain's @langchain/google-common only auto-sets includeThoughts when
 * thinkingBudget (maxReasoningTokens) is provided, but the Vertex AI API
 * supports includeThoughts as a standalone field alongside thinkingLevel.
 *
 * This subclass patches the connection's formatData method to post-process
 * the request body and inject includeThoughts into generationConfig.thinkingConfig.
 */
class ChatVertexAIWithThinking extends ChatVertexAI {
	private _includeThoughts: boolean;
	// Track patched connections by reference to avoid double-patching
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _patchedConnections = new WeakSet<any>();

	constructor(fields: ChatVertexAIInput & { includeThoughts?: boolean }) {
		super(fields);
		this._includeThoughts = fields.includeThoughts ?? false;
	}

	/**
	 * Patch a connection's formatData to inject includeThoughts into
	 * the thinkingConfig after LangChain builds the request body.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private patchConnection(connection: any): void {
		if (!this._includeThoughts || this._patchedConnections.has(connection)) return;

		const originalFormatData = connection.formatData.bind(connection);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		connection.formatData = async (input: any, parameters: any) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data: any = await originalFormatData(input, parameters);
			if (data?.generationConfig?.thinkingConfig) {
				data.generationConfig.thinkingConfig.includeThoughts = true;
			} else if (data?.generationConfig) {
				data.generationConfig.thinkingConfig = { includeThoughts: true };
			}
			return data;
		};

		this._patchedConnections.add(connection);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async _generate(messages: any, options: any, runManager?: any): Promise<any> {
		this.patchConnection(this.connection);
		this.patchConnection(this.streamedConnection);
		return super._generate(messages, options, runManager);
	}
}

/**
 * Normalizes a PEM private key string by replacing escaped newlines
 * with actual newlines and trimming whitespace.
 * Equivalent to `formatPrivateKey` from n8n-nodes-base.
 */
function formatPrivateKey(privateKey: string): string {
	if (!privateKey) return privateKey;

	let formattedKey = privateKey;

	// Replace literal \n with actual newlines
	if (formattedKey.includes('\\n')) {
		formattedKey = formattedKey.replace(/\\n/g, '\n');
	}

	// Ensure proper PEM formatting
	const lines = formattedKey.split('\n').map((line) => line.trim());
	const filteredLines = lines.filter((line) => line !== '');

	// If the key has BEGIN/END markers, reconstruct properly
	const beginIndex = filteredLines.findIndex((line) => line.startsWith('-----BEGIN'));
	const endIndex = filteredLines.findIndex((line) => line.startsWith('-----END'));

	if (beginIndex !== -1 && endIndex !== -1) {
		const header = filteredLines[beginIndex];
		const footer = filteredLines[endIndex];
		const body = filteredLines.slice(beginIndex + 1, endIndex).join('');

		// Split body into 64-char lines (standard PEM format)
		const bodyLines: string[] = [];
		for (let i = 0; i < body.length; i += 64) {
			bodyLines.push(body.substring(i, i + 64));
		}

		return [header, ...bodyLines, footer].join('\n');
	}

	return formattedKey.trim();
}

const harmCategories: INodePropertyOptions[] = [
	{
		value: 'HARM_CATEGORY_HARASSMENT',
		name: 'HARM_CATEGORY_HARASSMENT',
		description: 'Harassment content',
	},
	{
		value: 'HARM_CATEGORY_HATE_SPEECH',
		name: 'HARM_CATEGORY_HATE_SPEECH',
		description: 'Hate speech and content',
	},
	{
		value: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
		name: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
		description: 'Sexually explicit content',
	},
	{
		value: 'HARM_CATEGORY_DANGEROUS_CONTENT',
		name: 'HARM_CATEGORY_DANGEROUS_CONTENT',
		description: 'Dangerous content',
	},
];

const harmThresholds: INodePropertyOptions[] = [
	{
		value: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
		name: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
		description: 'Threshold is unspecified',
	},
	{
		value: 'BLOCK_LOW_AND_ABOVE',
		name: 'BLOCK_LOW_AND_ABOVE',
		description: 'Content with NEGLIGIBLE will be allowed',
	},
	{
		value: 'BLOCK_MEDIUM_AND_ABOVE',
		name: 'BLOCK_MEDIUM_AND_ABOVE',
		description: 'Content with NEGLIGIBLE and LOW will be allowed',
	},
	{
		value: 'BLOCK_ONLY_HIGH',
		name: 'BLOCK_ONLY_HIGH',
		description: 'Content with NEGLIGIBLE, LOW, and MEDIUM will be allowed',
	},
	{
		value: 'BLOCK_NONE',
		name: 'BLOCK_NONE',
		description: 'All content will be allowed',
	},
];

export class LmChatGoogleVertexAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Vertex Advanced Chat Model',
		name: 'lmChatGoogleVertexAdvanced',
		icon: 'file:google.svg',
		group: ['transform'],
		version: [1],
		description: 'Google Vertex AI Chat Model with labels support for billing cost tracking',
		defaults: {
			name: 'Google Vertex Advanced Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'googleApi',
				required: true,
			},
		],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'Select or enter your Google Cloud project ID',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'gcpProjectsList',
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
					},
				],
			},
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'string',
				description:
					'The model which will generate the completion. <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models">Learn more</a>.',
				default: 'gemini-2.5-flash',
			},
			{
				displayName: 'Labels',
				name: 'labels',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: { values: [] },
				placeholder: 'Add Label',
				description:
					'Labels to apply to the request for billing cost tracking. Keys and values must be strings. <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters#add-labels">Learn more</a>.',
				options: [
					{
						name: 'values',
						displayName: 'Label',
						values: [
							{
								displayName: 'Key',
								name: 'key',
								type: 'string',
								default: '',
								required: true,
								description: 'The label key',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								required: true,
								description: 'The label value',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Include Thoughts',
						name: 'includeThoughts',
						type: 'boolean',
						default: false,
						description:
							"Whether to include the model's intermediate thinking steps in the response. Thoughts provide insights into the model's reasoning process and help with debugging. Thoughts are returned only when available.",
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxOutputTokens',
						default: 2048,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
					},
					{
						displayName: 'Safety Settings',
						name: 'safetySettings',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						default: {
							values: {
								category: harmCategories[0].name,
								threshold: harmThresholds[0].name,
							},
						},
						placeholder: 'Add Option',
						options: [
							{
								name: 'values',
								displayName: 'Values',
								values: [
									{
										displayName: 'Safety Category',
										name: 'category',
										type: 'options',
										description: 'The category of harmful content to block',
										default: 'HARM_CATEGORY_UNSPECIFIED',
										options: harmCategories,
									},
									{
										displayName: 'Safety Threshold',
										name: 'threshold',
										type: 'options',
										description: 'The threshold of harmful content to block',
										default: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
										options: harmThresholds,
									},
								],
							},
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.4,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Thinking Budget',
						name: 'thinkingBudget',
						default: -1,
						description:
							'Controls reasoning tokens for Gemini 2.5 series thinking models. Set to 0 to disable automatic thinking. Set to -1 for dynamic thinking (default). Not supported on Gemini 3.x models (use Thinking Level instead).',
						type: 'number',
						typeOptions: {
							minValue: -1,
							numberPrecision: 0,
						},
					},
					{
						displayName: 'Thinking Level',
						name: 'thinkingLevel',
						type: 'options',
						default: 'THINKING_LEVEL_UNSPECIFIED',
						description:
							'Controls the thinking level for Gemini 3.x models. Not supported on Gemini 2.5 series (use Thinking Budget instead). If unset, the model uses its default dynamic level.',
						// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
						options: [
							{
								value: 'THINKING_LEVEL_UNSPECIFIED',
								name: 'Default (Dynamic)',
								description: "Use the model's default thinking level",
							},
							{
								value: 'MINIMAL',
								name: 'Minimal',
								description:
									'Near-zero thinking. Only supported on Gemini 3 Flash and Gemini 3.1 Flash-Lite (not supported on Pro models). Requires thought signatures.',
							},
							{
								value: 'LOW',
								name: 'Low',
								description:
									'Low thinking level. Suitable for simpler tasks and high-throughput scenarios.',
							},
							{
								value: 'MEDIUM',
								name: 'Medium',
								description:
									'Medium thinking level. Only supported on Gemini 3 Flash, Gemini 3.1 Pro, and Gemini 3.1 Flash-Lite.',
							},
							{
								value: 'HIGH',
								name: 'High',
								description:
									'High thinking level. Default for Gemini 3 Pro and Gemini 3 Flash. Best for complex reasoning tasks.',
							},
						],
					},
					{
						displayName: 'Top K',
						name: 'topK',
						default: 32,
						typeOptions: { maxValue: 40, minValue: -1, numberPrecision: 1 },
						description:
							'Used to remove "long tail" low probability responses. Defaults to -1, which disables it.',
						type: 'number',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
						type: 'number',
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async gcpProjectsList(this: ILoadOptionsFunctions) {
				const results: Array<{ name: string; value: string }> = [];
				const credentials = await this.getCredentials('googleApi');

				const privateKey = formatPrivateKey(credentials.privateKey as string);
				const email = (credentials.email as string).trim();

				const client = new ProjectsClient({
					credentials: {
						client_email: email,
						private_key: privateKey,
					},
				});

				const [projects] = await client.searchProjects();

				for (const project of projects) {
					if (project.projectId) {
						results.push({
							name: project.displayName ?? project.projectId,
							value: project.projectId,
						});
					}
				}

				return { results };
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('googleApi');

		const privateKey = formatPrivateKey(credentials.privateKey as string);
		const email = (credentials.email as string).trim();
		const region = credentials.region as string;

		const modelName = this.getNodeParameter('modelName', itemIndex) as string;
		const projectId = this.getNodeParameter('projectId', itemIndex, '', {
			extractValue: true,
		}) as string;

		const options = this.getNodeParameter('options', itemIndex, {
			maxOutputTokens: 2048,
			temperature: 0.4,
			topK: 40,
			topP: 0.9,
		}) as {
			maxOutputTokens?: number;
			temperature?: number;
			topK?: number;
			topP?: number;
			thinkingBudget?: number;
			thinkingLevel?: string;
			includeThoughts?: boolean;
		};

		// Collect labels from fixedCollection
		const labelsRaw = this.getNodeParameter('labels.values', itemIndex, []) as Array<{
			key: string;
			value: string;
		}>;
		const labels: Record<string, string> = {};
		for (const label of labelsRaw) {
			if (label.key) {
				labels[label.key] = label.value;
			}
		}

		const safetySettings = this.getNodeParameter(
			'options.safetySettings.values',
			itemIndex,
			null,
		) as SafetySetting[];

		try {
			const modelConfig: ChatVertexAIInput = {
				authOptions: {
					projectId,
					credentials: {
						client_email: email,
						private_key: privateKey,
					},
				},
				location: region,
				model: modelName,
				topK: options.topK,
				topP: options.topP,
				temperature: options.temperature,
				maxOutputTokens: options.maxOutputTokens,
				safetySettings: safetySettings as ChatVertexAIInput['safetySettings'],
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				callbacks: [new N8nLlmTracing(this) as any],
				onFailedAttempt: makeN8nLlmFailedAttemptHandler(this, (error: unknown) => {
					const httpError = error as { response?: { status?: number } };
					const customError = makeErrorFromStatus(Number(httpError?.response?.status), {
						modelName,
					});

					if (customError) {
						throw new NodeOperationError(this.getNode(), error as JsonObject, customError);
					}

					throw error;
				}),
			};

			// Add labels if any were specified
			if (Object.keys(labels).length > 0) {
				modelConfig.labels = labels;
			}

			// Add thinkingBudget if specified (Gemini 2.5 series)
			if (options.thinkingBudget !== undefined) {
				modelConfig.thinkingBudget = options.thinkingBudget;
			}

			// Add thinkingLevel if specified (Gemini 3.x models)
			// Supported natively in @langchain/google-common >= 2.1.26
			// Cast needed because the LangChain type does not include 'MINIMAL',
			// but the Vertex AI REST API accepts it
			if (options.thinkingLevel) {
				modelConfig.thinkingLevel = options.thinkingLevel as ChatVertexAIInput['thinkingLevel'];
			}

			// Use ChatVertexAIWithThinking subclass to inject includeThoughts
			// into the thinkingConfig that LangChain builds, since
			// @langchain/google-common does not propagate includeThoughts
			// as a standalone model parameter
			const model = new ChatVertexAIWithThinking({
				...modelConfig,
				includeThoughts: options.includeThoughts ?? false,
			});

			return {
				response: model,
			};
		} catch (e) {
			// Catch model name validation error from LangChain
			if ((e as Error)?.message?.startsWith('Unable to verify model params')) {
				throw new NodeOperationError(this.getNode(), e as JsonObject, {
					message: 'Unsupported model',
					description: "Only models starting with 'gemini' are supported.",
				});
			}

			// Assume all other exceptions while creating a new ChatVertexAI instance
			// are parameter validation errors
			throw new NodeOperationError(this.getNode(), e as JsonObject, {
				message: 'Invalid options',
				description: (e as Error).message,
			});
		}
	}
}
