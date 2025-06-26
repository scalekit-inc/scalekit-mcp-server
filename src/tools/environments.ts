import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Environment, Role } from '../types/index.js';
import { SCOPES } from '../types/scopes.js';
import { TOOLS } from './index.js';

export function registerEnvironmentTools(server: McpServer){
    TOOLS.list_environments.registeredTool = listEnvironmentsTool(server)
    TOOLS.set_environment.registeredTool = setEnvironmentTool(server)
    TOOLS.get_current_environment.registeredTool = getCurrentEnvironmentTool(server)
    TOOLS.get_environment_details.registeredTool = getEnvironmentDetailsTool(server);
    TOOLS.list_environment_roles.registeredTool = listEnvironmentRolesTool(server);
    TOOLS.create_environment_role.registeredTool = createEnvironmentRolesTool(server);
}

function listEnvironmentsTool(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.list_environments.name,
        TOOLS.list_environments.description,
        async (context) => {
    const authinfo = (context.authInfo as AuthInfo) ?? {};
    const token = authinfo.token;

    if (!token) {
      logger.error('No token found in authInfo for list-environments');
      return {
        content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
      };
    }

    let environments: Environment[] = [];

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      logger.error(`Invalid scopes for list-environments: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
      };
    }

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

function setEnvironmentTool(server: McpServer): RegisteredTool {
    return server.tool(
    TOOLS.set_environment.name,
    TOOLS.set_environment.description,
    {
        environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
    },
    async ({ environmentId }, context) => {
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

      authInfo.selectedEnvironmentId = environmentId;
      try {
            const res = await fetch(`${ENDPOINTS.environments.getById(authInfo.selectedEnvironmentId)}`, {
              headers: { Authorization: `Bearer ${authInfo.token}` },
            });
            const data = (await res.json()) as { environment: Environment };
            authInfo.selectedEnvironmentDomain = data.environment.domain;
      } catch {
        logger.error(`Failed to fetch environment for get-current-environment: ${authInfo.selectedEnvironmentId}`);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set environment. Please check if the ID ${environmentId} is correct.`,
            },
          ],
        };
      }

      context.authInfo = authInfo as any;

      return {
        content: [
          {
            type: 'text',
            text: `Environment set to ${environmentId}`,
          },
        ],
        _meta: {
          usage: 'Always pass environment ID like env_123. If you have a name, call list-environments first to resolve the ID.',
        },
      };
    }
  );
}

function getCurrentEnvironmentTool(server: McpServer): RegisteredTool {
    return server.tool(TOOLS.get_current_environment.name, TOOLS.get_current_environment.description, async (context) => {
    const authInfo = context.authInfo as AuthInfo;
    const token = authInfo?.token;
    if (!token) {
      logger.error(`No token found in authInfo for get-current-environment`);
      return {
        content: [
          {
            type: 'text',
            text: 'Your session is terminated, please restart your client',
          },
        ],
      };
    }

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      logger.error(`Invalid scopes for get-current-environment: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
      };
    }

    if (!authInfo.selectedEnvironmentId) {
      logger.warn(`No environment selected for get-current-environment`);
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
      logger.error(`Failed to fetch environment for get-current-environment: ${authInfo.selectedEnvironmentId}`);
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

function getEnvironmentDetailsTool(server: McpServer): RegisteredTool {
    return server.tool(
      TOOLS.get_environment_details.name,
      TOOLS.get_environment_details.description,
      {
        environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      },
      async ({environmentId},context) => {
    const authInfo = context.authInfo as AuthInfo;
    const token = authInfo?.token;
    if (!token) {
      logger.error(`No token found in authInfo for get-current-environment`);
      return {
        content: [
          {
            type: 'text',
            text: 'Your session is terminated, please restart your client',
          },
        ],
      };
    }

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      logger.error(`Invalid scopes for get-current-environment: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
      };
    }

    try {
      const res = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
        headers: { Authorization: `Bearer ${authInfo.token}` },
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
      logger.error(`Failed to fetch environment for get-current-environment: ${authInfo.selectedEnvironmentId}`);
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
        async (context) => {
    const authinfo = (context.authInfo as AuthInfo) ?? {};
    const token = authinfo.token;

    if (!token) {
      logger.error('No token found in authInfo for list_environment_roles');
      return {
        content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
      };
    }

    var roles: Role[];

    let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
    if (!validScopes) {
      logger.error(`Invalid scopes for list_environment_roles: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to list environment roles. Please add the scopes in the client and restart the client.' }],
      };
    }

    if (!authinfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for listing organizations`);
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
      const res = await fetch(`${ENDPOINTS.environments.listRoles}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'x-env-domain': authinfo.selectedEnvironmentDomain || '',
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
          roleName: z.string().min(1, 'Role name is required'),
          roleDisplayName: z.string().min(1, 'Role display name is required'),
          description: z.string().optional().default(''),
          isDefault: z.boolean().optional().default(false),
        },
        async ({roleName, roleDisplayName, description, isDefault}, context) => {
    const authinfo = (context.authInfo as AuthInfo) ?? {};
    const token = authinfo.token;

    if (!token) {
      logger.error('No token found in authInfo for create_environment_role');
      return {
        content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
      };
    }

    var role: Role;

    let validScopes = verifyScopes(token, [SCOPES.environmentWrite]);
    if (!validScopes) {
      logger.error(`Invalid scopes for create_environment_role: ${token}`);
      return {
        content: [{ type: 'text', text: 'You do not have permission to create environment roles. Please add the scopes in the client and restart the client.' }],
      };
    }

    if (!authinfo.selectedEnvironmentId) {
        logger.warn(`No environment selected for creating roles`);
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
      const res = await fetch(`${ENDPOINTS.environments.createRoleById(authinfo.selectedEnvironmentId)}`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'x-env-domain': authinfo.selectedEnvironmentDomain || '',
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
          { type: 'text', 
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



