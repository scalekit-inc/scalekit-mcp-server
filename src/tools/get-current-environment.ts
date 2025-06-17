// src/tools/get-current-environment.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { AuthInfo, Environment } from '../types';
import { ENDPOINTS } from '../types/endpoints.js';

export function registerGetCurrentEnvironmentTool(server: McpServer) {
  server.tool('get-current-environment', 'Get the current environment', async (context) => {
    const authInfo = context.authInfo as AuthInfo;

    if (!authInfo?.token) {
      return {
        content: [
          {
            type: 'text',
            text: 'Your session is terminated, please restart your client',
          },
        ],
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