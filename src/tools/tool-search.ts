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
        .describe('Filter by connector (e.g. "GOOGLE", "HUBSPOT", "NOTION").'),
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
      { environmentId, connector, query, summary, pageSize, pageToken },
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
          { connector, query, summary },
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

async function listToolsMode(
  token: string,
  environmentDomain: string,
  filters: {
    connector?: string;
    query?: string;
    summary?: boolean;
  },
  pageSize: number,
  pageToken?: string
) {
  const params = new URLSearchParams({
    page_size: String(pageSize),
  });
  if (pageToken) params.set('page_token', pageToken);
  if (filters.connector) params.set('filter.provider', filters.connector.toUpperCase());
  if (filters.query) params.set('filter.query', filters.query);

  const res = await fetch(
    `${ENDPOINTS.tools.list}?${params.toString()}`,
    { headers: envHeaders(token, environmentDomain) }
  );

  if (!res.ok) {
    const errorText = await res.text();
    logger.error(`Failed to search tools: ${res.status} ${errorText}`);
    throw new Error(`Failed to search tools: ${res.statusText}`);
  }

  const data = (await res.json()) as ListToolsResponse;
  const tools = data.tools ?? [];
  const count = data.total_size ?? tools.length;

  const body = filters.summary
    ? formatToolsSummary(tools)
    : formatToolsFull(tools);

  const pagination = data.next_page_token
    ? `\n\nNext page token: ${data.next_page_token}`
    : '';
  const prev = data.prev_page_token
    ? `\nPrevious page token: ${data.prev_page_token}`
    : '';

  const searchDesc = [
    filters.connector ? `connector=${filters.connector}` : null,
    filters.query ? `query="${filters.query}"` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    content: [
      {
        type: 'text' as const,
        text: `Tools${searchDesc ? ` matching ${searchDesc}` : ''} — ${count} total\n\n${body || '(no tools found)'}${pagination}${prev}`,
      },
    ],
  };
}
