import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { verifyScopes } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Environment } from '../types/index.js';
import { SCOPES } from '../types/scopes.js';
import { TOOLS } from './index.js';

export function registerEnvironmentTools(server: McpServer){
    TOOLS.list_environments.registeredTool = listEnvironmentsTool(server)
    TOOLS.set_environment.registeredTool = setEnvironmentTool(server)
    TOOLS.get_current_environment.registeredTool = getCurrentEnvironmentTool(server)
    // do not uncomment below, it has been kept for future when clients are more evolved in terms of loading resources
    // registerEnvironmentResource(server);
}

// the below is commented as clients load the resource from the server only once
// export function registerEnvironmentResource(server: McpServer) {
//   server.resource(
//     'environment',
//     new ResourceTemplate('environment://{envId}', {
//       list: async (context) => {
//         const authinfo = (context.authInfo as AuthInfo) ?? {};
//         const token = authinfo.token;

//         if (!token) {
//           logger.error('No token found in authInfo for list-environments');
//           return {
//             resources: [],
//             content: [{ type: 'text', text: 'Your session is terminated, please restart your client' }],
//           };
//         }

//         let environments: Environment[] = [];

//         let validScopes = verifyScopes(token, [SCOPES.environmentRead]);
//         if (!validScopes) {
//           logger.error(`Invalid scopes for list-environments: ${token}`);
//           return {
//             resources: [],
//             content: [{ type: 'text', text: 'You do not have permission to list environments. Please add the scopes in the client and restart the client.' }],
//           };
//         }

//         try {
//           const res = await fetch(`${ENDPOINTS.environments.list}`, {
//             headers: { Authorization: `Bearer ${token}` },
//           });
//           const data = (await res.json()) as { environments: Environment[] };
//           environments = data.environments;
//         } catch (err) {
//           logger.error('Failed to fetch environments for list-environments', { error: err, token });
//           environments = [];
//           return {
//             resources: [],
//             content: [{ type: 'text', text: 'Failed to fetch environments. Please try again later.' }],
//           };
//         }
//         return {
//           resources: environments.map((env) => ({
//             uri: `environment://${env.id}`,
//             name: env.display_name ?? env.id,
//             mimeType: 'application/json',
//           })),
//         };
//       },
//       complete: {}
//     }),
//     {
//       name: 'Environment',
//       description: 'Access environments by ID',
//     },
//     async (uri, context, internalContext) => {
//       const authInfo = internalContext.authInfo as AuthInfo;
//       const envDomain = context.envDomain as string;
//       const envId = context.envId as string
//       if (!authInfo?.token) {
//         logger.error('No token found in authInfo while accessing environment resource.');
//         throw new Error('Unauthorized');
//       }
//       try {
//         const res = await fetch(`${ENDPOINTS.environments.getById(envId)}`, {
//           headers: { 
//             Authorization: `Bearer ${authInfo.token}`,
//           }
//         });
//         if (!res.ok) {
//           logger.error(`Failed to fetch environment: ${envId}`);
//           throw new Error('Failed to fetch environment');
//         }
//         const env = await res.json();
//         return {
//           type: 'resource',
//           contents: [
//             {
//               uri: uri.toString(),
//               mimeType: 'application/json',
//               text: JSON.stringify(env, null, 2),
//             }
//           ]
//         };
//       } catch (error) {
//         logger.error(`Error fetching environment resource: ${error}`);
//         throw error;
//       }
//     }
//   );
// }

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

function getCurrentEnvironmentTool(server: McpServer): RegisteredTool {
    return server.tool('get_current_environment', 'Get the current environment', async (context) => {
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


