import type { INodeProperties } from 'n8n-workflow';

export const modelRLC = (searchListMethod: string): INodeProperties => ({
	displayName: 'Model',
	name: 'modelId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod,
				searchable: true,
			},
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. models/gemini-2.5-flash',
		},
	],
});

export const labelsProperty: INodeProperties = {
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
};
