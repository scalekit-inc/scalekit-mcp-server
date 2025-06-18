// src/tools/list-environments.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { AuthInfo, Environment } from '../types';
import { ENDPOINTS } from '../types/endpoints.js';
import { SCOPES } from '../types/scopes.js';

export function registerListEnvironmentsTool(server: McpServer) {
  server.tool('list-environments', 'List Environments', async (context) => {
    const authinfo = (context.authInfo as AuthInfo) ?? {};
    const token = authinfo.token;

    if (!token) {
      logger.error('No token found in authInfo for list-environments');
      return {
        content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
      };
    }

    let environments: Environment[] = [];

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      logger.error(`Invalid scopes for list-environments: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
      };
    }

    try {
      const res = await fetch(`${ENDPOINTS.environments.list}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { environments: Environment[] };
      environments = data.environments;
    } catch {
      logger.error('Failed to fetch environments', { error: 'Failed to fetch environments' });
      environments = [];
    }

    return {
      content: [
        {
          type: 'text',
          text: `Available environments:\n${environments.map((env) =>
            env.display_name ? `${env.id} (${env.display_name})` : env.id
          ).join('\n')}`,
        },
      ],
    };
  });
}
