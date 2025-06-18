// src/tools/get-current-environment.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { verifyScopes } from '../lib/auth.js';
import { AuthInfo, Environment } from '../types';
import { ENDPOINTS } from '../types/endpoints.js';
import { SCOPES } from '../types/scopes.js';

export function registerGetCurrentEnvironmentTool(server: McpServer) {
  server.tool('get-current-environment', 'Get the current environment', async (context) => {
    const authInfo = context.authInfo as AuthInfo;
    const token = authInfo?.token;
    if (!token) {
      return {
        content: [
          {
            type: 'text',
            text: 'Your session is terminated, please restart your client',
          },
        ],
      };
    }

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
      };
    }

    if (!authInfo.selectedEnvironmentId) {
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
      const res = await fetch(`${ENDPOINTS.environments.getById(authInfo.selectedEnvironmentId)}`, {
        headers: { Authorization: `Bearer ${authInfo.token}` },
      });
      const data = (await res.json()) as { environment: Environment };

      return {
        content: [
          {
            type: 'text',
            text: `Current environment name is ${data.environment.display_name ?? data.environment.id}`,
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to fetch environment. Please check the if environment is correctly set or try again later.',
          },
        ],
      };
    }
  });
}