/**
 * Inlined from n8n 1.123.12: packages/@n8n/nodes-langchain/nodes/llms/N8nLlmTracing.ts
 *
 * Modified to use character-based token estimation instead of tiktoken,
 * avoiding the need to bundle BPE JSON files. The estimation uses an
 * approximate 4 characters per token ratio (standard for GPT-4 class models).
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { SerializedFields } from '@langchain/core/dist/load/map_keys';
import type {
	Serialized,
	SerializedNotImplemented,
	SerializedSecret,
} from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import pick from 'lodash/pick';
import type { IDataObject, ISupplyDataFunctions, JsonObject } from 'n8n-workflow';
import { NodeConnectionTypes, NodeError, NodeOperationError, jsonStringify } from 'n8n-workflow';

/** Average characters per token for GPT-4 class models */
const CHARS_PER_TOKEN = 4.0;

type TokensUsageParser = (result: LLMResult) => {
	completionTokens: number;
	promptTokens: number;
	totalTokens: number;
};

type RunDetail = {
	index: number;
	messages: BaseMessage[] | string[] | string;
	options: SerializedSecret | SerializedNotImplemented | SerializedFields;
};

function logAiEvent(executeFunctions: ISupplyDataFunctions, event: string, data?: IDataObject) {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(executeFunctions as any).logAiEvent(event, data ? jsonStringify(data) : undefined);
	} catch {
		executeFunctions.logger.debug(`Error logging AI event: ${event}`);
	}
}

function estimateTokensFromStrings(list: string[]): number {
	let totalChars = 0;
	for (const text of list) {
		if (typeof text === 'string') {
			totalChars += text.length;
		}
	}
	return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

export class N8nLlmTracing extends BaseCallbackHandler {
	name = 'N8nLlmTracing';

	// This flag makes sure that LangChain will wait for the handlers to finish before continuing
	awaitHandlers = true;

	connectionType = NodeConnectionTypes.AiLanguageModel;

	promptTokensEstimate = 0;

	completionTokensEstimate = 0;

	#parentRunIndex?: number;

	/**
	 * A map to associate LLM run IDs to run details.
	 */
	runsMap: Record<string, RunDetail> = {};

	options = {
		tokensUsageParser: (result: LLMResult) => {
			const completionTokens = (result?.llmOutput?.tokenUsage?.completionTokens as number) ?? 0;
			const promptTokens = (result?.llmOutput?.tokenUsage?.promptTokens as number) ?? 0;

			return {
				completionTokens,
				promptTokens,
				totalTokens: completionTokens + promptTokens,
			};
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		errorDescriptionMapper: (error: any) => error.description as string,
	};

	constructor(
		private executionFunctions: ISupplyDataFunctions,
		options?: {
			tokensUsageParser?: TokensUsageParser;
			errorDescriptionMapper?: (error: NodeError) => string;
		},
	) {
		super();
		this.options = { ...this.options, ...options };
	}

	estimateTokensFromGeneration(generations: LLMResult['generations']): number {
		const messages = generations.flatMap((gen) => gen.map((g) => g.text));
		return estimateTokensFromStrings(messages);
	}

	async handleLLMEnd(output: LLMResult, runId: string) {
		const runDetails = this.runsMap[runId] ?? { index: Object.keys(this.runsMap).length };

		output.generations = output.generations.map((gen) =>
			gen.map((g) => pick(g, ['text', 'generationInfo'])),
		);

		const tokenUsageEstimate = {
			completionTokens: 0,
			promptTokens: 0,
			totalTokens: 0,
		};
		const tokenUsage = this.options.tokensUsageParser(output);

		if (output.generations.length > 0) {
			tokenUsageEstimate.completionTokens = this.estimateTokensFromGeneration(output.generations);

			tokenUsageEstimate.promptTokens = this.promptTokensEstimate;
			tokenUsageEstimate.totalTokens =
				tokenUsageEstimate.completionTokens + this.promptTokensEstimate;
		}
		const response: {
			response: { generations: LLMResult['generations'] };
			tokenUsageEstimate?: typeof tokenUsageEstimate;
			tokenUsage?: typeof tokenUsage;
		} = {
			response: { generations: output.generations },
		};

		if (tokenUsage.completionTokens > 0) {
			response.tokenUsage = tokenUsage;
		} else {
			response.tokenUsageEstimate = tokenUsageEstimate;
		}

		const parsedMessages =
			typeof runDetails.messages === 'string'
				? runDetails.messages
				: runDetails.messages.map((message) => {
						if (typeof message === 'string') return message;
						if (typeof message?.toJSON === 'function') return message.toJSON();

						return message;
					});

		const sourceNodeRunIndex =
			this.#parentRunIndex !== undefined ? this.#parentRunIndex + runDetails.index : undefined;

		this.executionFunctions.addOutputData(
			this.connectionType,
			runDetails.index,
			[[{ json: { ...response } }]],
			undefined,
			sourceNodeRunIndex,
		);

		logAiEvent(this.executionFunctions, 'ai-llm-generated-output', {
			messages: parsedMessages,
			options: runDetails.options,
			response,
		} as unknown as IDataObject);
	}

	async handleLLMStart(llm: Serialized, prompts: string[], runId: string) {
		const estimatedTokens = estimateTokensFromStrings(prompts);
		const sourceNodeRunIndex =
			this.#parentRunIndex !== undefined
				? this.#parentRunIndex + this.executionFunctions.getNextRunIndex()
				: undefined;

		const options = llm.type === 'constructor' ? llm.kwargs : llm;
		const { index } = this.executionFunctions.addInputData(
			this.connectionType,
			[
				[
					{
						json: {
							messages: prompts,
							estimatedTokens,
							options,
						},
					},
				],
			],
			sourceNodeRunIndex,
		);

		this.runsMap[runId] = {
			index,
			options,
			messages: prompts,
		};
		this.promptTokensEstimate = estimatedTokens;
	}

	async handleLLMError(error: IDataObject | Error, runId: string, parentRunId?: string) {
		const runDetails = this.runsMap[runId] ?? { index: Object.keys(this.runsMap).length };

		// Filter out non-x- headers to avoid leaking sensitive information in logs
		if (typeof error === 'object' && Object.prototype.hasOwnProperty.call(error, 'headers')) {
			const errorWithHeaders = error as { headers: Record<string, unknown> };

			Object.keys(errorWithHeaders.headers).forEach((key) => {
				if (!key.startsWith('x-')) {
					delete errorWithHeaders.headers[key];
				}
			});
		}

		if (error instanceof NodeError) {
			if (this.options.errorDescriptionMapper) {
				error.description = this.options.errorDescriptionMapper(error);
			}

			this.executionFunctions.addOutputData(this.connectionType, runDetails.index, error);
		} else {
			this.executionFunctions.addOutputData(
				this.connectionType,
				runDetails.index,
				new NodeOperationError(this.executionFunctions.getNode(), error as JsonObject, {
					functionality: 'configuration-node',
				}),
			);
		}

		logAiEvent(this.executionFunctions, 'ai-llm-errored', {
			error: Object.keys(error).length === 0 ? error.toString() : error,
			runId,
			parentRunId,
		} as unknown as IDataObject);
	}

	setParentRunIndex(runIndex: number) {
		this.#parentRunIndex = runIndex;
	}
}
