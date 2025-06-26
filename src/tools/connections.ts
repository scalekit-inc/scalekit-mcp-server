import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, ListConnectionsResponse } from '../types/index.js';
import { SCOPES } from '../types/scopes.js';
import { TOOLS } from './index.js';

export function registerConnectionTools(server: McpServer){
  TOOLS.list_environment_connections.registeredTool = getEnvironmentConnectionsTool(server)
  TOOLS.list_organization_connections.registeredTool = getOrganizationConnectionsTool(server);
}

function getEnvironmentConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_connections.name,
    TOOLS.list_environment_connections.description,
    async (context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      if (!token) {
        logger.error(`No token found in authInfo. not getting connection details`);
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
        logger.error(`Invalid scopes for getting connection details: ${token}`);
        return {
          content: [{ type: 'text', text: 'You do not have permission to get connection details. Please add the scopes in the client and restart the client.' }],
        };
      }

      if (!authInfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for getting connection details`);
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
        const params = new URLSearchParams({
                    include: 'all',
                });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${authInfo.token}`,
            'x-env-domain': authInfo.selectedEnvironmentDomain || '',
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
        organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
    },
    async ({organizationId},context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      if (!token) {
        logger.error(`No token found in authInfo. not getting connection details`);
        return {
          content: [
            {
              type: 'text',
              text: 'Your session is terminated, please restart your client',
            },
          ],
        };
      }

      let validScopes = verifyScopes(token, [SCOPES.organizationRead])
      if (!validScopes) {
        logger.error(`Invalid scopes for getting connection details: ${token}`);
        return {
          content: [{ type: 'text', text: 'You do not have permission to get connection details. Please add the scopes in the client and restart the client.' }],
        };
      }

      if (!authInfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for getting connection details`);
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
        const params = new URLSearchParams({
                    organizationId: organizationId,
                    include: 'all',
                });
        const res = await fetch(`${ENDPOINTS.connections.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${authInfo.token}`,
            'x-env-domain': authInfo.selectedEnvironmentDomain || '',
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