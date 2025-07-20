import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { Environment, AuthInfo, GenerateAdminPortalLinkResponse, GetOrganizationResponse, ListOrganizationsResponse, ListUsersResponse } from '../types/index.js';
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationName: z.string().min(1, 'Organization name is required'),
    },
    async ({ environmentId, organizationName }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.organizations.create}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const pageSize = 30;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? '')
                });

        const res = await fetch(`${ENDPOINTS.organizations.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
    },
    async ({ environmentId, organizationId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.organizations.getById(organizationId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
    },
    async ({ environmentId, organizationId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.organizations.generateAdminPortalLink(organizationId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
      email: z.string().email('Invalid email format').min(1, 'Email is required'),
      externalId: z.string().optional().default(''),
      firstName: z.string().optional().default(''),
      lastName: z.string().optional().default(''),
      metadata: z.record(z.string(), z.any()).optional(),
    },
    async ({ environmentId, organizationId, email, externalId, firstName, lastName, metadata }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.organizations.createOrganizationUser(organizationId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
          body: JSON.stringify({
            email: email,
            external_id: externalId,
            user_profile: {
              first_name: firstName,
              last_name: lastName,
              name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
            },
            metadata: metadata || {},
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to create organization user: ${res.statusText}`);
        }

        if (res.ok) {
          return {
            content: [
              {
                type: 'text',
                text: `Organization user created successfully!\n` +
                      `  Email: ${email}\n` +
                      `  Organization ID: ${organizationId}\n` +
                      (externalId ? `  External ID: ${externalId}\n` : '') +
                      (firstName ? `  First Name: ${firstName}\n` : '') +
                      (lastName ? `  Last Name: ${lastName}\n` : '') +
                      (metadata ? `  Metadata: ${JSON.stringify(metadata, null, 2)}\n` : ''),
              }
            ]
          };
        } else {
          logger.error(`Failed to create organization user: ${res.statusText}`);
          return {
            content: [
              {
                type: 'text',
                text: 'Failed to create organization user. Please try again.',
              },
            ],
          };
        }
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, organizationId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const pageSize = 100;
        const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? '')
                });

        const res = await fetch(`${ENDPOINTS.organizations.listOrganizationUsers(organizationId)}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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
              `  External ID: ${user.external_id || 'N/A'}\n` +
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
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      organizationId: z.string().regex(/^org_\w+$/, 'Organization ID must start with org_'),
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

      if (!features || features.length === 0) {
        logger.warn(`No features provided for updating organization settings for ${organizationId}`);
        return {
          content: [
            {
              type: 'text',
              text: 'No features provided to update. Please provide valid features.',
            },
          ],
        };
      }

      try {
        // First get environment details to get the domain
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.organizations.updateSettings(organizationId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
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