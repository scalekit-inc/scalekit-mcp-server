// src/tools/set-environment.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Environment } from '../types/index.js';

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
        logger.error('No token found in authInfo for set-environment');
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
      try {
            const res = await fetch(`${ENDPOINTS.environments.getById(authInfo.selectedEnvironmentId)}`, {
              headers: { Authorization: `Bearer ${authInfo.token}` },
            });
            const data = (await res.json()) as { environment: Environment };
            authInfo.selctEnvironmentDomain = data.environment.domain;
      } catch {
        logger.error(`Failed to fetch environment for get-current-environment: ${authInfo.selectedEnvironmentId}`);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set environment. Please check if the ID ${content} is correct.`,
            },
          ],
        };
      }

      context.authInfo = authInfo as any;

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