import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		rules: {
			// Intentionally reusing the built-in googleApi and googlePalmApi credentials from n8n-nodes-base
			'@n8n/community-nodes/no-credential-reuse': 'off',
			// GoogleGeminiAdvanced uses a separate versionDescription file for the description
			'@n8n/community-nodes/icon-validation': 'off',
			'n8n-nodes-base/node-filename-against-convention': 'off',
		},
	},
];
