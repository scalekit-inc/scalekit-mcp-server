import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AuthInfo,
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
  TOOLS.create_connected_account_magic_link.registeredTool = createConnectedAccountMagicLinkTool(server);
  TOOLS.list_organization_connections.registeredTool = getOrganizationConnectionsTool(server);
  TOOLS.enable_environment_connection.registeredTool = enableConnectionTool(server);
}

function getEnvironmentConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_connections.name,
    TOOLS.list_environment_connections.description,
    { environmentId: environmentIdSchema },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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

function createConnectedAccountMagicLinkTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_connected_account_magic_link.name,
    TOOLS.create_connected_account_magic_link.description,
    {
      environmentId: environmentIdSchema,
      identifier: z.string().min(1, 'identifier is required'),
      connector: z.string().min(1, 'connector is required'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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