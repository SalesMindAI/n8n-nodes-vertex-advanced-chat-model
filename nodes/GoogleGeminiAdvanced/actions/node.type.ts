import type { AllEntities } from 'n8n-workflow';

type NodeMap = {
	audio: 'transcribe' | 'analyze';
	document: 'analyze';
	image: 'analyze';
	video: 'analyze';
};

export type GoogleGeminiAdvancedType = AllEntities<NodeMap>;
