// src/tools/list-environments.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { AuthInfo, Environment } from '../types';
import { ENDPOINTS } from '../types/endpoints.js';

export function registerListEnvironmentsTool(server: McpServer) {
  server.tool('list-environments', 'List Environments', async (context) => {
    const authinfo = (context.authInfo as AuthInfo) ?? {};
    const token = authinfo.token;

    if (!token) {
      return {
        content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
      };
    }

    let environments: Environment[] = [];

    try {
      const res = await fetch(`${ENDPOINTS.environments.list}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { environments: Environment[] };
      environments = data.environments;
    } catch {
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
