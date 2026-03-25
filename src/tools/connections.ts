import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Connection, CreateConnectionResponse, EnableConnectionResponse, ListConnectionsResponse } from '../types/index.js';
import { connectionIdSchema, environmentIdSchema, oidcProviderSchema, organizationIdSchema, validateUrls } from '../validators/types.js';
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

export function registerConnectionTools(server: McpServer){
  TOOLS.list_environment_connections.registeredTool = getEnvironmentConnectionsTool(server)
  TOOLS.list_organization_connections.registeredTool = getOrganizationConnectionsTool(server);
  TOOLS.create_environment_oidc_connection.registeredTool = createEnvironmentOidcConnectionTool(server);
  TOOLS.update_environment_oidc_connection.registeredTool = updateEnvironmentOidcConnectionTool(server);
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

function createEnvironmentOidcConnectionTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_environment_oidc_connection.name,
    TOOLS.create_environment_oidc_connection.description,
    {
      environmentId: environmentIdSchema,
      provider: oidcProviderSchema,
    },
    async ({ environmentId, provider }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      const type = 'OIDC';

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.connections.create}`, {
          method: 'POST',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            provider: provider,
            type: type,
          }),
        });

                if (!res.ok) {
                    const errorText = await res.text();
                    logger.error(`Failed to create OIDC connection: ${res.status} ${errorText}`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to create OIDC connection: ${res.statusText}`,
                            },
                        ],
                    };
                }

                const connection = await res.json() as CreateConnectionResponse;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `OIDC connection created successfully!\n${JSON.stringify(connection, null, 2)}`,
                        },
                    ],
                };
            } catch (error) {
                logger.error(`Failed to create OIDC connection`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to create OIDC connection. Please try again later.',
                        },
                    ],
                };
            }
        }
    );
}

function updateEnvironmentOidcConnectionTool(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.update_environment_oidc_connection.name,
        TOOLS.update_environment_oidc_connection.description,
        {
          environmentId: environmentIdSchema,
          connectionId: connectionIdSchema,
          type: z.enum(['OIDC']),
          key_id: z.string().min(1, 'Key ID is required'),
          provider: oidcProviderSchema,
            oidc_config: z.object({
                issuer: z.string().min(1, 'Issuer is required'),
                discovery_endpoint: z.string().min(1, 'Discovery endpoint is required'),
                authorize_uri: z.string().min(1, 'Authorize URI is required'),
                token_uri: z.string().min(1, 'Token URI is required'),
                user_info_uri: z.string().min(1, 'User info URI is required'),
                jwks_uri: z.string().min(1, 'JWKS URI is required'),
                client_id: z.string(),
                client_secret: z.string(),
                scopes: z.array(z.string()),
                token_auth_type: z.string(),
                redirect_uri: z.string().min(1, 'Redirect URI is required'),
                pkce_enabled: z.boolean(),
                idp_logout_required: z.boolean(),
                post_logout_redirect_uri: z.string().min(1, 'Post logout redirect URI is required'),
                backchannel_logout_redirect_uri: z.string().min(1, 'Backchannel logout redirect URI is required'),
            }),
        },
        async (
            { environmentId, connectionId, type, key_id, provider, oidc_config },
            context
        ) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            var res = validateUrls([
              oidc_config.issuer,
              oidc_config.discovery_endpoint,
              oidc_config.authorize_uri,
              oidc_config.token_uri,
              oidc_config.user_info_uri,
              oidc_config.jwks_uri,
              oidc_config.redirect_uri,
              oidc_config.post_logout_redirect_uri,
              oidc_config.backchannel_logout_redirect_uri,
            ]);

            if (res !== null) {
              return {
                content: [
                  {
                    type: 'text',
                    text: res,
                  },
                ],
              };
            }

            try {
                const environmentDomain = await getEnvironmentDomain(token, environmentId);

                const res = await fetch(
                    `${ENDPOINTS.connections.updateById(connectionId)}`,
                    {
                        method: 'PATCH',
                        headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            type,
                            key_id: key_id.toUpperCase(),
                            configuration_type: 'DISCOVERY',
                            provider,
                            oidc_config,
                        }),
                    }
                );

                if (!res.ok) {
                    const errorText = await res.text();
                    logger.error(`Failed to update OIDC connection: ${res.status} ${errorText}`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to update OIDC connection: ${res.statusText}`,
                            },
                        ],
                    };
                }

                const connection = await res.json() as CreateConnectionResponse;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `OIDC connection updated successfully!\n  id: ${connection.connection?.id}\n  provider: ${provider}\n  type: ${type}`,
                        },
                    ],
                };
            } catch (error) {
                logger.error(`Failed to update OIDC connection`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to update OIDC connection. Please try again later.',
                        },
                    ],
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