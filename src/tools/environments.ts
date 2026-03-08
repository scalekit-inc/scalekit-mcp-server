import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Client, Environment, ListClientsResponse, ListEnvironmentsResponse, Role, Scope } from '../types/index.js';
import { TOOLS } from './index.js';

export function registerEnvironmentTools(server: McpServer) {
  TOOLS.list_environments.registeredTool = listEnvironmentsTool(server)
  TOOLS.get_environment_details.registeredTool = getEnvironmentDetailsTool(server);
  TOOLS.get_environment_credentials.registeredTool = getEnvironmentCredentialsTool(server);
  TOOLS.list_environment_roles.registeredTool = listEnvironmentRolesTool(server);
  TOOLS.create_environment_role.registeredTool = createEnvironmentRolesTool(server);
  TOOLS.create_environment_scope.registeredTool = createEnvironmentScopeTool(server);
  TOOLS.list_environment_scopes.registeredTool = listEnvironmentScopesTool(server);
  TOOLS.list_redirect_uris.registeredTool = listRedirectUrisTool(server);
  TOOLS.add_redirect_uri.registeredTool = addRedirectUriTool(server);
  TOOLS.remove_redirect_uri.registeredTool = removeRedirectUriTool(server);
  TOOLS.set_initiate_login_uri.registeredTool = setInitiateLoginUriTool(server);
  TOOLS.remove_initiate_login_uri.registeredTool = removeInitiateLoginUriTool(server);
  TOOLS.add_post_logout_redirect_uri.registeredTool = addPostLogoutRedirectUriTool(server);
  TOOLS.remove_post_logout_redirect_uri.registeredTool = removePostLogoutRedirectUriTool(server);
}

function listEnvironmentsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environments.name,
    TOOLS.list_environments.description,
    {
      pageToken: z.string().optional(),
      pageSize: z.number().int().min(1).max(100).optional().default(20),
    },
    async ({ pageToken, pageSize }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const params = new URLSearchParams({ page_size: String(pageSize) });
        if (pageToken) params.set('page_token', pageToken);

        const res = await fetch(`${ENDPOINTS.environments.list}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as ListEnvironmentsResponse;
        const environments = data.environments ?? [];

        const rows = environments.map((env) =>
          `ID: ${env.id} | Name: ${env.display_name ?? 'N/A'} | Type: ${env.type ?? 'N/A'} | Domain: ${env.domain ?? 'N/A'} | Custom Domain: ${env.custom_domain ?? 'N/A'} | Custom Domain Status: ${env.custom_domain_status ?? 'N/A'}`
        ).join('\n');

        const pagination = data.next_page_token
          ? `\nNext page token: ${data.next_page_token}`
          : '\nNo more pages.';

        return {
          content: [{
            type: 'text',
            text: `Total environments: ${data.total_size ?? environments.length}\n\n${rows}${pagination}`,
          }],
        };
      } catch (err) {
        logger.error('Failed to fetch environments for list_environments', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to fetch environments. Please try again later.' }],
        };
      }
    });
}

function getEnvironmentDetailsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_environment_details.name,
    TOOLS.get_environment_details.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      try {
        const res = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { environment: Environment };

        return {
          content: [
            {
              type: 'text',
              text: `Environment name is ${data.environment.display_name ?? data.environment.id} with domain ${data.environment.domain}. This is a ${data.environment.type} environment. Custom Domain: ${data.environment.custom_domain ?? 'N/A'} and CustomDomain status is ${data.environment.custom_domain_status}.`,
            },
          ],
        };
      } catch {
        logger.error(`Failed to fetch environment for get-environment-details: ${environmentId}`);
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

function getEnvironmentCredentialsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_environment_credentials.name,
    TOOLS.get_environment_credentials.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const env = envData.environment;
        const domain = env.domain ?? '';

        const clientsRes = await fetch(`${ENDPOINTS.environments.listClients}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': domain,
          },
        });
        const clientsData = (await clientsRes.json()) as ListClientsResponse;
        const client: Client | undefined = clientsData.clients?.find(c => c.client_type === 'ENV') ?? clientsData.clients?.[0];

        if (!client) {
          return {
            content: [{ type: 'text', text: 'No API client found for this environment.' }],
          };
        }

        const secretLines = client.secrets?.length
          ? client.secrets.map(s =>
              `  - ID: ${s.id} | Suffix: ...${s.secret_suffix} | Status: ${s.status} | Last used: ${s.last_used_time}`
            ).join('\n')
          : '  None';

        const text = [
          `# ${env.display_name ?? environmentId} (${env.type ?? 'unknown'})`,
          '',
          'Copy this into your .env file:',
          '',
          `SCALEKIT_ENVIRONMENT_URL=https://${domain}`,
          `SCALEKIT_CLIENT_ID=${client.id}`,
          `SCALEKIT_CLIENT_SECRET=<retrieve from dashboard>`,
          '',
          `Active secrets (identify by suffix):`,
          secretLines,
          '',
          `To get your SCALEKIT_CLIENT_SECRET, visit:`,
          `https://app.scalekit.com > select "${env.display_name ?? environmentId}" > Settings > API Credentials`,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        logger.error('Failed to fetch credentials for get_environment_credentials', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to fetch environment credentials. Please try again later.' }],
        };
      }
    });
}

function listEnvironmentRolesTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_roles.name,
    TOOLS.list_environment_roles.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      var roles: Role[];

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.environments.listRoles}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });
        const data = (await res.json()) as { roles: Role[] };
        roles = data.roles;
      } catch (err) {
        logger.error('Failed to fetch environment roles for list_environment_roles', { error: err, token });
        roles = [];
      }

      return {
        content: [
          {
            type: 'text',
            text: roles.length
              ? `Available roles:\n${roles
                .map(
                  (role) =>
                    `ID: ${role.id}\nName: ${role.name}\nDisplay Name: ${role.display_name}\nDescription: ${role.description}\nDefault: ${role.default ? 'Yes' : 'No'}\n`
                )
                .join('\n')}`
              : 'No roles found for this environment.',
          },
        ],
      };
    });
}

function createEnvironmentRolesTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_environment_role.name,
    TOOLS.create_environment_role.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      roleName: z.string().min(1, 'Role name is required'),
      roleDisplayName: z.string().min(1, 'Role display name is required'),
      description: z.string().optional().default(''),
      isDefault: z.boolean().optional().default(false),
    },
    async ({ environmentId, roleName, roleDisplayName, description, isDefault }, context) => {

      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      var role: Role;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.environments.createRoleById(environmentId)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-env-domain': environmentDomain || '',
          },
          body: JSON.stringify({
            name: roleName,
            display_name: roleDisplayName,
            description: description,
            default: isDefault,
          }),
        });
        if (res.status > 399 && res.status < 500) {
          logger.error(`Failed to create role: ${res.statusText}. ${res.json()}`);
          return {
            content: [
              { type: 'text', text: 'Failed to create role. Please check if the environment is correctly set or if this role already exist or try again later.' }
            ],
          };
        }
        const data = (await res.json()) as { role: Role };
        role = data.role;
      } catch (err) {
        logger.error('Failed to fetch environment roles for list_environment_roles', { error: err, token });
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to create role. Please check if the environment is correctly set or try again later.'
            }
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Role created successfully:\nID: ${role.id}\nName: ${role.name}\nDisplay Name: ${role.display_name}\nDescription: ${role.description}\nDefault: ${role.default ? 'Yes' : 'No'}`,
          },
        ],
      };
    });
}

function createEnvironmentScopeTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_environment_scope.name,
    TOOLS.create_environment_scope.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      scopeName: z.string().min(1, 'Scope name is required'),
      description: z.string().optional().default(''),
    },
    async ({ environmentId, scopeName, description }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      var scope: Scope;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.environments.createScopeById(environmentId)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-env-domain': environmentDomain || '',
          },
          body: JSON.stringify({
            name: scopeName,
            description: description,
          }),
        });
        if (res.status > 399 && res.status < 500) {
          logger.error(`Failed to create scope: ${res.statusText}. ${res.json()}`);
          return {
            content: [
              { type: 'text', text: 'Failed to create scope. Please check if the environment is correctly set or if this scope already exist or try again later.' }
            ],
          };
        }
        const data = (await res.json()) as { scope: Scope };
        scope = data.scope;
      } catch (err) {
        logger.error('Failed to create environment scope for create_environment_scope', { error: err, token });
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to create scope. Please check if the environment is correctly set or try again later.'
            }
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scope created successfully:\nName: ${scope.name}\nDescription: ${scope.description}`,
          },
        ],
      };
    });
}

function listEnvironmentScopesTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environment_scopes.name,
    TOOLS.list_environment_scopes.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      var scopes: Scope[];

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const res = await fetch(`${ENDPOINTS.environments.listScopesById(environmentId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });
        const data = (await res.json()) as { scopes: Scope[] };
        scopes = data.scopes;
      } catch (err) {
        logger.error('Failed to fetch environment scopes for list_environment_scopes', { error: err, token });
        scopes = [];
      }

      return {
        content: [
          {
            type: 'text',
            text: scopes.length
              ? `Available scopes:\n${scopes
                .map(
                  (scope) =>
                    `Name: ${scope.name}\nDescription: ${scope.description}\n`
                )
                .join('\n')}`
              : 'No scopes found for this environment.',
          },
        ],
      };
    });
}

async function getEnvClient(token: string, environmentId: string): Promise<{ client: Client; domain: string }> {
  const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const envData = (await envRes.json()) as { environment: Environment };
  const domain = envData.environment.domain ?? '';

  const clientsRes = await fetch(`${ENDPOINTS.environments.listClients}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-env-domain': domain,
    },
  });
  const clientsData = (await clientsRes.json()) as ListClientsResponse;
  const client = clientsData.clients?.find(c => c.client_type === 'ENV') ?? clientsData.clients?.[0];

  if (!client) throw new Error('No ENV client found for this environment.');
  return { client, domain };
}

function listRedirectUrisTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_redirect_uris.name,
    TOOLS.list_redirect_uris.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);
        const uris = client.post_login_uris ?? [];
        const postLogoutUris = client.post_logout_redirect_uris ?? [];

        const initiateLoginUri = client.initiate_login_uri || '(not set)';
        const uriList = uris.length
          ? uris.map((u, i) => `${i + 1}. ${u}`).join('\n')
          : '(none)';
        const postLogoutList = postLogoutUris.length
          ? postLogoutUris.map((u, i) => `${i + 1}. ${u}`).join('\n')
          : '(none)';

        return {
          content: [{
            type: 'text',
            text: `Initiate Login URI: ${initiateLoginUri}\n\nAllowed redirect URIs (${uris.length}):\n${uriList}\n\nPost-logout redirect URIs (${postLogoutUris.length}):\n${postLogoutList}`,
          }],
        };
      } catch (err) {
        logger.error('Failed to list redirect URIs', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to fetch redirect URIs. Please try again later.' }],
        };
      }
    });
}

function addRedirectUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.add_redirect_uri.name,
    TOOLS.add_redirect_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      uri: z.string().url('Must be a valid URL'),
    },
    async ({ environmentId, uri }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);
        const existing = client.post_login_uris ?? [];

        if (existing.includes(uri)) {
          return {
            content: [{ type: 'text', text: `URI already in the allowed list: ${uri}` }],
          };
        }

        const updated = [...existing, uri];
        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client: { post_login_uris: updated },
            mask: { paths: ['post_login_uris'] },
          }),
        });

        if (!res.ok) {
          logger.error('Failed to add redirect URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to add redirect URI. Please try again later.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Redirect URI added successfully.\n\nUpdated list (${updated.length}):\n${updated.map((u, i) => `${i + 1}. ${u}`).join('\n')}`,
          }],
        };
      } catch (err) {
        logger.error('Failed to add redirect URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to add redirect URI. Please try again later.' }],
        };
      }
    });
}

function removeRedirectUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.remove_redirect_uri.name,
    TOOLS.remove_redirect_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      uri: z.string().url('Must be a valid URL'),
    },
    async ({ environmentId, uri }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);
        const existing = client.post_login_uris ?? [];

        if (!existing.includes(uri)) {
          return {
            content: [{ type: 'text', text: `URI not found in the allowed list: ${uri}` }],
          };
        }

        const updated = existing.filter(u => u !== uri);
        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client: { post_login_uris: updated },
            mask: { paths: ['post_login_uris'] },
          }),
        });

        if (!res.ok) {
          logger.error('Failed to remove redirect URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to remove redirect URI. Please try again later.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: updated.length
              ? `Redirect URI removed successfully.\n\nUpdated list (${updated.length}):\n${updated.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
              : 'Redirect URI removed successfully. No redirect URIs remaining.',
          }],
        };
      } catch (err) {
        logger.error('Failed to remove redirect URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to remove redirect URI. Please try again later.' }],
        };
      }
    });
}

function setInitiateLoginUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.set_initiate_login_uri.name,
    TOOLS.set_initiate_login_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      uri: z.string().url('Must be a valid URL'),
    },
    async ({ environmentId, uri }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);

        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ initiate_login_uri: uri }),
        });

        if (!res.ok) {
          logger.error('Failed to set initiate login URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to set initiate login URI. Please try again later.' }],
          };
        }

        return {
          content: [{ type: 'text', text: `Initiate login URI set successfully: ${uri}` }],
        };
      } catch (err) {
        logger.error('Failed to set initiate login URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to set initiate login URI. Please try again later.' }],
        };
      }
    });
}

function removeInitiateLoginUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.remove_initiate_login_uri.name,
    TOOLS.remove_initiate_login_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);

        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ initiate_login_uri: '' }),
        });

        if (!res.ok) {
          logger.error('Failed to remove initiate login URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to remove initiate login URI. Please try again later.' }],
          };
        }

        return {
          content: [{ type: 'text', text: 'Initiate login URI removed successfully.' }],
        };
      } catch (err) {
        logger.error('Failed to remove initiate login URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to remove initiate login URI. Please try again later.' }],
        };
      }
    });
}


function addPostLogoutRedirectUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.add_post_logout_redirect_uri.name,
    TOOLS.add_post_logout_redirect_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      uri: z.string().url('Must be a valid URL'),
    },
    async ({ environmentId, uri }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);
        const existing = client.post_logout_redirect_uris ?? [];

        if (existing.includes(uri)) {
          return {
            content: [{ type: 'text', text: `URI already in the post-logout redirect list: ${uri}` }],
          };
        }

        const updated = [...existing, uri];
        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ post_logout_redirect_uris: updated }),
        });

        if (!res.ok) {
          logger.error('Failed to add post-logout redirect URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to add post-logout redirect URI. Please try again later.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Post-logout redirect URI added successfully.\n\nUpdated list (${updated.length}):\n${updated.map((u, i) => `${i + 1}. ${u}`).join('\n')}`,
          }],
        };
      } catch (err) {
        logger.error('Failed to add post-logout redirect URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to add post-logout redirect URI. Please try again later.' }],
        };
      }
    });
}

function removePostLogoutRedirectUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.remove_post_logout_redirect_uri.name,
    TOOLS.remove_post_logout_redirect_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      uri: z.string().url('Must be a valid URL'),
    },
    async ({ environmentId, uri }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const { client } = await getEnvClient(token, environmentId);
        const existing = client.post_logout_redirect_uris ?? [];

        if (!existing.includes(uri)) {
          return {
            content: [{ type: 'text', text: `URI not found in the post-logout redirect list: ${uri}` }],
          };
        }

        const updated = existing.filter(u => u !== uri);
        const res = await fetch(`${ENDPOINTS.environments.updateClientById(client.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ post_logout_redirect_uris: updated }),
        });

        if (!res.ok) {
          logger.error('Failed to remove post-logout redirect URI', { status: res.status });
          return {
            content: [{ type: 'text', text: 'Failed to remove post-logout redirect URI. Please try again later.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: updated.length
              ? `Post-logout redirect URI removed successfully.\n\nUpdated list (${updated.length}):\n${updated.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
              : 'Post-logout redirect URI removed successfully. No post-logout redirect URIs remaining.',
          }],
        };
      } catch (err) {
        logger.error('Failed to remove post-logout redirect URI', { error: err });
        return {
          content: [{ type: 'text', text: 'Failed to remove post-logout redirect URI. Please try again later.' }],
        };
      }
    });
}
