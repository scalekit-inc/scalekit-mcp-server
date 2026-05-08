import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AuthInfo,
  ListAvailableToolsResponse,
  ListToolsResponse,
  ScalekitTool,
} from '../types/index.js';
import { environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

function formatTools(tools: ScalekitTool[]): string {
  return tools
    .map((tool) => {
      const details = [
        `id: ${tool.id}`,
        `provider: ${tool.provider}`,
        tool.tags?.length ? `tags: ${tool.tags.join(', ')}` : null,
        tool.is_default != null ? `is_default: ${tool.is_default}` : null,
        tool.updated_at ? `updated_at: ${tool.updated_at}` : null,
        tool.definition
          ? `definition: ${JSON.stringify(tool.definition)}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `- ${details}`;
    })
    .join('\n');
}

function formatToolNames(names: string[]): string {
  return names.map((name) => `- ${name}`).join('\n');
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
      query: z
        .string()
        .min(3, 'Query must be at least 3 characters')
        .optional()
        .describe('Text search across tool names and descriptions.'),
      provider: z
        .string()
        .optional()
        .describe('Filter by provider name (e.g. "GOOGLE", "NOTION").'),
      identifier: z
        .string()
        .optional()
        .describe(
          'Connected account identifier string. When provided, switches to identifier-scoped mode and lists all tools available for that account.'
        ),
      toolNames: z
        .array(z.string())
        .optional()
        .describe('Filter by specific tool names.'),
      summary: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, return only tool names instead of full tool details.'
        ),
      pageSize: z.number().int().min(1).max(30).optional().default(20),
      pageToken: z
        .string()
        .optional()
        .describe('Opaque token from a previous response to fetch the next page.'),
    },
    async (
      { environmentId, query, provider, identifier, toolNames, summary, pageSize, pageToken },
      context
    ) => {
      if (!query && !provider && !identifier && !toolNames?.length) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'At least one search criterion is required: provide a query, provider, identifier, or toolNames.',
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

        if (identifier) {
          return await listAvailableToolsMode(
            token,
            environmentDomain,
            identifier,
            pageSize,
            pageToken
          );
        }

        return await listToolsMode(
          token,
          environmentDomain,
          { query, provider, toolNames, summary },
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
    query?: string;
    provider?: string;
    toolNames?: string[];
    summary?: boolean;
  },
  pageSize: number,
  pageToken?: string
) {
  const params = new URLSearchParams({
    page_size: String(pageSize),
  });
  if (pageToken) params.set('page_token', pageToken);
  if (filters.query) params.set('filter.query', filters.query);
  if (filters.provider) params.set('filter.provider', filters.provider);
  if (filters.summary) params.set('filter.summary', 'true');
  if (filters.toolNames?.length) {
    for (const name of filters.toolNames) {
      params.append('filter.tool_name', name);
    }
  }

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

  const isSummary = filters.summary && data.tool_names?.length;
  const body = isSummary
    ? formatToolNames(data.tool_names)
    : formatTools(data.tools ?? []);
  const count = data.total_size ?? (isSummary ? data.tool_names?.length : data.tools?.length) ?? 0;
  const pagination = data.next_page_token
    ? `\n\nNext page token: ${data.next_page_token}`
    : '\n\nNo more pages.';
  const prev = data.prev_page_token
    ? `\nPrevious page token: ${data.prev_page_token}`
    : '';

  const searchDesc = [
    filters.query ? `query="${filters.query}"` : null,
    filters.provider ? `provider=${filters.provider}` : null,
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

async function listAvailableToolsMode(
  token: string,
  environmentDomain: string,
  identifier: string,
  pageSize: number,
  pageToken?: string
) {
  const params = new URLSearchParams({
    identifier,
    page_size: String(pageSize),
  });
  if (pageToken) params.set('page_token', pageToken);

  const res = await fetch(
    `${ENDPOINTS.tools.listAvailable}?${params.toString()}`,
    { headers: envHeaders(token, environmentDomain) }
  );

  if (!res.ok) {
    const errorText = await res.text();
    logger.error(
      `Failed to list available tools: ${res.status} ${errorText}`
    );
    throw new Error(`Failed to list available tools: ${res.statusText}`);
  }

  const data = (await res.json()) as ListAvailableToolsResponse;
  const tools = data.tools ?? [];
  const body = formatTools(tools);
  const count = data.total_size ?? tools.length;
  const pagination = data.next_page_token
    ? `\n\nNext page token: ${data.next_page_token}`
    : '\n\nNo more pages.';
  const prev = data.prev_page_token
    ? `\nPrevious page token: ${data.prev_page_token}`
    : '';

  return {
    content: [
      {
        type: 'text' as const,
        text: `Available tools for identifier "${identifier}" — ${count} total\n\n${body || '(no tools found)'}${pagination}${prev}`,
      },
    ],
  };
}
