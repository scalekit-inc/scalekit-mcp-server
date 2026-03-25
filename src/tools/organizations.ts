import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { envHeaders, getEnvironmentDomain } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, GenerateAdminPortalLinkResponse, GetOrganizationResponse, ListOrganizationsResponse, ListUsersResponse } from '../types/index.js';
import { environmentIdSchema, organizationIdSchema, validateEmail } from '../validators/types.js';
import { TOOLS } from './index.js';

interface OrgResponse {
  organization: {
    id: string;
    display_name: string;
  };
}

export function registerOrganizationTools(server: McpServer){
  TOOLS.create_organization.registeredTool = createOrganizationTool(server)
  TOOLS.list_organizations.registeredTool = listOrganizationsTool(server);
  TOOLS.get_organization_details.registeredTool = getOrganizationDetailsTool(server);
  TOOLS.generate_admin_portal_link.registeredTool = generateAdminPortalLinkTool(server);
  TOOLS.create_organization_user.registeredTool = createOrganizationUserTool(server);
  TOOLS.list_organization_users.registeredTool = listOrganizationUsersTool(server);
  TOOLS.update_organization_settings.registeredTool = updateOrganizationSettingsTool(server);
}

function createOrganizationTool(server: McpServer): RegisteredTool {
 return server.tool(
    TOOLS.create_organization.name,
    TOOLS.create_organization.description,
    {
      environmentId: environmentIdSchema,
      organizationName: z.string().min(1, 'Organization name is required'),
    },
    async ({ environmentId, organizationName }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.organizations.create}`, {
          method: 'POST',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            environment_id: environmentId,
            display_name: organizationName,
          }),
        });

        const orgDetails = (await res.json()) as OrgResponse;

        return {
          content: [
            {
              type: 'text',
              text:
          `Organization created successfully!\n` +
          `  Name: ${orgDetails.organization.display_name}\n` +
          `  ID: ${orgDetails.organization.id}\n`
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

function listOrganizationsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_organizations.name,
    TOOLS.list_organizations.description,
    {
      environmentId: environmentIdSchema,
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const pageSize = 30;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? '')
                });

        const res = await fetch(`${ENDPOINTS.organizations.list}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        const data = await res.json() as ListOrganizationsResponse;
        logger.info(`Next Page Token is: ${data.next_page_token}`);
        if (!data.organizations || data.organizations.length === 0) {
          return {
            content: [
              {
          type: 'text',
          text: 'No organizations found in the selected environment.',
              },
            ],
            _meta: {
              nextPageToken: data.next_page_token || null,
            },
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: data.organizations
          .map(
            (org, idx) =>
              `Organization ${idx + 1}:\n` +
              `  Name: ${org.display_name}\n` +
              `  ID: ${org.id || 'N/A'}\n` +
              `  External ID: ${org.external_id || 'N/A'}\n`
          )
          .join('\n') +
          (data.next_page_token ? `\n\nNext Page Token: ${data.next_page_token}` : '\n\nNo more pages available')
          },
          ],
        };
      } catch (error) {
        logger.error(`Failed to fetch organizations`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch organizations. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function getOrganizationDetailsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_organization_details.name,
    TOOLS.get_organization_details.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
    },
    async ({ environmentId, organizationId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.organizations.getById(organizationId)}`, {
          headers: envHeaders(token, environmentDomain),
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch organization details: ${res.statusText}`);
        }

        const orgDetails = await res.json() as GetOrganizationResponse;

        return {
          content: [
            {
              type: 'text',
              text: `Organization Details:\n` +
                    `  Name: ${orgDetails.organization.display_name}\n` +
                    `  ID: ${orgDetails.organization.id}\n` +
                    ` External ID: ${orgDetails.organization.external_id || 'N/A'}\n` +
                    `  Settings: ${JSON.stringify(orgDetails.organization.settings, null, 2)}\n`
            }
          ]
        };
      } catch (error) {
        logger.error(`Failed to fetch organization details`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch organization details. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function generateAdminPortalLinkTool(server: McpServer): RegisteredTool {
   return server.tool(
    TOOLS.generate_admin_portal_link.name,
    TOOLS.generate_admin_portal_link.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
    },
    async ({ environmentId, organizationId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.organizations.generateAdminPortalLink(organizationId)}`, {
          method: 'PUT',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({}),
        });

        const data = (await res.json()) as GenerateAdminPortalLinkResponse;
        let link = data.link;
        return {
          content: [
            {
              type: 'text',
              text: `Admin Portal Link generated successfully!\n` +
                    `  Link: ${link.location}\n` +
                    `  Expire Time: ${link.expire_time ? new Date(link.expire_time).toLocaleString() : 'N/A'}\n`
            }
          ]
        };
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to generate admin portal link. Please try again.',
            },
          ],
        };
      }
    }
  );
}

function createOrganizationUserTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_organization_user.name,
    TOOLS.create_organization_user.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
      email: z.string().min(1, 'Email is required'),
      role: z.string().min(1, 'Role is required'),
    },
    async ({ environmentId, organizationId, email, role }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      const emailError = validateEmail(email);
      if (emailError !== null) {
        return { content: [{ type: 'text', text: emailError }] };
      }

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.organizations.createOrganizationUser(organizationId)}`, {
          method: 'POST',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            email: email,
            membership: {
              roles: [
                {
                  name: role
                }
              ]
            },
          }),
        });

        if (!res.ok) {
          logger.error('Failed to create organization user', { status: res.statusText });
          return {
            content: [{ type: 'text', text: 'Failed to create organization user. Please try again.' }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Organization user created successfully!\n  Email: ${email}\n  Organization ID: ${organizationId}\n  Role: ${role}\n`,
            },
          ],
        };
      } catch (error) {
        logger.error(`Failed to create organization user`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to create organization user. Please try again.',
            },
          ],
        };
      }
    }
  );
}

function listOrganizationUsersTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_organization_users.name,
    TOOLS.list_organization_users.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, organizationId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const pageSize = 100;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? '')
                });

        const res = await fetch(`${ENDPOINTS.organizations.listOrganizationUsers(organizationId)}?${params.toString()}`, {
          headers: envHeaders(token, environmentDomain),
        });

        const data = await res.json() as ListUsersResponse;
        logger.info(`Next Page Token is: ${data.next_page_token}`);
        if (!data.users || data.users.length === 0) {
          return {
            content: [
              {
          type: 'text',
          text: 'No organization users found in the selected environment.',
              },
            ],
            _meta: {
              nextPageToken: data.next_page_token || null,
            },
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: data.users
          .map(
            (user, idx) =>
              `User ${idx + 1}:\n` +
              `  Email: ${user.email || 'N/A'}\n` +
              `  ID: ${user.id || 'N/A'}\n` +
              `  First Name: ${user.user_profile?.first_name || 'N/A'}\n` +
              `  Last Name: ${user.user_profile?.last_name || 'N/A'}\n`
          )
          .join('\n') +
          (data.next_page_token ? `\n\nNext Page Token: ${data.next_page_token}` : '\n\nNo more pages available')
          },
          ],
        };
      } catch (error) {
        logger.error(`Failed to fetch organization users`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to fetch organization users. Please try again later.',
            },
          ],
        };
      }
    }
  );
}

function updateOrganizationSettingsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.update_organization_settings.name,
    TOOLS.update_organization_settings.description,
    {
      environmentId: environmentIdSchema,
      organizationId: organizationIdSchema,
      features: z
        .array(
          z.object({
            name: z.string().min(1, 'Feature name is required'),
            enabled: z.boolean(),
          })
        )
        .min(1, 'At least one feature must be provided'),
    },
    async ({ environmentId, organizationId, features }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);

        const res = await fetch(`${ENDPOINTS.organizations.updateSettings(organizationId)}`, {
          method: 'PATCH',
          headers: envHeaders(token, environmentDomain, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            features: features.map((feature) => ({
              name: feature.name,
              enabled: Boolean(feature.enabled),
            })),
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to update organization settings: ${JSON.stringify(await res.json())}`);
        }

        return {
          content: [
            {
              type: 'text',
              text:
                `Organization settings updated successfully!\n` +
                `  Organization ID: ${organizationId}\n` +
                `  Features: ${JSON.stringify(features, null, 2)}\n`,
            },
          ],
        };
      } catch (error) {
        logger.error(
          `Failed to update organization settings. Make sure the feature is registered at environment level. If you continue facing issues, please try after sometime.`,
          error
        );
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to update organization settings. Please try again.',
            },
          ],
        };
      }
    }
  );
}