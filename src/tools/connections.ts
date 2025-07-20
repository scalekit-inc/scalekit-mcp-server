import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, CreateConnectionResponse, EnableConnectionResponse, Environment, ListConnectionsResponse } from '../types/index.js';
import { TOOLS } from './index.js';

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
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const params = new URLSearchParams({
                    include: 'all',
                });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch connection details: ${res.statusText}`);
        }

        const connections = await res.json() as ListConnectionsResponse;

        return {
          content: [
            {
              type: 'text',
              text: `Connections:\n${connections.connections.map(conn => {
            const details = [
              `id: ${conn.id}`,
              conn.provider ? `provider: ${conn.provider}` : null,
              conn.type ? `type: ${conn.type}` : null,
              conn.status ? `status: ${conn.status}` : null,
              typeof conn.enabled === 'boolean' ? `enabled: ${conn.enabled}` : null,
              conn.organization_name ? `organization_name: ${conn.organization_name}` : null,
            ].filter(Boolean).join('\n  ');
            return `- {\n  ${details}\n}`;
              }).join('\n')}`,
            }
          ]
        };
      } catch (error) {
        logger.error(`Failed to fetch connection details`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch connection details. Please try again later.',
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
        environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
        organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
    },
    async ({environmentId, organizationId}, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const params = new URLSearchParams({
                    organizationId: organizationId,
                    include: 'all',
                });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch connection details: ${res.statusText}`);
        }

        const connections = await res.json() as ListConnectionsResponse;

        return {
          content: [
            {
              type: 'text',
              text: `Connections:\n${connections.connections.map(conn => {
            const details = [
              `id: ${conn.id}`,
              conn.provider ? `provider: ${conn.provider}` : null,
              conn.type ? `type: ${conn.type}` : null,
              conn.status ? `status: ${conn.status}` : null,
              typeof conn.enabled === 'boolean' ? `enabled: ${conn.enabled}` : null,
              conn.organization_name ? `organization_name: ${conn.organization_name}` : null,
            ].filter(Boolean).join('\n  ');
            return `- {\n  ${details}\n}`;
              }).join('\n')}`,
            }
          ]
        };
      } catch (error) {
        logger.error(`Failed to fetch connection details`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch connection details. Please try again later.',
            },
          ],
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
            environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
            provider: z.enum([
                'OKTA',
                'GOOGLE',
                'MICROSOFT_AD',
                'AUTH0',
                'ONELOGIN',
                'PING_IDENTITY',
                'JUMPCLOUD',
                'CUSTOM',
                'GITHUB',
                'GITLAB',
                'LINKEDIN',
                'SALESFORCE',
                'MICROSOFT',
                'IDP_SIMULATOR',
                'SCALEKIT',
                'ADFS',
            ]),
        },
        async ({ environmentId, provider }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            const type = "OIDC";

            try {
                const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const envData = (await envRes.json()) as { environment: Environment };
                const environmentDomain = envData.environment.domain;

                const res = await fetch(`${ENDPOINTS.connections.create}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        'x-env-domain': environmentDomain || '',
                    },
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
            environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
            connectionId: z.string().regex(/^conn_\w+$/, 'Connection ID must start with conn_'),
            type: z.enum(['OIDC']),
            key_id: z.string().min(1, 'Key ID is required'),
            provider: z.enum([
                'OKTA',
                'GOOGLE',
                'MICROSOFT_AD',
                'AUTH0',
                'ONELOGIN',
                'PING_IDENTITY',
                'JUMPCLOUD',
                'CUSTOM',
                'GITHUB',
                'GITLAB',
                'LINKEDIN',
                'SALESFORCE',
                'MICROSOFT',
                'IDP_SIMULATOR',
                'SCALEKIT',
                'ADFS',
            ]),
            oidc_config: z.object({
                issuer: z.string().url(),
                discovery_endpoint: z.string().url(),
                authorize_uri: z.string().url(),
                token_uri: z.string().url(),
                user_info_uri: z.string().url(),
                jwks_uri: z.string().url(),
                client_id: z.string(),
                client_secret: z.string(),
                scopes: z.array(z.string()),
                token_auth_type: z.string(),
                redirect_uri: z.string().url(),
                pkce_enabled: z.boolean(),
                idp_logout_required: z.boolean(),
                post_logout_redirect_uri: z.string().url(),
                backchannel_logout_redirect_uri: z.string().url(),
            }),
        },
        async (
            { environmentId, connectionId, type, key_id, provider, oidc_config },
            context
        ) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            try {
                const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const envData = (await envRes.json()) as { environment: Environment };
                const environmentDomain = envData.environment.domain;

                const res = await fetch(
                    `${ENDPOINTS.connections.updateById(connectionId)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'x-env-domain': environmentDomain || '',
                        },
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
            environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
            connection_id: z.string().regex(/^conn_\w+$/, 'Connection ID must start with conn_'),
        },
        async ({ environmentId, connection_id }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            try {
                const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const envData = (await envRes.json()) as { environment: Environment };
                const environmentDomain = envData.environment.domain;

                const res = await fetch(
                    `${ENDPOINTS.connections.enableById(connection_id)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'x-env-domain': environmentDomain || '',
                        }
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