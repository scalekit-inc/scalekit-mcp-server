import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { callerToken, envHeaders, getEnvironmentDomain, oauthRequired } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  ConnectedAccount,
  Connection,
  CreateConnectedAccountMagicLinkResponse,
  EnableConnectionResponse,
  ListConnectedAccountsResponse,
  ListConnectionsResponse,
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

/** Summary format: group connected accounts by connector, show key details per account. */
function formatConnectedAccountsSummary(accounts: ConnectedAccount[]): string {
  const grouped = new Map<string, ConnectedAccount[]>();
  for (const ca of accounts) {
    const key = ca.provider || ca.connector || 'UNKNOWN';
    const list = grouped.get(key) ?? [];
    list.push(ca);
    grouped.set(key, list);
  }
  const sections: string[] = [];
  for (const [connector, connectorAccounts] of grouped) {
    const lines = connectorAccounts.map((ca) => {
      const parts = [
        ca.identifier,
        `status: ${ca.status}`,
        `auth: ${ca.authorization_type}`,
        ca.connection_id ? `connection: ${ca.connection_id}` : null,
        ca.last_used_at ? `last_used: ${ca.last_used_at}` : null,
        ca.token_expires_at ? `token_expires: ${ca.token_expires_at}` : null,
      ].filter(Boolean).join(' | ');
      return `  - ${parts}`;
    });
    sections.push(`${connector} (${connectorAccounts.length} account${connectorAccounts.length === 1 ? '' : 's'}):\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}

/** Full format: all fields per account, flat list. */
function formatConnectedAccountsFull(accounts: ConnectedAccount[]): string {
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
  TOOLS.create_connected_account_magic_link.registeredTool = createConnectedAccountMagicLinkTool(server);
  TOOLS.list_organization_connections.registeredTool = getOrganizationConnectionsTool(server);
  TOOLS.enable_environment_connection.registeredTool = enableConnectionTool(server);
}

function getEnvironmentConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_connections.name,
    TOOLS.list_environment_connections.description,
    { environmentId: environmentIdSchema },
    TOOLS.list_environment_connections.annotations,
    async ({ environmentId }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

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
          isError: true,
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
      connector: z
        .string()
        .optional()
        .describe('Filter by connector type (e.g. "HUBSPOT", "GMAIL", "NOTION").'),
      connectionId: z
        .string()
        .optional()
        .describe('Filter by a specific connection ID to see only accounts linked to that connection.'),
      summary: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'When true (default), returns accounts grouped by connector with key details. Set to false for full account details.'
        ),
      pageSize: z.number().int().min(1).max(100).optional().default(20).describe('Maximum connected accounts to return. Default 20. Maximum 100.'),
      pageToken: z.string().optional().describe('Opaque token from a previous response to fetch the next page.'),
    },
    TOOLS.list_connected_accounts.annotations,
    async ({ environmentId, connector, connectionId, summary, pageSize, pageToken }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

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
        let accounts = data.connected_accounts ?? [];

        // Client-side filtering
        if (connector) {
          const upper = connector.toUpperCase();
          accounts = accounts.filter(
            (ca) => ca.provider?.toUpperCase() === upper || ca.connector?.toUpperCase() === upper
          );
        }
        if (connectionId) {
          accounts = accounts.filter((ca) => ca.connection_id === connectionId);
        }

        const body = summary
          ? formatConnectedAccountsSummary(accounts)
          : formatConnectedAccountsFull(accounts);

        const pagination = data.next_page_token
          ? `\n\nNext page token: ${data.next_page_token}`
          : '';
        const prev = data.prev_page_token
          ? `\nPrevious page token: ${data.prev_page_token}`
          : '';

        const filterDesc = [
          connector ? `connector=${connector}` : null,
          connectionId ? `connection=${connectionId}` : null,
        ]
          .filter(Boolean)
          .join(', ');

        return {
          content: [
            {
              type: 'text' as const,
              text: `Connected accounts${filterDesc ? ` (${filterDesc})` : ''} — ${accounts.length} found\n\n${body || '(no connected accounts found)'}${pagination}${prev}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to list connected accounts', error);
        return {
          isError: true,
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

function createConnectedAccountMagicLinkTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_connected_account_magic_link.name,
    TOOLS.create_connected_account_magic_link.description,
    {
      environmentId: environmentIdSchema,
      identifier: z.string().min(1, 'identifier is required').describe('Friendly name for the account being connected.'),
      connector: z.string().min(1, 'connector is required').describe('Connector identifier, for example notion or gmail. Use a value from search_connectors.'),
    },
    TOOLS.create_connected_account_magic_link.annotations,
    async ({ environmentId, identifier, connector }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

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
          isError: true,
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
    TOOLS.list_organization_connections.annotations,
    async ({ environmentId, organizationId }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

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
          isError: true,
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
    TOOLS.enable_environment_connection.annotations,
    async ({ environmentId, connection_id }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

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
                        isError: true,
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
                    isError: true,
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