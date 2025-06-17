// src/tools/set-environment.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthInfo } from '../types/index.js';

export function registerSetEnvironmentTool(server: McpServer) {
  server.tool(
    'set-environment',
    'Set environment by ID (e.g. env_123)',
    {
        content: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ content }, context) => {
      const authInfo = (context.authInfo ?? {}) as AuthInfo;

      if (!authInfo.token) {
        return {
          content: [
            {
              type: 'text',
              text: 'Your session is terminated, please restart your client',
            },
          ],
        };
      }

      authInfo.selectedEnvironmentId = content;
      context.authInfo = authInfo as any;;

      return {
        content: [
          {
            type: 'text',
            text: `Environment set to ${content}`,
          },
        ],
        _meta: {
          usage: 'Always pass environment ID like env_123. If you have a name, call list-environments first to resolve the ID.',
        },
      };
    }
  );
}