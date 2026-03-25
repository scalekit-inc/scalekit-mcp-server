import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, CreateResourceResponse, ListResourcesResponse, Scope } from '../types/index.js';
import { environmentIdSchema, resourceIdSchema, validateUrls } from '../validators/types.js';
import { TOOLS } from './index.js';

export function registerResourceTools(server: McpServer){
    TOOLS.list_mcp_servers.registeredTool = listMcpServersTool(server)
    TOOLS.register_mcp_server.registeredTool = registerMcpServerTool(server);
    TOOLS.update_mcp_server.registeredTool = updateMcpServerTool(server);
    TOOLS.switch_mcp_auth_to_scalekit.registeredTool = switchMcpAuthToScalekitTool(server);
}

function listMcpServersTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_mcp_servers.name,
    TOOLS.list_mcp_servers.description,
    {
      environmentId: environmentIdSchema,
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const pageSize = 30;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? ''),
                    resource_type: 'MCP_SERVER',
                });
        const res = await fetch(`${ENDPOINTS.environments.listResources}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch list of registered mcp servers: ${res.statusText}`);
        }

        const servers = await res.json() as ListResourcesResponse;

        const serverDetails = servers.resources.map((server, idx) => {
          return [
            `#${idx + 1}`,
            `Name: ${server.name}`,
            `ID: ${server.id}`,
            `Resource ID: ${server.resource_id}`,
            `Description: ${server.description || 'N/A'}`,
            `Access Token Expiry: ${server.access_token_expiry || 'N/A'}`,
            `Using Scalekit Authentication: ${!server.provider ? 'Yes' : 'No'}`,
            ...(server.provider
              ? [`Provider: ${server.provider}`]
              : [])
          ].join(', ');
        }).join('\n\n');

        const nextPageTokenText = servers.next_page_token
          ? `\n\nNext Page Token: ${servers.next_page_token}`
          : '';

        return {
          content: [
            {
              type: 'text',
              text: serverDetails
            ? `Registered MCP Servers:\n${serverDetails}${nextPageTokenText}`
            : 'No registered MCP servers found.',
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to fetch MCP servers', error);
        return {
          content: [{ type: 'text', text: 'Failed to fetch MCP servers. Please try again later.' }],
        };
      }
    }
  );
}

function registerMcpServerTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.register_mcp_server.name,
    TOOLS.register_mcp_server.description,
    {
      environmentId: environmentIdSchema,
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional().default(''),
      mcpServerUrl: z.string().min(1, 'MCP Server URL is required'),
      accessTokenExpiry: z.number().int().min(1, 'Access token expiry must be a positive integer'),
      provider: z.string().optional().default(''),
      useScalekitAuthentication: z.boolean(),
    },
    async ({ environmentId, name, description, mcpServerUrl, accessTokenExpiry, provider, useScalekitAuthentication }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      const urlError = validateUrls([mcpServerUrl]);
      if (urlError !== null) {
        return { content: [{ type: 'text', text: urlError }] };
      }

      const environmentDomain = await getEnvironmentDomain(token, environmentId);

    // Make an API call to list environment roles and save it in a variable
    let environmentScopes = null;
    try {
      const scopesRes = await fetch(`${ENDPOINTS.environments.listScopesById(environmentId)}`, {
        headers: envHeaders(token, environmentDomain),
      });
      if (scopesRes.ok) {
        let data = await scopesRes.json() as { scopes: Scope[] };
        environmentScopes = data.scopes;
      } else {
        logger.warn(`Failed to fetch environment roles: ${JSON.stringify(scopesRes.json())}`);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch environment roles. Please create the roles if not already created or try again later.',
            },
          ],
        };
      }
    } catch (err) {
      logger.warn(`Error fetching environment roles`, err);
        return {
            content: [
            {
                type: 'text',
                text: 'Failed to fetch environment roles. Please try again later.',
            },
            ],
        };
    }

    // Build a resource metadata object similar to the provided example
    // Extract protocol, host, and port from the URL
    let baseUrl: string;
    try {
      const urlObj = new URL(mcpServerUrl);
      baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
      logger.error(`Invalid MCP Server URL: ${mcpServerUrl}`, e);
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid MCP Server URL. Please provide a valid URL.',
          },
        ],
      };
    }

    const resourceMetadata = {
      resource: baseUrl,
      authorization_servers: [
        `${baseUrl}/.well-known/oauth-authorization-server`
      ],
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl}/docs`,
      scopes_supported: environmentScopes?.map((scope: Scope) => scope.name) || []
    };

    if (useScalekitAuthentication) {
        // If using Scalekit authentication, set the provider to an empty string
        provider = '';
    }

      try {
        const res = await fetch(`${ENDPOINTS.environments.createResource}`, {
          method: 'POST',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: name,
            description: description,
            third_party: false,
            resource_type: 'MCP_SERVER',
            resource_id: mcpServerUrl,
            access_token_expiry: accessTokenExpiry,
            resourceMetadata: JSON.stringify(resourceMetadata),
            provider: provider.toUpperCase(),
          }),
        });

        if (res.ok) {
            const resp = await res.json() as CreateResourceResponse;
          return {
            content: [
              {
                type: 'text',
                text: `MCP server "${name}" with id ${resp.resource.id} has been successfully registered with resourceMetadata: ${JSON.stringify(resourceMetadata)}. To get oauth-authorization-server metadata data, fetch it from Fetch the oauth-authorization-server details from https://${environmentDomain}/resources/${resp.resource.id}/.well-known/oauth-authorization-server`
              }
            ]
          };
        } else {
          logger.error(`Failed to register mcp server: ${res.statusText}.`);
          return {
            content: [
              {
                type: 'text',
                text: 'Failed to register mcp server. Please try again. check if the server is already registered or try again later.',
              },
            ],
          };
        }
      } catch (error) {
        logger.error(`Failed to register mcp server`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to register mcp server. Please try again.',
            },
          ],
        };
      }
    }
  );
}

