/**
 * Inlined from n8n 1.123.12:
 * - packages/@n8n/nodes-langchain/nodes/llms/n8nLlmFailedAttemptHandler.ts
 * - packages/@n8n/nodes-langchain/nodes/llms/n8nDefaultFailedAttemptHandler.ts
 */
import type { ISupplyDataFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type FailedAttemptHandler = (error: unknown) => void;

const STATUS_NO_RETRY = [
	400, // Bad Request
	401, // Unauthorized
	402, // Payment Required
	403, // Forbidden
	404, // Not Found
	405, // Method Not Allowed
	406, // Not Acceptable
	407, // Proxy Authentication Required
	409, // Conflict
];

function n8nDefaultFailedAttemptHandler(error: unknown) {
	const err = error as {
		message?: string;
		name?: string;
		code?: string;
		response?: { status?: number };
		status?: number;
	};

	if (
		err?.message?.startsWith?.('Cancel') ||
		err?.message?.startsWith?.('AbortError') ||
		err?.name === 'AbortError'
	) {
		throw error;
	}

	if (err?.code === 'ECONNABORTED') {
		throw error;
	}

	const status = err?.response?.status ?? err?.status;
	if (status && STATUS_NO_RETRY.includes(+status)) {
		throw error;
	}
}

export const makeN8nLlmFailedAttemptHandler = (
	ctx: ISupplyDataFunctions,
	handler?: FailedAttemptHandler,
): FailedAttemptHandler => {
	return (error: unknown) => {
		try {
			handler?.(error);
			n8nDefaultFailedAttemptHandler(error);
		} catch (e) {
			const apiError = new NodeApiError(ctx.getNode(), e as unknown as JsonObject, {
				functionality: 'configuration-node',
			});

			throw apiError;
		}

		const err = error as { retriesLeft?: number };
		if (err?.retriesLeft && err.retriesLeft > 0) {
			return;
		}

		const apiError = new NodeApiError(ctx.getNode(), error as unknown as JsonObject, {
			functionality: 'configuration-node',
		});

		throw apiError;
	};
};
