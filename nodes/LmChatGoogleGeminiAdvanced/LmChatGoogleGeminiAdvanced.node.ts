import type { SafetySetting } from '@google/generative-ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';
import {
	N8nLlmTracing,
	makeN8nLlmFailedAttemptHandler,
	getConnectionHintNoticeField,
} from '@n8n/ai-utilities';

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

/**
 * Subclass of ChatGoogleGenerativeAI that injects `labels` into every
 * generateContent / generateContentStream request body.
 *
 * The underlying `@google/generative-ai` SDK serialises the request object
 * with `JSON.stringify(params)`, so any extra properties we add will be
 * included in the HTTP body sent to `generativelanguage.googleapis.com`.
 * The Gemini API accepts a `labels` field on GenerateContentRequest for
 * billing cost tracking.
 */
class ChatGoogleGenerativeAIWithLabels extends ChatGoogleGenerativeAI {
	private labels: Record<string, string>;

	constructor(
		fields: ConstructorParameters<typeof ChatGoogleGenerativeAI>[0] & {
			labels?: Record<string, string>;
		},
	) {
		super(fields);
		this.labels = fields.labels ?? {};
	}

	/**
	 * Override invocationParams to inject `labels` into the request object.
	 * Both `_generate` and `_streamResponseChunks` spread the result of
	 * `invocationParams()` into the request body, so labels will be included
	 * automatically.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	invocationParams(options?: any): any {
		const params = super.invocationParams(options);
		if (Object.keys(this.labels).length > 0) {
			return { ...params, labels: this.labels };
		}
		return params;
	}
}

function errorDescriptionMapper(error: { description?: string | null }) {
	if (error.description?.includes('properties: should be non-empty for OBJECT type')) {
		return 'Google Gemini requires at least one <a href="https://docs.n8n.io/advanced-ai/examples/using-the-fromai-function/" target="_blank">dynamic parameter</a> when using tools';
	}

	return error.description ?? 'Unknown error';
}

export class LmChatGoogleGeminiAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Gemini Advanced Chat Model',
		name: 'lmChatGoogleGeminiAdvanced',
		icon: 'file:google.svg',
		group: ['transform'],
		version: [1],
		description: 'Google Gemini Chat Model with labels support for billing cost tracking',
		defaults: {
			name: 'Google Gemini Advanced Chat Model',
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
						url: 'https://ai.google.dev/gemini-api/docs',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'googlePalmApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials.host }}',
		},
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				displayName: 'Model',
				name: 'modelName',
				type: 'options',
				description:
					'The model which will generate the completion. <a href="https://developers.generativeai.google/api/rest/generativelanguage/models/list">Learn more</a>.',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/v1beta/models',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'models',
										},
									},
									{
										type: 'filter',
										properties: {
											pass: "={{ !$responseItem.name.includes('embedding') }}",
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{$responseItem.name}}',
											value: '={{$responseItem.name}}',
											description: '={{$responseItem.description}}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
									},
								],
							},
						},
					},
				},
				routing: {
					send: {
						type: 'body',
						property: 'model',
					},
				},
				default: 'models/gemini-2.5-flash',
			},
			{
				displayName: 'Labels',
				name: 'labels',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: { values: [] },
				placeholder: 'Add Label',
				description:
					'Labels to apply to the request for billing cost tracking. Keys and values must be strings.',
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
						displayName: 'Thinking Level',
						name: 'thinkingLevel',
						type: 'options',
						default: '',
						description:
							'Controls the thinking level for Gemini 3.x models. Not supported on Gemini 2.5 series (use Thinking Budget instead). If unset, the model uses its default dynamic level.',
						// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
						options: [
							{
								value: '',
								name: 'Default (Dynamic)',
								description: "Use the model's default thinking level",
							},
							{
								value: 'MINIMAL',
								name: 'Minimal',
								description: 'Minimal thinking — model will likely not think, but may still do so',
							},
							{
								value: 'LOW',
								name: 'Low',
								description: 'Low thinking level',
							},
							{
								value: 'MEDIUM',
								name: 'Medium',
								description: 'Medium thinking level',
							},
							{
								value: 'HIGH',
								name: 'High',
								description: 'High thinking level (default for Gemini 3)',
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

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('googlePalmApi');

		const modelName = this.getNodeParameter('modelName', itemIndex) as string;

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
			thinkingLevel?: string;
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
			// Build thinkingConfig if thinkingLevel is specified
			const thinkingConfig = options.thinkingLevel
				? {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						thinkingLevel: options.thinkingLevel as any,
					}
				: undefined;

			const model = new ChatGoogleGenerativeAIWithLabels({
				apiKey: credentials.apiKey as string,
				baseUrl: credentials.host as string,
				model: modelName,
				topK: options.topK,
				topP: options.topP,
				temperature: options.temperature,
				maxOutputTokens: options.maxOutputTokens,
				safetySettings,
				labels,
				thinkingConfig,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				callbacks: [new N8nLlmTracing(this, { errorDescriptionMapper }) as any],
				onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			});

			return {
				response: model,
			};
		} catch (e) {
			throw new NodeOperationError(this.getNode(), e as Error, {
				message: 'Invalid options',
				description: (e as Error).message,
			});
		}
	}
}
