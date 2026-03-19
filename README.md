# n8n-nodes-vertex-advanced-chat-model

This is an n8n community node. It lets you use **Google Vertex AI** generative models (Gemini) as a chat model in your n8n AI workflows, with added support for **request labels** for billing cost tracking.

[Google Vertex AI](https://cloud.google.com/vertex-ai) is Google Cloud's machine learning platform that provides access to Gemini and other generative AI models.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) |
[Credentials](#credentials) |
[Node Reference](#node-reference) |
[Compatibility](#compatibility) |
[Usage](#usage) |
[Resources](#resources) |
[Version History](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Credentials

This node reuses the built-in **Google Service Account API** credential (`googleApi`) that ships with n8n. You do not need to configure a new credential type.

To set up the credential you need:

1. A **Google Cloud project** with the Vertex AI API enabled.
2. A **service account** with the `Vertex AI User` role (or equivalent).
3. A **JSON key file** for that service account.

In the n8n credential form, fill in:

| Field                     | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| **Service Account Email** | The `client_email` from the JSON key file                  |
| **Private Key**           | The `private_key` from the JSON key file                   |
| **Region**                | The GCP region to use (e.g. `us-central1`, `europe-west1`) |

## Node Reference

The **Google Vertex Advanced Chat Model** node is an AI sub-node that outputs a language model. Connect it to an AI Agent, AI Chain, or any node that accepts an AI Language Model input.

### Parameters

| Parameter      | Description                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project ID** | Your Google Cloud project ID. Select from a dropdown list or enter manually.                                                                                                                                        |
| **Model Name** | The Gemini model to use (default: `gemini-2.5-flash`). See [available models](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models).                                                                  |
| **Labels**     | Key-value pairs attached to each API request for billing cost tracking. See [Vertex AI labels documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters#add-labels). |

### Options

| Option                       | Description                                                | Default |
| ---------------------------- | ---------------------------------------------------------- | ------- |
| **Maximum Number of Tokens** | Max tokens to generate in the completion                   | 2048    |
| **Safety Settings**          | Configure content safety filters by category and threshold | -       |
| **Sampling Temperature**     | Controls randomness (0 = deterministic, 1 = creative)      | 0.4     |
| **Thinking Budget**          | Reasoning tokens for thinking models (-1 = dynamic)        | -1      |
| **Top K**                    | Limits token selection to top K candidates (-1 = disabled) | 32      |
| **Top P**                    | Nucleus sampling threshold                                 | 1       |

### What makes this different from the built-in node?

The built-in `Google Vertex Chat Model` node (`lmChatGoogleVertex`) does not support the **Labels** parameter. This node adds that capability, allowing you to tag every Vertex AI API request with custom key-value labels for cost attribution, team tracking, environment tagging, or any other billing dimension supported by Google Cloud.

## Compatibility

- **Minimum n8n version**: 1.123.12
- **Tested with**: n8n 1.123.12 (self-hosted)
- **Not compatible with n8n Cloud** (uses bundled dependencies)
- **Bundled dependencies**: `@langchain/google-vertexai@2.0.0` and `@google-cloud/resource-manager@5.3.0`, matching the versions shipped with n8n 1.123.12.
- **Runtime dependencies** (provided by n8n): `n8n-workflow`, `@langchain/core`, `lodash`

## Usage

1. Add an **AI Agent** or **AI Chain** node to your workflow.
2. Connect the **Google Vertex Advanced Chat Model** node to the model input.
3. Select your Google Service Account credential.
4. Choose your project and model.
5. (Optional) Add labels for billing tracking, e.g. `team: sales`, `env: production`.

### Example: Cost tracking with labels

Add labels to attribute API costs to specific teams or projects:

- Key: `team`, Value: `marketing`
- Key: `project`, Value: `content-generation`
- Key: `environment`, Value: `production`

These labels will appear in your Google Cloud billing reports, allowing you to break down Vertex AI costs by any dimension you define.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Google Vertex AI documentation](https://cloud.google.com/vertex-ai/generative-ai/docs)
- [Vertex AI available models](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
- [Vertex AI labels for billing](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters#add-labels)

## Version History

### 1.0.0

Initial release.

- Google Vertex AI Chat Model with full feature parity with the built-in node
- Added **Labels** parameter for billing cost tracking
- Project ID dropdown with GCP project list
- All standard options: temperature, top K, top P, max tokens, safety settings, thinking budget
- Self-contained: all n8n internal utilities (tracing, error handling, connection hints) are inlined for compatibility with n8n 1.x
