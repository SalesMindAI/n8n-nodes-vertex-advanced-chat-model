import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		rules: {
			// Intentionally reusing the built-in googleApi credential from n8n-nodes-base
			'@n8n/community-nodes/no-credential-reuse': 'off',
		},
	},
];
