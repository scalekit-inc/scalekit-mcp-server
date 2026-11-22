import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ApiError,
  apiErrorResult,
  apiJson,
  callerToken,
  describeError,
  getEnvironmentDomain,
  oauthRequired,
  textContent,
} from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { fetchAllPages, PagingError, SERVER_PAGE_SIZE } from '../lib/paging.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AppConnection,
  ListAgentkitConnectionsResponse,
  ListAppConnectionsResponse,
  ListProvidersResponse,
  Provider,
} from '../types/index.js';
import { environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

type ConnectorType = 'SCALEKIT' | 'CUSTOM' | 'ALL';

/** Prefix for the page tokens this server makes when it pages keyword matches itself. */
const LOCAL_PAGE_TOKEN_PREFIX = 'csearch_';

/**
 * Connector traits read from its auth patterns:
 * - scalekitCredentials: a connection can use Scalekit-managed OAuth credentials
 *   (oauth_config.allow_use_scalekit_credentials), so the customer needs no OAuth app of their own.
 * - mcp: the connector is served through an MCP server (is_mcp).
 * - authTypes: the auth types the connector supports, for example OAUTH or API_KEY.
 */
export function connectorTraits(p: Provider): { scalekitCredentials: boolean; mcp: boolean; authTypes: string[] } {
  const patterns = Array.isArray(p.auth_patterns) ? p.auth_patterns : [];
  return {
    scalekitCredentials: patterns.some((a) => a?.oauth_config?.allow_use_scalekit_credentials === true),
    mcp: patterns.some((a) => a?.is_mcp === true),
    authTypes: [...new Set(patterns.map((a) => a?.type).filter((t): t is string => typeof t === 'string' && t.length > 0))],
  };
}

export function registerConnectorTools(server: McpServer) {
  TOOLS.search_connectors.registeredTool = searchConnectorsTool(server);
  TOOLS.get_connector.registeredTool = getConnectorTool(server);
}

/** The backend calls Scalekit-maintained connectors DEFAULT. */
function providerTypeParam(connectorType: ConnectorType): string {
  return connectorType === 'SCALEKIT' ? 'DEFAULT' : connectorType;
}

function formatProviders(providers: Provider[], setupMap?: Map<string, AppConnection[]>): string {
  return providers
    .map((p) => {
      const traits = connectorTraits(p);
      const details = [
        `identifier: ${p.identifier}`,
        `display_name: ${p.display_name}`,
        p.description ? `description: ${p.description}` : null,
        p.categories?.length ? `categories: ${p.categories.join(', ')}` : null,
        `scalekit_credentials: ${traits.scalekitCredentials ? 'available' : 'not available'}`,
        traits.mcp ? 'mcp: true' : null,
        p.is_custom ? `custom: true` : null,
        p.is_custom_mcp ? `custom_mcp: true` : null,
        p.coming_soon ? `coming_soon: true` : null,
        p.proxy_enabled ? `proxy_url: ${p.proxy_url}` : null,
      ];
      if (setupMap) details.push(`setup: ${formatSetup(setupMap.get(p.identifier))}`);
      return `- ${details.filter(Boolean).join(' | ')}`;
    })
    .join('\n');
}

/** Compact one-line-per-connector format for `all: true`, so the whole catalog fits in one reply. */
function formatProvidersCompact(providers: Provider[], setupMap?: Map<string, AppConnection[]>): string {
  return providers
    .map((p) => {
      const parts = [p.identifier, p.display_name];
      if (p.categories?.length) parts.push(p.categories.join(', '));
      const t = connectorTraits(p);
      if (t.scalekitCredentials) parts.push('scalekit_credentials');
      if (t.mcp) parts.push('mcp');
      if (setupMap) parts.push(`setup: ${formatSetup(setupMap.get(p.identifier))}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

function formatSetup(conns: AppConnection[] | undefined): string {
  if (!conns?.length) return 'not_configured';
  return conns.map((c) => `${c.status} (${c.type}, ${c.key_id})`).join('; ');
}

function matchesQuery(provider: Provider, query: string): boolean {
  const q = query.toLowerCase();
  if (provider.display_name?.toLowerCase().includes(q)) return true;
  if (provider.identifier?.toLowerCase().includes(q)) return true;
  if (provider.description?.toLowerCase().includes(q)) return true;
  if (provider.categories?.some((c) => c.toLowerCase().includes(q))) return true;
  return false;
}

/** Reads the whole connector catalog, SERVER_PAGE_SIZE connectors per request. */
async function fetchAllProviders(token: string, environmentDomain: string, connectorType: ConnectorType) {
  return fetchAllPages<Provider>(async (pageToken, signal) => {
    const params = new URLSearchParams({
      page_size: String(SERVER_PAGE_SIZE),
      'filter.provider_type': providerTypeParam(connectorType),
    });
    if (pageToken) params.set('page_token', pageToken);
    const data = await apiJson<ListProvidersResponse>(
      token, environmentDomain, 'GET', `${ENDPOINTS.providers.list}?${params.toString()}`, undefined, signal
    );
    return { items: data.providers ?? [], nextPageToken: data.next_page_token };
  });
}

/** Reads every app connection in the environment, grouped by connector ID, for setup status. */
async function fetchSetupMap(token: string, environmentDomain: string): Promise<Map<string, AppConnection[]>> {
  const { items } = await fetchAllPages<AppConnection>(async (pageToken, signal) => {
    const params = new URLSearchParams({ page_size: String(SERVER_PAGE_SIZE) });
    if (pageToken) params.set('page_token', pageToken);
    const data = await apiJson<ListAppConnectionsResponse>(
      token, environmentDomain, 'GET', `${ENDPOINTS.connections.listApp}?${params.toString()}`, undefined, signal
    );
    return { items: data.connections ?? [], nextPageToken: data.next_page_token };
  });
  const map = new Map<string, AppConnection[]>();
  for (const conn of items) {
    const key = conn.provider_key?.split(':')[0];
    if (!key) continue;
    const existing = map.get(key) ?? [];
    existing.push(conn);
    map.set(key, existing);
  }
  return map;
}

/** Error result for a failed catalog read: names the failed page and asks the agent to retry. */
function catalogErrorResult(what: string, error: unknown) {
  if (error instanceof PagingError) {
    return textContent(
      `Failed to load ${what} (${error.message}, page ${error.page}). No partial results were returned. Retry the call.`,
      { isError: true }
    );
  }
  return apiErrorResult(`load ${what}`, error);
}

function searchConnectorsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.search_connectors.name,
    TOOLS.search_connectors.description,
    {
      environmentId: environmentIdSchema,
      query: z.string().min(1).optional().describe('Keyword matched against connector name, ID, description or categories, for example "email", "gmail" or "crm". Searches the whole catalog.'),
      all: z.boolean().optional().default(false).describe('Return every connector in one reply, in a compact format (ID, display name, categories). Ignores pageSize and pageToken.'),
      connectorType: z.enum(['SCALEKIT', 'CUSTOM', 'ALL']).optional().default('ALL').describe('SCALEKIT: pre-built connectors maintained by Scalekit and shared by all environments. CUSTOM: connectors created in this environment. ALL: both.'),
      includeSetupStatus: z.boolean().optional().default(false).describe('Also show which connectors already have a connection in this environment.'),
      pageSize: z.number().int().min(1).max(100).optional().default(20).describe('Connectors returned per reply. Default 20. Maximum 100.'),
      pageToken: z.string().optional().describe('Token from a previous reply, to get the next page.'),
    },
    TOOLS.search_connectors.annotations,
    async ({ environmentId, query, all, connectorType, includeSetupStatus, pageSize, pageToken }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();
      const started = Date.now();

      let environmentDomain: string;
      try {
        environmentDomain = await getEnvironmentDomain(token, environmentId);
      } catch (error) {
        logger.error(`search_connectors: environment lookup failed environmentId=${environmentId}: ${describeError(error)}`);
        return textContent('Failed to read the environment. Check the environment ID and retry.', { isError: true });
      }

      // Without a keyword or `all`, return one page straight from the API, as before.
      if (!query && !all) {
        try {
          const params = new URLSearchParams({
            page_size: String(pageSize),
            'filter.provider_type': providerTypeParam(connectorType),
          });
          if (pageToken) params.set('page_token', pageToken);
          const [data, setupMap] = await Promise.all([
            apiJson<ListProvidersResponse>(token, environmentDomain, 'GET', `${ENDPOINTS.providers.list}?${params.toString()}`),
            includeSetupStatus ? fetchSetupMap(token, environmentDomain) : Promise.resolve(undefined),
          ]);
          const providers = data.providers ?? [];
          const pagination = data.next_page_token ? `\n\nNext page token: ${data.next_page_token}` : '';
          return textContent(
            `Connectors (${connectorType}) — ${data.total_size ?? providers.length} found\n\n${formatProviders(providers, setupMap) || '(no connectors found)'}${pagination}`
          );
        } catch (error) {
          logger.error(`search_connectors: single page failed environmentId=${environmentId}: ${describeError(error)}`);
          return catalogErrorResult('connectors', error);
        }
      }

      // Keyword or `all`: read the whole catalog page by page so no connector is missed.
      try {
        const [catalog, setupMap] = await Promise.all([
          fetchAllProviders(token, environmentDomain, connectorType),
          includeSetupStatus ? fetchSetupMap(token, environmentDomain) : Promise.resolve(undefined),
        ]);
        const matches = query ? catalog.items.filter((p) => matchesQuery(p, query)) : catalog.items;
        logger.info(
          `search_connectors: read catalog environmentId=${environmentId} pages=${catalog.pages} rows=${catalog.items.length} matches=${matches.length} all=${all} durationMs=${Date.now() - started}`
        );

        if (all) {
          const heading = query
            ? `All connectors matching "${query}" (${connectorType}) — ${matches.length} found`
            : `All connectors (${connectorType}) — ${matches.length} found`;
          return textContent(`${heading}\n\n${formatProvidersCompact(matches, setupMap) || '(no connectors found)'}`);
        }

        let offset = 0;
        if (pageToken?.startsWith(LOCAL_PAGE_TOKEN_PREFIX)) {
          offset = parseInt(pageToken.slice(LOCAL_PAGE_TOKEN_PREFIX.length), 10) || 0;
        }
        const page = matches.slice(offset, offset + pageSize);
        const hasMore = offset + pageSize < matches.length;
        const range = matches.length > 0 && page.length > 0 ? ` (showing ${offset + 1}–${offset + page.length})` : '';
        const pagination = hasMore ? `\n\nNext page token: ${LOCAL_PAGE_TOKEN_PREFIX}${offset + pageSize}` : '';
        return textContent(
          `Connectors matching "${query}" (${connectorType}) — ${matches.length} found${range}\n\n${formatProviders(page, setupMap) || '(no connectors found)'}${pagination}`
        );
      } catch (error) {
        logger.error(
          `search_connectors: catalog read failed environmentId=${environmentId} durationMs=${Date.now() - started}: ${describeError(error)}${error instanceof PagingError && error.cause ? ` cause=${describeError(error.cause)}` : ''}`
        );
        return catalogErrorResult('connectors', error);
      }
    }
  );
}

function getConnectorTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_connector.name,
    TOOLS.get_connector.description,
    {
      environmentId: environmentIdSchema,
      connector: z.string().min(1).max(255).describe('Exact connector ID from search_connectors, for example GMAIL.'),
      includeSetupStatus: z.boolean().optional().default(true).describe('Also list the AgentKit connections this connector already has in this environment. Default true.'),
    },
    TOOLS.get_connector.annotations,
    async ({ environmentId, connector, includeSetupStatus }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const lookup = async (identifier: string) => {
          const params = new URLSearchParams({ identifier, page_size: '1', 'filter.provider_type': 'ALL' });
          try {
            const data = await apiJson<ListProvidersResponse>(token, environmentDomain, 'GET', `${ENDPOINTS.providers.list}?${params.toString()}`);
            return data.providers?.[0];
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) return undefined;
            throw error;
          }
        };
        // Scalekit connector IDs are upper case; accept "gmail" as well as "GMAIL".
        let provider = await lookup(connector);
        if (!provider && connector.toUpperCase() !== connector) provider = await lookup(connector.toUpperCase());
        if (!provider) {
          return textContent(`No connector with ID "${connector}". Find the ID with search_connectors.`, { isError: true });
        }

        const traits = connectorTraits(provider);
        const lines = [
          `Connector ${provider.identifier}`,
          '',
          `display_name: ${provider.display_name}`,
          provider.description ? `description: ${provider.description}` : null,
          provider.categories?.length ? `categories: ${provider.categories.join(', ')}` : null,
          `scalekit_credentials: ${traits.scalekitCredentials ? 'available (a connection can use Scalekit-managed OAuth credentials)' : 'not available (a connection needs your own OAuth client ID and secret)'}`,
          `mcp: ${traits.mcp ? 'true' : 'false'}`,
          traits.authTypes.length ? `auth_types: ${traits.authTypes.join(', ')}` : null,
          `custom: ${provider.is_custom ? 'true' : 'false'}`,
          provider.is_custom_mcp ? 'custom_mcp: true' : null,
          provider.coming_soon ? 'coming_soon: true' : null,
        ];

        if (includeSetupStatus) {
          const params = new URLSearchParams({ provider: provider.identifier, page_size: '100' });
          const data = await apiJson<ListAgentkitConnectionsResponse>(
            token, environmentDomain, 'GET', `${ENDPOINTS.agentkitConnections.list}?${params.toString()}`
          );
          const conns = data.connections ?? [];
          lines.push(
            conns.length
              ? `connections in this environment: ${conns.map((c) => `${c.connection_name ?? c.id} (${c.id}, ${c.type ?? 'unknown type'})`).join('; ')}`
              : 'connections in this environment: none. Use create_agentkit_connection to add one.'
          );
        }

        return textContent(lines.filter((l) => l !== null).join('\n'));
      } catch (error) {
        logger.error(`get_connector failed environmentId=${environmentId} connector=${connector}: ${describeError(error)}`);
        return apiErrorResult('read the connector', error);
      }
    }
  );
}
