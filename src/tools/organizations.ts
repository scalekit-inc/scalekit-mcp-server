import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo } from '../types/index.js';
import { SCOPES } from '../types/scopes.js';
import { TOOLS } from './index.js';

interface OrgResponse {
  organization: {
    id: string;
    display_name: string;
  };
}

export function registerOrganizationTools(server: McpServer){
  TOOLS.create_organization.registeredTool = createOrganizationTool(server)
}

function createOrganizationTool(server: McpServer): RegisteredTool {
 return server.tool(
    TOOLS.create_organization.name,
    TOOLS.create_organization.description,
    {
      content: z.string().min(1, 'Organization name is required'),
    },
    async ({ content }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      if (!token) {
        logger.error(`No token found in authInfo. not creating organization${content}`);
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
        logger.error(`Invalid scopes for creating organization: ${content}, token: ${token}`);
        return {
          content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
        };
      }
      
      if (!authInfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for creating organization: ${content}`);
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
        const res = await fetch(`${ENDPOINTS.organizations.create}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authInfo.token}`,
            'x-env-domain': authInfo.selctEnvironmentDomain || '',
          },
          body: JSON.stringify({
            environment_id: authInfo.selectedEnvironmentId,
            display_name: content,
          }),
        });

        const orgDetails = (await res.json()) as OrgResponse;
        const orgId = orgDetails.organization.id;

        return {
          content: [
            {
              type: 'resource',
              resource: {
                uri: `environment://${authInfo.selctEnvironmentDomain}/organization://${orgId}`,
                text: JSON.stringify(orgDetails, null, 2),
                mimeType: 'application/json',
              }
            }
          ]
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