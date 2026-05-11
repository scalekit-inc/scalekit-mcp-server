import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AuthInfo,
  ListToolsResponse,
  ScalekitTool,
} from '../types/index.js';
import { environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

/** Summary format: group tools by connector, show name + short description. */
function formatToolsSummary(tools: ScalekitTool[]): string {
  const grouped = new Map<string, ScalekitTool[]>();
  for (const tool of tools) {
    const key = tool.provider || 'UNKNOWN';
    const list = grouped.get(key) ?? [];
    list.push(tool);
    grouped.set(key, list);
  }
  const sections: string[] = [];
  for (const [connector, connectorTools] of grouped) {
    const lines = connectorTools.map((t) => {
      const desc = t.definition?.description || t.definition?.display_name || '';
      return desc ? `  - ${t.definition?.name ?? t.id} — ${desc}` : `  - ${t.definition?.name ?? t.id}`;
    });
    sections.push(`${connector} (${connectorTools.length} tool${connectorTools.length === 1 ? '' : 's'}):\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}

/** Full format: complete tool definitions with input schemas. */
function formatToolsFull(tools: ScalekitTool[]): string {
  const rows = tools
    .map((tool) => {
      const details = [
        `id: ${tool.id}`,
        `connector: ${tool.provider}`,
        tool.tags?.length ? `tags: ${tool.tags.join(', ')}` : null,
        tool.definition
          ? `definition: ${JSON.stringify(tool.definition)}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `- ${details}`;
    })
    .join('\n');
  return rows + '\n\nNote: Output schemas are not included in tool definitions. For response structures, refer to the connector\'s official API documentation (see rest_api_info.base_url and rest_api_info.path_template for the upstream endpoint).';
}

export function registerToolSearchTools(server: McpServer) {
  TOOLS.search_tools.registeredTool = searchToolsTool(server);
}

function searchToolsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.search_tools.name,
    TOOLS.search_tools.description,
    {
      environmentId: environmentIdSchema,
      connector: z
        .string()
        .optional()
        .describe('For standard connectors, the connector identifier as returned by search_connectors (e.g. "GMAIL", "HUBSPOT", "NOTION", "SLACK"). For custom connectors, the connection name (e.g. "My Sentry", "Bitly Production").'),
      identifier: z
        .string()
        .optional()
        .describe('The connected account identifier (e.g. a user ID, email, or app-specific key stored by the developer). Required when searching tools for a custom connector. This is the same identifier used when creating the connected account.'),
      query: z
        .string()
        .min(3, 'Query must be at least 3 characters')
        .optional()
        .describe('Search by action or capability (e.g. "search contacts", "send email", "create deal").'),
      summary: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'When true (default), returns tools grouped by connector with name and description. Set to false for full tool definitions including input schemas.'
        ),
      pageSize: z.number().int().min(1).max(30).optional().default(20),
      pageToken: z
        .string()
        .optional()
        .describe('Opaque token from a previous response to fetch the next page.'),
    },
    async (
      { environmentId, connector, identifier, query, summary, pageSize, pageToken },
      context
    ) => {
      if (!connector && !query) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'At least one search criterion is required: provide a connector or query.',
            },
          ],
        };
      }

      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(
          token,
          environmentId
        );

        return await listToolsMode(
          token,
          environmentDomain,
          { connector, identifier, query, summary },
          pageSize,
          pageToken
        );
      } catch (error) {
        logger.error('Failed to search tools', error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to search tools. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

async function fetchTools(
  token: string,
  environmentDomain: string,
  apiFilters: { provider?: string; query?: string; connector?: string; identifier?: string },
  pageSize: number,
  pageToken?: string
): Promise<ListToolsResponse> {
  const params = new URLSearchParams({ page_size: String(pageSize) });
  if (pageToken) params.set('page_token', pageToken);
  if (apiFilters.provider) params.set('filter.provider', apiFilters.provider);
  if (apiFilters.query) params.set('filter.query', apiFilters.query);
  if (apiFilters.connector) params.set('filter.connector', apiFilters.connector);
  if (apiFilters.identifier) params.set('filter.identifier', apiFilters.identifier);

  const res = await fetch(
    `${ENDPOINTS.tools.list}?${params.toString()}`,
    { headers: envHeaders(token, environmentDomain) }
  );

  if (!res.ok) {
    const errorText = await res.text();
    logger.error(`Failed to search tools: ${res.status} ${errorText}`);
    throw new Error(`Failed to search tools: ${res.statusText}`);
  }

  return (await res.json()) as ListToolsResponse;
}

async function listToolsMode(
  token: string,
  environmentDomain: string,
  filters: {
    connector?: string;
    identifier?: string;
    query?: string;
    summary?: boolean;
  },
  pageSize: number,
  pageToken?: string
) {
  const connector = filters.connector?.toUpperCase();
  let data: ListToolsResponse;
  let tools: ScalekitTool[];
  let clientFiltered = false;

  if (connector && filters.identifier) {
    // Identifier provided: use filter.connector + filter.identifier so the backend
    // resolves the connected account and includes custom MCP tools.
    data = await fetchTools(token, environmentDomain, { connector, identifier: filters.identifier, query: filters.query }, pageSize, pageToken);
    tools = data.tools ?? [];
    if (tools.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No tools found for connection "${filters.connector}" with identifier "${filters.identifier}". This usually means either: (1) a custom connection has not been created for this connector in the environment, or (2) a connected account has not been set up for this identifier. Verify both in the Scalekit dashboard before retrying.`,
        }],
      };
    }
  } else if (connector) {
    // Standard connector: filter by provider
    data = await fetchTools(token, environmentDomain, { provider: connector, query: filters.query }, pageSize, pageToken);
    tools = data.tools ?? [];

    // If exact match returns nothing, fall back to client-side partial match
    if (tools.length === 0 && !pageToken) {
      data = await fetchTools(token, environmentDomain, { query: filters.query }, pageSize);
      tools = (data.tools ?? []).filter(
        (t) => t.provider?.toUpperCase().includes(connector)
      );
      clientFiltered = true;
    }
  } else {
    data = await fetchTools(token, environmentDomain, { query: filters.query }, pageSize, pageToken);
    tools = data.tools ?? [];
  }

  const count = clientFiltered ? tools.length : (data.total_size ?? tools.length);

  const body = filters.summary
    ? formatToolsSummary(tools)
    : formatToolsFull(tools);

  const pagination = !clientFiltered && data.next_page_token
    ? `\n\nNext page token: ${data.next_page_token}`
    : '';
  const prev = !clientFiltered && data.prev_page_token
    ? `\nPrevious page token: ${data.prev_page_token}`
    : '';

  const searchDesc = [
    filters.connector ? `connector=${filters.connector}` : null,
    filters.query ? `query="${filters.query}"` : null,
  ]
    .filter(Boolean)
    .join(', ');

  // When searching by query alone, hint that custom connector tools require
  // connector + identifier to be found.
  const customToolHint = !filters.identifier
    ? '\n\nNote: This search only covers standard connector tools. To search tools from custom connectors, also provide the connection name (in the connector param) and the connected account identifier (the identifier used when the connected account was created).'
    : '';

  return {
    content: [
      {
        type: 'text' as const,
        text: `Tools${searchDesc ? ` matching ${searchDesc}` : ''} — ${count} total\n\n${body || '(no tools found)'}${pagination}${prev}${customToolHint}`,
      },
    ],
  };
}
