import { NodeConnectionTypes, type INodeTypeDescription } from 'n8n-workflow';

import * as audio from './audio';
import * as document from './document';
import * as image from './image';
import * as video from './video';

export const versionDescription: INodeTypeDescription = {
	displayName: 'Google Gemini Advanced',
	name: 'googleGeminiAdvanced',
	icon: 'file:gemini.svg',
	group: ['transform'],
	version: [1],
	subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
	description:
		'Interact with Google Gemini AI models with labels support for billing cost tracking',
	defaults: {
		name: 'Google Gemini Advanced',
	},
	codex: {
		alias: ['video', 'document', 'audio', 'transcribe'],
		categories: ['AI'],
		subcategories: {
			AI: ['Agents', 'Miscellaneous', 'Root Nodes'],
		},
		resources: {
			primaryDocumentation: [
				{
					url: 'https://ai.google.dev/gemini-api/docs',
				},
			],
		},
	},
	inputs: [NodeConnectionTypes.Main],
	outputs: [NodeConnectionTypes.Main],
	credentials: [
		{
			name: 'googlePalmApi',
			required: true,
		},
	],
	properties: [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: [
				{
					name: 'Audio',
					value: 'audio',
				},
				{
					name: 'Document',
					value: 'document',
				},
				{
					name: 'Image',
					value: 'image',
				},
				{
					name: 'Video',
					value: 'video',
				},
			],
			default: 'audio',
		},
		...audio.description,
		...document.description,
		...image.description,
		...video.description,
	],
};
