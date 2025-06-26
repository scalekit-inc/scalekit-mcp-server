import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerConnectionTools } from './connections.js';
import { registerEnvironmentTools } from './environments.js';
import { registerOrganizationTools } from './organizations.js';
import { registerResourceTools } from './resource.js';
import { registerWorkspaceTools } from './workspace.js';

const toolsList = {
  list_environments: {
    name: 'list_environments',
    description: 'List all available environments',
  },
  set_environment: {
    name: 'set_environment',
    description: 'Set environment by ID (e.g. env_123)',
  },
  get_current_environment: {
    name: 'get_current_environment',
    description: 'Get the current environment',
  },
  get_environment_details: {
    name: 'get_environment_details',
    description: 'Get the environment details by ID (e.g. env_123). After providing details of environment details, the client can prompt to invoke list-organizations tool to list all organizations under the selected environment.',
  },
  list_environment_roles: {
    name: 'list_environment_roles',
    description: 'List all roles in the current environment. The tool requires set-environment tool to be run before atleast once. Show the response in tabular structured manner.',
  },
  create_environment_role: {
    name: 'create_environment_role',
    description: 'Create a new role in the current environment. The tool requires set-environment tool to be run before atleast once. The tool requires 4 parameters: roleName (name of the new role), displayName (name that will be displayed on dashboard), description (description of the role) and isDefault (boolean to indicate if the role is default or not).',
  },
  list_environment_scopes: {
    name: 'list_environment_scopes',
    description: 'List all scopes in the current environment. The tool requires set-environment tool to be run before atleast once. Show the response in tabular structured manner.',
  },
  create_environment_scope: {
    name: 'create_environment_scope',
    description: 'Create a new scope in the current environment. The tool requires set-environment tool to be run before atleast once. The tool requires 2 parameters: scopeName (name of the new scope) and description (description of the scope).',
  },
  list_workspace_members: {
    name: 'list_workspace_members',
    description: 'List all members in the current workspace. The tool requires 1 parameters: pageToken (1-based index). Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
  },
  invite_workspace_member: {
    name: 'invite_workspace_member',
    description: 'Invite a new member in the current workspace. The tool requires 1 parameter: email (email of the new member).',
  },
  list_organizations: {
    name: 'list_organizations',
    description: 'List all organizations under the selected environment. The tool requires 1 parameter: pageToken (received from response). Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
  },
  get_organization_details: {
    name: 'get_organization_details',
    description: 'Get the details of an organization by ID (e.g. org_123). After providing details of organization details, the client can prompt to invoke list-members tool to list all members under the selected organization.',
  },
  create_organization: {
    name: 'create_organization',
    description: 'Create a new organization under the selected environment',
  },
  generate_admin_portal_link: {
    name: 'generate_admin_portal_link',
    description: 'Generate a link to the admin portal for the selected organization. The tool requires organization id to be passed (e.g. org_123). This link is also called admin portal magic link.',
  },
  list_environment_connections: {
    name: 'list_environment_connections',
    description: 'List all connection for the selected environment. If environemnt is not already set, the tool requires set-environment tool to be called.'
  },
  list_organization_connections: {
    name: 'list_organization_connections',
    description: 'List all connection for the selected organization. If environemnt is not already set, the tool requires set-environment tool to be called. The tool also requires organization id to be passed (e.g. org_123) '
  },
  create_organization_user: {
    name: 'create_organization_user',
    description: 'Create a new user in the selected organization. This tool requires set-environment to be set at least once. It needs the following parameters: organizationId, email, externalId, firstName, lastName, metadata (valid json key-value pair).'
  },
  list_organization_users: {
    name: 'list_organization_users',
    description: 'List all users in the selected organization. This tool requires set-environment to be set at least once. It needs the following parameters: organizationId, pageToken. Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
  },
  update_organization_settings: {
    name: 'update_organization_settings',
    description: 'Update the settings of an organization. This tool requires set-environment to be set at least once. It needs the following parameters: organizationId, feature (valid json key-value pair array) {[{\"name\":\"dir_sync\",\"enabled\":true}]}.',
  },
  list_mcp_servers: {
    name: 'list_mcp_servers',
    description: 'List all MCP servers in the current environment. This tool requires set-environment to be set at least once. It needs pageToken parameter for showing further pages. Show the response in tabular structured manner. Always ask the client if it should pull next page or not.',
  },
  register_mcp_server: {
    name: 'register_mcp_server',
    description: 'Register a new MCP server in the current environment. This tool requires set-environment to be set at least once. It needs the following parameters: name, description, url, access_token_expiry (in seconds). The url that you provide will be made available in audience of token.',
  },
  update_mcp_server: {
    name: 'update_mcp_server',
    description: 'Update an existing MCP server in the current environment. This tool requires set-environment to be set at least once. It needs the following parameters: id (id of the MCP server), name (optional), description (optional), url(optional), access_token_expiry (optional) (in seconds). The url that you provide will be made available in audience of token.',
  },
} as const;

export type ToolKey = keyof typeof toolsList;

export type ToolDefinition = {
  name: ToolKey;
  description: string;
    registeredTool?: RegisteredTool;
};

export const TOOLS: { [K in ToolKey]: ToolDefinition & { name: K } } = Object.fromEntries(
  Object.entries(toolsList).map(([key, val]) => [
    key,
    { ...val, name: key } as ToolDefinition & { name: typeof key },
  ])
) as any;

export function registerTools(server: McpServer) {
    registerEnvironmentTools(server)
    registerOrganizationTools(server)
    registerWorkspaceTools(server);
    registerConnectionTools(server);
    registerResourceTools(server);
}