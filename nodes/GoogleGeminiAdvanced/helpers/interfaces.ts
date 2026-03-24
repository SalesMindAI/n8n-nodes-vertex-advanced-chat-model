import type { IDataObject } from 'n8n-workflow';

export interface GenerateContentGenerationConfig {
	maxOutputTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
	candidateCount?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	responseMimeType?: string;
	thinkingConfig?: {
		thinkingBudget?: number;
	};
}

export interface GenerateContentRequest extends IDataObject {
	contents: Content[];
	generationConfig?: GenerateContentGenerationConfig;
	systemInstruction?: { parts: Array<{ text: string }> };
	labels?: Record<string, string>;
}

export interface GenerateContentResponse {
	candidates: Array<{
		content: Content;
	}>;
}

export interface Content {
	parts: Part[];
	role: string;
}

export type Part =
	| { text: string }
	| {
			inlineData: {
				mimeType: string;
				data: string;
			};
	  }
	| {
			functionCall: {
				id?: string;
				name: string;
				args?: IDataObject;
			};
	  }
	| {
			functionResponse: {
				id?: string;
				name: string;
				response: IDataObject;
			};
	  }
	| {
			fileData?: {
				mimeType?: string;
				fileUri?: string;
			};
	  };
