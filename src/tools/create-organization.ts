// src/tools/create-organization.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo } from '../types/index.js';

interface OrgResponse {
  organization: {
    id: string;
    display_name: string;
  };
}

export function registerCreateOrganizationTool(server: McpServer) {
  server.tool(
    'create-organization',
    'Create a new organization under the selected environment',
    {
      content: z.string().min(1, 'Organization name is required'),
    },
    async ({ content }, context) => {
      const authInfo = context.authInfo as AuthInfo;

      if (!authInfo?.token || !authInfo.selectedEnvironmentId) {
        return {
          content: [
            {
              type: 'text',
              text: 'Your session is terminated, please restart your client',
            },
          ],
        };
      }

      try {
        const res = await fetch(`${ENDPOINTS.organizations.create}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authInfo.token}`,
          },
          body: JSON.stringify({
            environment_id: authInfo.selectedEnvironmentId,
            display_name: content,
          }),
        });

        const orgDetails = (await res.json()) as OrgResponse;

        return {
          content: [
            {
              type: 'text',
              text: `Organization created: ${orgDetails.organization.display_name} (ID: ${orgDetails.organization.id})`,
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to create organization. Please try again.',
            },
          ],
        };
      }
    }
  );
}