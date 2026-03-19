/**
 * Inlined from n8n 1.123.12: packages/@n8n/nodes-langchain/utils/sharedFields.ts
 * Only the getConnectionHintNoticeField function is included.
 */
import { NodeConnectionTypes } from 'n8n-workflow';
import type { INodeProperties } from 'n8n-workflow';

const connectionsString: Record<string, { connection: string; locale: string }> = {
	[NodeConnectionTypes.AiAgent]: {
		connection: '',
		locale: 'AI Agent',
	},
	[NodeConnectionTypes.AiChain]: {
		connection: '',
		locale: 'AI Chain',
	},
	[NodeConnectionTypes.AiDocument]: {
		connection: NodeConnectionTypes.AiDocument,
		locale: 'Document Loader',
	},
	[NodeConnectionTypes.AiVectorStore]: {
		connection: NodeConnectionTypes.AiVectorStore,
		locale: 'Vector Store',
	},
	[NodeConnectionTypes.AiRetriever]: {
		connection: NodeConnectionTypes.AiRetriever,
		locale: 'Vector Store Retriever',
	},
};

type AllowedConnectionTypes =
	| typeof NodeConnectionTypes.AiAgent
	| typeof NodeConnectionTypes.AiChain
	| typeof NodeConnectionTypes.AiDocument
	| typeof NodeConnectionTypes.AiVectorStore
	| typeof NodeConnectionTypes.AiRetriever;

function determineArticle(nextWord: string): string {
	const vowels = /^[aeiouAEIOU]/;
	return vowels.test(nextWord) ? 'an' : 'a';
}

const getConnectionParameterString = (connectionType: string) => {
	if (connectionType === '') return "data-action-parameter-creatorview='AI'";
	return `data-action-parameter-connectiontype='${connectionType}'`;
};

const getAhref = (connectionType: { connection: string; locale: string }) =>
	`<a class="test" data-action='openSelectiveNodeCreator'${getConnectionParameterString(
		connectionType.connection,
	)}'>${connectionType.locale}</a>`;

export function getConnectionHintNoticeField(
	connectionTypes: AllowedConnectionTypes[],
): INodeProperties {
	const groupedConnections = new Map<string, string[]>();

	connectionTypes.forEach((connectionType) => {
		const connectionString = connectionsString[connectionType].connection;
		const localeString = connectionsString[connectionType].locale;

		if (!groupedConnections.has(connectionString)) {
			groupedConnections.set(connectionString, [localeString]);
			return;
		}

		groupedConnections.get(connectionString)?.push(localeString);
	});

	let displayName;

	if (groupedConnections.size === 1) {
		const [[connection, locales]] = Array.from(groupedConnections);

		displayName = `This node must be connected to ${determineArticle(locales[0])} ${locales[0]
			.toLowerCase()
			.replace(
				/^ai /,
				'AI ',
			)}. <a data-action='openSelectiveNodeCreator' ${getConnectionParameterString(
			connection,
		)}>Insert one</a>`;
	} else {
		const ahrefs = Array.from(groupedConnections, ([connection, locales]) => {
			const locale =
				locales.length > 1
					? locales
							.map((localeString, index, { length }) => {
								return (
									(index === 0 ? `${determineArticle(localeString)} ` : '') +
									(index < length - 1 ? `${localeString} or ` : localeString)
								);
							})
							.join('')
					: `${determineArticle(locales[0])} ${locales[0]}`;
			return getAhref({ connection, locale });
		});

		displayName = `This node needs to be connected to ${ahrefs.join(' or ')}.`;
	}

	return {
		displayName,
		name: 'notice',
		type: 'notice',
		default: '',
		typeOptions: {
			containerClass: 'ndv-connection-hint-notice',
		},
	};
}
