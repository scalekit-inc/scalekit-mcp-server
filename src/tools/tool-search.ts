import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ApiError,
  apiJson,
  callerToken,
  describeError,
  getEnvironmentDomain,
  oauthRequired,
  textContent,
} from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { ListToolsResponse, ScalekitTool } from '../types/index.js';
import { environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

/** Actions requested per connector in one backend call. Matches the backend's own default. */
export const TOOLS_PAGE_SIZE = 300;
/** Most connectors one search_tools call may cover, to keep the reply a readable size. */
export const MAX_CONNECTORS_PER_CALL = 5;

interface ConnectorResult {
  connector: string;
  tools: ScalekitTool[];
  totalSize: number;
  nextPageToken?: string;
}

/** Summary format: name and description per action. */
function formatToolsSummary(tools: ScalekitTool[]): string {
  return tools
    .map((t) => {
      const name = (t.definition?.name as string | undefined) ?? t.id;
      const desc = (t.definition?.description as string | undefined) || (t.definition?.display_name as string | undefined) || '';
      return desc ? `  - ${name} — ${desc}` : `  - ${name}`;
    })
    .join('\n');
}

/** Full format: complete definitions with input schemas. */
function formatToolsFull(tools: ScalekitTool[]): string {
  return tools
    .map((tool) => {
      const details = [
        `id: ${tool.id}`,
        tool.tags?.length ? `tags: ${tool.tags.join(', ')}` : null,
        tool.definition ? `definition: ${JSON.stringify(tool.definition)}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `  - ${details}`;
    })
    .join('\n');
}

/** Words of the query, split on spaces and underscores, so "send email" matches gmail_send_email. */
export function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean);
}

/** True when every query word appears in the action's name, display name or description. */
export function toolMatches(tool: ScalekitTool, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [tool.definition?.name, tool.definition?.display_name, tool.definition?.description]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase()
    .replace(/_/g, ' ');
  return words.every((w) => haystack.includes(w));
}

export function registerToolSearchTools(server: McpServer) {
  TOOLS.search_tools.registeredTool = searchToolsTool(server);
}

async function fetchConnectorTools(
  token: string,
  environmentDomain: string,
  connector: string,
  identifier: string | undefined,
  pageToken: string | undefined
): Promise<ConnectorResult> {
  // Only the connector filter is sent. filter.query is never sent: when it is set the backend
  // drops the connector filter and scans every tool, so the keyword is matched here instead.
  const params = new URLSearchParams({ page_size: String(TOOLS_PAGE_SIZE) });
  if (identifier) {
    // Custom connectors: the backend resolves the connected account and adds its own tools.
    params.set('filter.connector', connector);
    params.set('filter.identifier', identifier);
  } else {
    params.set('filter.provider', connector);
  }
  if (pageToken) params.set('page_token', pageToken);

  const data = await apiJson<ListToolsResponse>(token, environmentDomain, 'GET', `${ENDPOINTS.tools.list}?${params.toString()}`);
  const tools = data.tools ?? [];
  return {
    connector,
    tools,
    totalSize: data.total_size ?? tools.length,
    nextPageToken: data.next_page_token || undefined,
  };
}

function searchToolsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.search_tools.name,
    TOOLS.search_tools.description,
    {
      environmentId: environmentIdSchema,
      connectors: z
        .array(z.string().min(1).max(255))
        .min(1, 'Pass at least one connector ID. Find IDs with search_connectors.')
        .max(MAX_CONNECTORS_PER_CALL, `Pass at most ${MAX_CONNECTORS_PER_CALL} connectors per call.`)
        .describe('Connector IDs from search_connectors, for example ["GMAIL", "SLACK"]. For a custom connector, pass its connection name and set identifier.'),
      query: z
        .string()
        .min(3, 'Query must be at least 3 characters')
        .optional()
        .describe('Keyword matched against action name and description, only within these connectors, for example "send email".'),
      summary: z
        .boolean()
        .optional()
        .default(true)
        .describe('true (default): action name and description. false: full definitions with input schemas.'),
      identifier: z
        .string()
        .optional()
        .describe('Connected account identifier. Needed only for custom connectors, whose actions depend on the connected account.'),
      pageToken: z
        .string()
        .optional()
        .describe(`Only with a single connector that has more than ${TOOLS_PAGE_SIZE} actions: the token from the previous reply.`),
    },
    TOOLS.search_tools.annotations,
    async ({ environmentId, connectors, query, summary, identifier, pageToken }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      if (pageToken && connectors.length > 1) {
        return textContent('pageToken works with a single connector only. Pass just the connector the token came from.', { isError: true });
      }

      // Scalekit connector IDs are upper case; dedupe after normalising.
      const ids = [...new Set(connectors.map((c) => c.trim().toUpperCase()))];
      const started = Date.now();

      let environmentDomain: string;
      try {
        environmentDomain = await getEnvironmentDomain(token, environmentId);
      } catch (error) {
        logger.error(`search_tools: environment lookup failed environmentId=${environmentId}: ${describeError(error)}`);
        return textContent('Failed to read the environment. Check the environment ID and retry.', { isError: true });
      }

      const settled = await Promise.allSettled(
        ids.map((id) => fetchConnectorTools(token, environmentDomain, id, identifier, pageToken))
      );
      const failed = settled
        .map((r, i) => ({ r, id: ids[i] }))
        .filter((x): x is { r: PromiseRejectedResult; id: string } => x.r.status === 'rejected');
      if (failed.length) {
        for (const f of failed) {
          logger.error(`search_tools: connector call failed environmentId=${environmentId} connector=${f.id}: ${describeError(f.r.reason)}`);
        }
        const detail = failed
          .map((f) => (f.r.reason instanceof ApiError && f.r.reason.isClientError ? `${f.id} (${f.r.reason.apiMessage})` : f.id))
          .join(', ');
        return textContent(`Failed to load actions for: ${detail}. No partial results were returned. Retry the call.`, { isError: true });
      }

      const results = settled.map((r) => (r as PromiseFulfilledResult<ConnectorResult>).value);
      const words = query ? queryWords(query) : [];
      const sections: string[] = [];
      const notes: string[] = [];
      let total = 0;
      let rows = 0;

      for (const res of results) {
        rows += res.tools.length;
        if (res.tools.length === 0 && !pageToken) {
          notes.push(
            identifier
              ? `No actions for connection "${res.connector}" with identifier "${identifier}". Check that the custom connection exists and that the identifier has a connected account.`
              : `No connector named ${res.connector}. Find the ID with search_connectors.`
          );
          continue;
        }
        const matched = res.tools.filter((t) => toolMatches(t, words));
        total += matched.length;
        if (matched.length) {
          const body = summary ? formatToolsSummary(matched) : formatToolsFull(matched);
          sections.push(`${res.connector} (${matched.length} tool${matched.length === 1 ? '' : 's'}):\n${body}`);
        }
        if (res.nextPageToken) {
          notes.push(
            results.length === 1
              ? `${res.connector} has more than ${TOOLS_PAGE_SIZE} actions (${res.totalSize} total). Next page token: ${res.nextPageToken}`
              : `${res.connector} has more than ${TOOLS_PAGE_SIZE} actions (${res.totalSize} total). Call search_tools with only ${res.connector} to page through the rest.`
          );
        }
      }

      logger.info(
        `search_tools: environmentId=${environmentId} connectors=${ids.join(',')} query=${query ?? ''} summary=${summary} rows=${rows} matches=${total} durationMs=${Date.now() - started}`
      );

      const searchDesc = [`connectors=${ids.join(', ')}`, query ? `query="${query}"` : null].filter(Boolean).join(', ');
      const outputSchemaNote = summary
        ? ''
        : '\n\nNote: Output schemas are not included. For response shapes, see the connector\'s API docs (rest_api_info.base_url and rest_api_info.path_template point at the upstream endpoint).';
      const body = sections.join('\n\n') || '(no matching actions)';
      const noteText = notes.length ? `\n\n${notes.join('\n')}` : '';
      return textContent(`Tools matching ${searchDesc} — ${total} total\n\n${body}${noteText}${outputSchemaNote}`);
    }
  );
}
