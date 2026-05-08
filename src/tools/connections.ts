import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AppConnection,
  AuthInfo,
  ConnectedAccount,
  Connection,
  CreateConnectedAccountMagicLinkResponse,
  EnableConnectionResponse,
  ListAppConnectionsResponse,
  ListConnectedAccountsResponse,
  ListConnectionsResponse,
  ListProvidersResponse,
  Provider,
} from '../types/index.js';
import { connectionIdSchema, environmentIdSchema, organizationIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

function formatConnections(connections: Connection[]): string {
  return connections
    .map(conn => {
      const details = [
        `id: ${conn.id}`,
        conn.provider ? `provider: ${conn.provider}` : null,
        conn.type ? `type: ${conn.type}` : null,
        conn.status ? `status: ${conn.status}` : null,
        typeof conn.enabled === 'boolean' ? `enabled: ${conn.enabled}` : null,
        conn.organization_name ? `organization_name: ${conn.organization_name}` : null,
      ].filter(Boolean).join('\n  ');
      return `- {\n  ${details}\n}`;
    })
    .join('\n');
}

function formatConnectedAccounts(accounts: ConnectedAccount[]): string {
  return accounts
    .map((ca) => {
      const details = [
        `id: ${ca.id}`,
        `identifier: ${ca.identifier}`,
        `provider: ${ca.provider}`,
        `connector: ${ca.connector}`,
        `status: ${ca.status}`,
        `authorization_type: ${ca.authorization_type}`,
        `connection_id: ${ca.connection_id}`,
        `updated_at: ${ca.updated_at}`,
        ca.token_expires_at ? `token_expires_at: ${ca.token_expires_at}` : null,
        ca.last_used_at ? `last_used_at: ${ca.last_used_at}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `- ${details}`;
    })
    .join('\n');
}

export function registerConnectionTools(server: McpServer){
  TOOLS.list_environment_connections.registeredTool = getEnvironmentConnectionsTool(server)
  TOOLS.list_connected_accounts.registeredTool = listConnectedAccountsTool(server);
  TOOLS.search_connectors.registeredTool = searchConnectorsTool(server);
  TOOLS.create_connected_account_magic_link.registeredTool = createConnectedAccountMagicLinkTool(server);
  TOOLS.list_organization_connections.registeredTool = getOrganizationConnectionsTool(server);
  TOOLS.enable_environment_connection.registeredTool = enableConnectionTool(server);
}

function getEnvironmentConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_connections.name,
    TOOLS.list_environment_connections.description,
    { environmentId: environmentIdSchema },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const params = new URLSearchParams({ include: 'all' });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        if (!res.ok) throw new Error(`Failed to fetch connection details: ${res.statusText}`);

        const data = (await res.json()) as ListConnectionsResponse;
        return {
          content: [{ type: 'text', text: `Connections:\n${formatConnections(data.connections)}` }],
        };
      } catch (error) {
        logger.error('Failed to fetch connection details', error);
        return {
          content: [{ type: 'text', text: 'Failed to fetch connection details. Please try again later.' }],
        };
      }
    }
  );
}

function listConnectedAccountsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_connected_accounts.name,
    TOOLS.list_connected_accounts.description,
    {
      environmentId: environmentIdSchema,
      pageSize: z.number().int().min(1).max(100).optional().default(20),
      pageToken: z.string().optional().describe('Opaque token from a previous response next_page_token to fetch the next page.'),
    },
    async ({ environmentId, pageSize, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const params = new URLSearchParams({ page_size: String(pageSize) });
        if (pageToken) params.set('page_token', pageToken);

        const res = await fetch(`${ENDPOINTS.connections.connectedAccountsList}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        if (!res.ok) {
          const errorText = await res.text();
          logger.error(`Failed to list connected accounts: ${res.status} ${errorText}`);
          throw new Error(`Failed to list connected accounts: ${res.statusText}`);
        }

        const data = (await res.json()) as ListConnectedAccountsResponse;
        const accounts = data.connected_accounts ?? [];
        const rows = formatConnectedAccounts(accounts);
        const pagination = data.next_page_token
          ? `\n\nNext page token: ${data.next_page_token}`
          : '\n\nNo more pages.';
        const prev = data.prev_page_token ? `\nPrevious page token: ${data.prev_page_token}` : '';

        return {
          content: [
            {
              type: 'text',
              text: `Total connected accounts: ${data.total_size ?? accounts.length}\n\n${rows || '(none)'}${pagination}${prev}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to list connected accounts', error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to list connected accounts. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function formatProviders(providers: Provider[], setupMap?: Map<string, AppConnection[]>): string {
  return providers
    .map((p) => {
      const details = [
        `identifier: ${p.identifier}`,
        `display_name: ${p.display_name}`,
        p.description ? `description: ${p.description}` : null,
        p.categories?.length ? `categories: ${p.categories.join(', ')}` : null,
        p.is_custom ? `custom: true` : null,
        p.is_custom_mcp ? `custom_mcp: true` : null,
        p.coming_soon ? `coming_soon: true` : null,
        p.proxy_enabled ? `proxy_url: ${p.proxy_url}` : null,
      ];
      if (setupMap) {
        const conns = setupMap.get(p.identifier);
        if (conns?.length) {
          const summaries = conns.map((c) => `${c.status} (${c.type}, ${c.key_id})`).join('; ');
          details.push(`setup: ${summaries}`);
        } else {
          details.push('setup: not_configured');
        }
      }
      return `- ${details.filter(Boolean).join(' | ')}`;
    })
    .join('\n');
}

async function fetchAppConnections(token: string, environmentDomain: string): Promise<Map<string, AppConnection[]>> {
  const params = new URLSearchParams({ page_size: '1000' });
  const res = await fetch(`${ENDPOINTS.connections.listApp}?${params.toString()}`, {
    headers: envHeaders(token, environmentDomain),
  });
  if (!res.ok) {
    logger.warn(`Failed to fetch app connections for setup status: ${res.status}`);
    return new Map();
  }
  const data = (await res.json()) as ListAppConnectionsResponse;
  const map = new Map<string, AppConnection[]>();
  for (const conn of data.connections ?? []) {
    const key = conn.provider_key?.split(':')[0];
    if (!key) continue;
    const existing = map.get(key) ?? [];
    existing.push(conn);
    map.set(key, existing);
  }
  return map;
}

function matchesQuery(provider: Provider, query: string): boolean {
  const q = query.toLowerCase();
  if (provider.display_name?.toLowerCase().includes(q)) return true;
  if (provider.identifier?.toLowerCase().includes(q)) return true;
  if (provider.description?.toLowerCase().includes(q)) return true;
  if (provider.categories?.some((c) => c.toLowerCase().includes(q))) return true;
  return false;
}

function searchConnectorsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.search_connectors.name,
    TOOLS.search_connectors.description,
    {
      environmentId: environmentIdSchema,
      query: z.string().min(1).optional().describe('Search keyword to match against connector name, identifier, description, or categories (e.g. "gmail", "slack", "hubspot").'),
      identifier: z.string().optional().describe('Exact provider identifier for a precise lookup (e.g. "GOOGLE_WORKSPACE", "SLACK"). Use "query" for keyword search instead.'),
      providerType: z.enum(['DEFAULT', 'CUSTOM', 'ALL']).optional().default('ALL').describe('Filter by provider type: DEFAULT (built-in), CUSTOM (environment-scoped), or ALL.'),
      pageSize: z.number().int().min(1).max(1000).optional().default(20),
      pageToken: z.string().optional().describe('Opaque token from a previous response to fetch the next page.'),
      includeSetupStatus: z.boolean().optional().default(false).describe('When true, also checks which connectors have been set up (have active connections) in the environment.'),
    },
    async ({ environmentId, query, identifier, providerType, pageSize, pageToken, includeSetupStatus }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      if (!query && !identifier && (!providerType || providerType === 'ALL')) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'At least one search criterion is required: provide a query, identifier, or providerType (DEFAULT or CUSTOM).',
            },
          ],
        };
      }

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        // When the user provides a search query, fetch all providers and filter client-side
        // because the API's identifier param only supports exact match.
        const isSearch = !!query && !identifier;
        const params = new URLSearchParams({
          page_size: String(isSearch ? 1000 : pageSize),
        });
        if (!isSearch && pageToken) params.set('page_token', pageToken);
        if (identifier) params.set('identifier', identifier);
        if (providerType) params.set('filter.provider_type', providerType);

        const providersFetch = fetch(`${ENDPOINTS.providers.list}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        // Fetch app connections in parallel when setup status is requested
        const setupMapPromise = includeSetupStatus
          ? fetchAppConnections(token, environmentDomain)
          : Promise.resolve(undefined);

        const [res, setupMap] = await Promise.all([providersFetch, setupMapPromise]);

        if (!res.ok) {
          const errorText = await res.text();
          logger.error(`Failed to search connectors: ${res.status} ${errorText}`);
          throw new Error(`Failed to search connectors: ${res.statusText}`);
        }

        const data = (await res.json()) as ListProvidersResponse;
        let providers = data.providers ?? [];

        // Client-side search: filter, then paginate locally to bound context window size
        if (isSearch) {
          providers = providers.filter((p) => matchesQuery(p, query));
          const totalMatches = providers.length;

          let offset = 0;
          if (pageToken?.startsWith('csearch_')) {
            offset = parseInt(pageToken.slice(8), 10) || 0;
          }
          const page = providers.slice(offset, offset + pageSize);
          const hasMore = offset + pageSize < totalMatches;

          const rows = formatProviders(page, setupMap);
          const range = totalMatches > 0
            ? ` (showing ${offset + 1}–${offset + page.length})`
            : '';
          const pagination = hasMore
            ? `\n\nNext page token: csearch_${offset + pageSize}`
            : '';

          return {
            content: [
              {
                type: 'text',
                text: `Connectors matching "${query}" (${providerType ?? 'ALL'}) — ${totalMatches} found${range}\n\n${rows || '(no connectors found)'}${pagination}`,
              },
            ],
          };
        }

        // Non-search paths (identifier exact match or list all): use API-native pagination
        const rows = formatProviders(providers, setupMap);
        const count = data.total_size ?? providers.length;
        const pagination = data.next_page_token
          ? `\n\nNext page token: ${data.next_page_token}`
          : '';
        const filterDesc = identifier
          ? ` for identifier "${identifier}"`
          : '';

        return {
          content: [
            {
              type: 'text',
              text: `Connectors${filterDesc} (${providerType ?? 'ALL'}) — ${count} found\n\n${rows || '(no connectors found)'}${pagination}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to search connectors', error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to search connectors. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function createConnectedAccountMagicLinkTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_connected_account_magic_link.name,
    TOOLS.create_connected_account_magic_link.description,
    {
      environmentId: environmentIdSchema,
      identifier: z.string().min(1, 'identifier is required'),
      connector: z.string().min(1, 'connector is required'),
    },
    async ({ environmentId, identifier, connector }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const res = await fetch(`${ENDPOINTS.connections.connectedAccountsMagicLink}`, {
          method: 'POST',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ identifier, connector }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          logger.error(`Failed to create connected account magic link: ${res.status} ${errorText}`);
          throw new Error(`Failed to create connected account magic link: ${res.statusText}`);
        }

        const data = (await res.json()) as CreateConnectedAccountMagicLinkResponse;
        return {
          content: [
            {
              type: 'text',
              text: `Magic link created.\nlink: ${data.link}\nexpiry: ${data.expiry}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to create connected account magic link', error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to create connected account magic link. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function getOrganizationConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_organization_connections.name,
    TOOLS.list_organization_connections.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
    },
    async ({ environmentId, organizationId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const params = new URLSearchParams({ organizationId, include: 'all' });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        if (!res.ok) throw new Error(`Failed to fetch connection details: ${res.statusText}`);

        const data = (await res.json()) as ListConnectionsResponse;
        return {
          content: [{ type: 'text', text: `Connections:\n${formatConnections(data.connections)}` }],
        };
      } catch (error) {
        logger.error('Failed to fetch connection details', error);
        return {
          content: [{ type: 'text', text: 'Failed to fetch connection details. Please try again later.' }],
        };
      }
    }
  );
}

function enableConnectionTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.enable_environment_connection.name,
    TOOLS.enable_environment_connection.description,
    {
      environmentId: environmentIdSchema,
      connection_id: connectionIdSchema,
    },
    async ({ environmentId, connection_id }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(
                    `${ENDPOINTS.connections.enableById(connection_id)}`,
                    {
                        method: 'PATCH',
                        headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
                    }
                );

                if (!res.ok) {
                    const errorText = await res.text();
                    logger.error(`Failed to enable connection: ${res.status} ${errorText}`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to enable connection: ${res.statusText}`,
                            },
                        ],
                    };
                }

                const connection = await res.json() as EnableConnectionResponse;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Connection enabled successfully!\n  Enabled status: ${connection.enabled}`,
                        },
                    ],
                };
            } catch (error) {
                logger.error(`Failed to enable connection`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to enable connection. Please try again later.',
                        },
                    ],
                };
            }
        }
    );
}