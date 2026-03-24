import type { INodeProperties } from 'n8n-workflow';

import * as analyze from './analyze.operation';

export { analyze };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Analyze Video',
				value: 'analyze',
				action: 'Analyze video',
				description: 'Take in videos and answer questions about them',
			},
		],
		default: 'analyze',
		displayOptions: {
			show: {
				resource: ['video'],
			},
		},
	},
	...analyze.description,
];
