import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, ListResourcesResponse } from '../types/index.js';
import { SCOPES } from '../types/scopes.js';
import { TOOLS } from './index.js';

export function registerResourceTools(server: McpServer){
    TOOLS.list_mcp_servers.registeredTool = listMcpServersTool(server)
    TOOLS.register_mcp_server.registeredTool = registerMcpServerTool(server);
    TOOLS.update_mcp_server.registeredTool = updateMcpServerTool(server);
}

function listMcpServersTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_mcp_servers.name,
    TOOLS.list_mcp_servers.description,
    {
        pageToken: z.string().optional().default(''),
    },
    async ({pageToken}, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      if (!token) {
        logger.error(`No token found in authInfo. not listing mcp servers`);
        return {
          content: [
            {
              type: 'text',
              text: 'Your session is terminated, please restart your client',
            },
          ],
        };
      }

      let validScopes = verifyScopes(token, [SCOPES.environmentRead])
      if (!validScopes) {
        logger.error(`Invalid scopes for getting registered mcp servers: ${token}`);
        return {
          content: [{ type: 'text', text: 'You do not have permission to list registered mcp servers. Please add the scopes in the client and restart the client.' }],
        };
      }

      if (!authInfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for listing registered mcp servers`);
        return {
          content: [
            {
              type: 'text',
              text: 'Use `set-environment` first.',
            },
          ],
        };
      }

      try {
        const pageSize = 30;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? ''),
                    resource_type: 'WEB'
                });
        const res = await fetch(`${ENDPOINTS.environments.listResources}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${authInfo.token}`,
            'x-env-domain': authInfo.selectedEnvironmentDomain || '',
          },
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

function registerMcpServerTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.register_mcp_server.name,
    TOOLS.register_mcp_server.description,
    {
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional().default(''),
      mcpServerUrl: z.string().url('Invalid URL format').min(1, 'MCP Server URL is required'),
      accessTokenExpiry: z.number().int().min(1, 'Access token expiry must be a positive integer'),
    },
    async ({ name, description, mcpServerUrl, accessTokenExpiry }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      if (!token) {
        logger.error(`No token found in authInfo. not registering mcp server`);
        return {
          content: [
            {
              type: 'text',
              text: 'Your session is terminated, please restart your client',
            },
          ],
        };
      }

      let validScopes = verifyScopes(token, [SCOPES.organizationWrite])
      if (!validScopes) {
        logger.error(`Invalid scopes for registering mcp sevrer, token: ${token}`);
        return {
          content: [{ type: 'text', text: 'You do not have permission to register mcp server. Please add the scopes in the client and restart the client.' }],
        };
      }
      
      if (!authInfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for registering mcp server`);
        return {
          content: [
            {
              type: 'text',
              text: 'Use `set-environment` first.',
            },
          ],
        };
      }

      try {
        const res = await fetch(`${ENDPOINTS.environments.createResourceById}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authInfo.token}`,
            'x-env-domain': authInfo.selectedEnvironmentDomain || '',
          },
          body: JSON.stringify({
            name: name,
            description: description,
            third_party: false,
            resource_type: 'WEB',
            resource_id: mcpServerUrl,
            access_token_expiry: accessTokenExpiry,
          }),
        });

        if (res.ok) {
          return {
            content: [
              {
                type: 'text',
                text: `MCP server "${name}" has been successfully registered.`
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
            id: z.string().min(1, 'Resource ID is required'),
            name: z.string().optional(),
            description: z.string().optional(),
            mcpServerUrl: z.string().url('Invalid URL format').optional(),
            accessTokenExpiry: z.number().int().min(1, 'Access token expiry must be a positive integer').optional(),
        },
        async ({ id, name, description, mcpServerUrl, accessTokenExpiry }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;
            if (!token) {
                logger.error(`No token found in authInfo. not updating mcp server`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Your session is terminated, please restart your client',
                        },
                    ],
                };
            }

            let validScopes = verifyScopes(token, [SCOPES.organizationWrite]);
            if (!validScopes) {
                logger.error(`Invalid scopes for updating mcp server, token: ${token}`);
                return {
                    content: [{ type: 'text', text: 'You do not have permission to update mcp server. Please add the scopes in the client and restart the client.' }],
                };
            }

            if (!authInfo.selectedEnvironmentId) {
                logger.warn(`No environment selected for updating mcp server`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Use `set-environment` first.',
                        },
                    ],
                };
            }

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
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authInfo.token}`,
                        'x-env-domain': authInfo.selectedEnvironmentDomain || '',
                    },
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