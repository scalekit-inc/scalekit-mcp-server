import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Environment, Role, Scope } from '../types/index.js';
import { TOOLS } from './index.js';

export function registerEnvironmentTools(server: McpServer) {
  TOOLS.list_environments.registeredTool = listEnvironmentsTool(server)
  TOOLS.get_environment_details.registeredTool = getEnvironmentDetailsTool(server);
  TOOLS.list_environment_roles.registeredTool = listEnvironmentRolesTool(server);
  TOOLS.create_environment_role.registeredTool = createEnvironmentRolesTool(server);
  TOOLS.create_environment_scope.registeredTool = createEnvironmentScopeTool(server);
  TOOLS.list_environment_scopes.registeredTool = listEnvironmentScopesTool(server);
}

function listEnvironmentsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_environments.name,
    TOOLS.list_environments.description,
    async (context) => {
      // Get token from request context
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;
      let environments: Environment[] = [];

      try {
        const res = await fetch(`${ENDPOINTS.environments.list}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { environments: Environment[] };
        environments = data.environments;
      } catch (err) {
        logger.error('Failed to fetch environments for list-environments', { error: err, token });
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