function updateMcpServerTool(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.update_mcp_server.name,
        TOOLS.update_mcp_server.description,
        {
          environmentId: environmentIdSchema,
          id: resourceIdSchema,
          name: z.string().optional(),
          description: z.string().optional(),
          mcpServerUrl: z.string().optional(),
          accessTokenExpiry: z.number().int().min(1, 'Access token expiry must be a positive integer').optional(),
          provider: z.string().optional().default(''),
          useScalekitAuthentication: z.boolean(),
        },
        async ({ environmentId, id, name, description, mcpServerUrl, accessTokenExpiry, provider, useScalekitAuthentication }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            if (mcpServerUrl) {
              const urlError = validateUrls([mcpServerUrl]);
              if (urlError !== null) {
                return { content: [{ type: 'text', text: urlError }] };
              }
            }

            const environmentDomain = await getEnvironmentDomain(token, environmentId);

            // Build the update payload with only provided fields
            const updatePayload: Record<string, any> = {};
            if (name !== undefined && name !== '') updatePayload.name = name;
            if (description !== undefined && description !== '') updatePayload.description = description;
            if (mcpServerUrl !== undefined && mcpServerUrl !== '') {
                updatePayload.resource_id = mcpServerUrl;
                updatePayload.resource_type = 'WEB';
                updatePayload.third_party = true;
            }
            if (accessTokenExpiry !== undefined && accessTokenExpiry !== 0) updatePayload.access_token_expiry = accessTokenExpiry;
            if (provider !== undefined && provider !== '') updatePayload.provider = provider.toUpperCase();
            if (useScalekitAuthentication) {
                // If using Scalekit authentication, set the provider to an empty string
                updatePayload.provider = '';
            }

            if (Object.keys(updatePayload).length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No fields provided to update.',
                        },
                    ],
                };
            }

            try {
                const res = await fetch(`${ENDPOINTS.environments.updateResourceById(id)}`, {
                    method: 'PATCH',
                    headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
                    body: JSON.stringify(updatePayload),
                });

                if (res.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `MCP server "${id}" has been successfully updated.`
                            }
                        ]
                    };
                } else {
                    logger.error(`Failed to update mcp server: ${res.statusText}.`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Failed to update mcp server. Please check if the server exists or try again later.',
                            },
                        ],
                    };
                }
            } catch (error) {
                logger.error(`Failed to update mcp server`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to update mcp server. Please try again.',
                        },
                    ],
                };
            }
        }
    );
}

function switchMcpAuthToScalekitTool(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.switch_mcp_auth_to_scalekit.name,
        TOOLS.switch_mcp_auth_to_scalekit.description,
        {
          environmentId: environmentIdSchema,
          id: resourceIdSchema,
        },
        async ({ environmentId, id }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            try {
                const environmentDomain = await getEnvironmentDomain(token, environmentId);

                const res = await fetch(`${ENDPOINTS.environments.deleteResourceProviderById(id)}`, {
                    method: 'PUT',
                    headers: envHeaders(token, environmentDomain),
                });

                if (res.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Authentication for MCP server "${id}" has been switched to Scalekit authentication.`,
                            },
                        ],
                    };
                } else {
                    logger.error(`Failed to switch MCP server auth: ${res.statusText}.`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Failed to switch MCP server authentication. Please check if the server exists or try again later.',
                            },
                        ],
                    };
                }
            } catch (error) {
                logger.error(`Failed to switch MCP server auth`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to switch MCP server authentication. Please try again.',
                        },
                    ],
                };
            }
        }
    );
}