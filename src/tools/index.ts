import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SCOPES } from '../types/scopes.js';
import { registerConnectionTools } from './connections.js';
import { registerEnvironmentTools } from './environments.js';
import { registerOrganizationTools } from './organizations.js';
import { registerResourceTools } from './resource.js';
import { registerWorkspaceTools } from './workspace.js';

const toolsList = {
  list_environments: {
    name: 'list_environments',
    description: 'List all available environments',
    scopes: [SCOPES.environmentRead],
  },
  get_environment_details: {
    name: 'get_environment_details',
    description: 'Get the environment details by ID (e.g. env_123). After providing details of environment details, the client can prompt to invoke list-organizations tool to list all organizations under the selected environment.',
    scopes: [SCOPES.environmentRead],
  },
  list_environment_roles: {
    name: 'list_environment_roles',
    description: 'List all roles in the specified environment. Requires environmentId parameter (format: env_<number>). Show the response in tabular structured manner.',
    scopes: [SCOPES.environmentRead],
  },
  create_environment_role: {
    name: 'create_environment_role',
    description: 'Create a new role in the specified environment. Requires environmentId parameter (format: env_<number>). The tool requires 4 parameters: roleName (name of the new role), displayName (name that will be displayed on dashboard), description (description of the role) and isDefault (boolean to indicate if the role is default or not).',
    scopes: [SCOPES.environmentWrite],
  },
  list_environment_scopes: {
    name: 'list_environment_scopes',
    description: 'List all scopes in the specified environment. Requires environmentId parameter (format: env_<number>). Show the response in tabular structured manner.',
    scopes: [SCOPES.environmentRead],
  },
  create_environment_scope: {
    name: 'create_environment_scope',
    description: 'Create a new scope in the specified environment. Requires environmentId parameter (format: env_<number>). The tool requires 2 parameters: scopeName (name of the new scope) and description (description of the scope).',
    scopes: [SCOPES.environmentWrite],
  },
  list_workspace_members: {
    name: 'list_workspace_members',
    description: 'List all members in the current workspace. The tool requires 1 parameters: pageToken (1-based index). Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
    scopes: [SCOPES.workspaceRead],
  },
  invite_workspace_member: {
    name: 'invite_workspace_member',
    description: 'Invite a new member in the current workspace. The tool requires 1 parameter: email (email of the new member).',
    scopes: [SCOPES.workspaceWrite],
  },
  list_organizations: {
    name: 'list_organizations',
    description: 'List all organizations under the specified environment. Requires environmentId parameter (format: env_<number>). The tool requires 1 parameter: pageToken (received from response). Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
    scopes: [SCOPES.organizationRead],
  },
  get_organization_details: {
    name: 'get_organization_details',
    description: 'Get the details of an organization by ID (e.g. org_123). Requires environmentId parameter (format: env_<number>). After providing details of organization details, the client can prompt to invoke list-members tool to list all members under the selected organization.',
    scopes: [SCOPES.organizationRead],
  },
  create_organization: {
    name: 'create_organization',
    description: 'Create a new organization under the specified environment. Requires environmentId parameter (format: env_<number>).',
    scopes: [SCOPES.organizationWrite],
  },
  generate_admin_portal_link: {
    name: 'generate_admin_portal_link',
    description: 'Generate a link to the admin portal for the selected organization. Requires environmentId parameter (format: env_<number>). The tool requires organization id to be passed (e.g. org_123). This link is also called admin portal magic link.',
    scopes: [SCOPES.organizationWrite],
  },
  list_environment_connections: {
    name: 'list_environment_connections',
    description: 'List all connection for the specified environment. Requires environmentId parameter (format: env_<number>).',
    scopes: [SCOPES.environmentRead],
  },
  list_organization_connections: {
    name: 'list_organization_connections',
    description: 'List all connection for the selected organization. Requires environmentId parameter (format: env_<number>). The tool also requires organization id to be passed (e.g. org_123) ',
    scopes: [SCOPES.organizationRead],
  },
  create_environment_oidc_connection: {
    name: 'create_environment_oidc_connection',
    description: `Create a new OIDC connection for the specified environment. Requires environmentId parameter (format: env_<number>). This tool is responsible for creating the connection at environment level.
The tool requires the following parameters:
- provider: ("OKTA", "GOOGLE", "MICROSOFT_AD", "AUTH0", "ONELOGIN", "PING_IDENTITY", "JUMPCLOUD", "CUSTOM", "GITHUB", "GITLAB", "LINKEDIN", "SALESFORCE", "MICROSOFT", "IDP_SIMULATOR", "SCALEKIT", "ADFS")
The tool returns the connection details especially redirect_uri which should be used to configure the properties on the IDP side. Ask user to confirm if the redirect uri is configured at the idp end. Once done then come back and give all the details needed for update_environment_connection.
`,
    scopes: [SCOPES.environmentWrite],
  },
  update_environment_oidc_connection: {
    name: 'update_environment_oidc_connection',
    description: `Update an existing OIDC connection for the specified environment. Requires environmentId parameter (format: env_<number>). This tool is responsible for updating the connection at environment level. Ask for all these parameters expicitly always from user
The tool requires the following parameters:
- connectionId: (ID of the connection to enable, e.g. conn_123)
- key_id: (e.g. "GOOGLE", "DESCOPE", "OKTA", etc) - Should be in capital letters always
- provider: ("OKTA", "GOOGLE", "MICROSOFT_AD", "AUTH0", "ONELOGIN", "PING_IDENTITY", "JUMPCLOUD", "CUSTOM", "GITHUB", "GITLAB", "LINKEDIN", "SALESFORCE", "MICROSOFT", "IDP_SIMULATOR", "SCALEKIT", "ADFS")
- oidc_config: {
    issuer: uri,
    discovery_endpoint: uri,
    authorize_uri: uri,
    token_uri: uri,
    user_info_uri: uri,
    jwks_uri: uri,
    client_id: string,
    client_secret: string,
    scopes: string[],
    token_auth_type: uri,
    redirect_uri: uri,
    pkce_enabled: boolean,
    idp_logout_required: boolean,
    post_logout_redirect_uri: uri,
    backchannel_logout_redirect_uri: uri,
    The tool returns the connection details which should be reviewed. Once the user confirms, then invoke enable_environment_connection tool to enable the connection.`,
    scopes: [SCOPES.environmentWrite],
  },
  enable_environment_connection: {
    name: 'enable_environment_connection',
    description: `Enable an existing connection for the specified environment. Requires environmentId parameter (format: env_<number>). This tool requires the following parameters:
- connectionId: (ID of the connection to enable, e.g. conn_123)`,
    scopes: [SCOPES.environmentWrite],
  },
  create_organization_user: {
    name: 'create_organization_user',
    description: 'Create a new user in the selected organization. Requires environmentId parameter (format: env_<number>). It needs the following parameters: organizationId, email, role (role name). The role can be fetched by using list_environment_roles tool.',
    scopes: [SCOPES.organizationWrite],
  },
  list_organization_users: {
    name: 'list_organization_users',
    description: 'List all users in the selected organization. Requires environmentId parameter (format: env_<number>). It needs the following parameters: organizationId, pageToken. Show the response in tabular structured manner. After fetching each page, client should ask if it should pull next page or not.',
    scopes: [SCOPES.organizationRead],
  },
  update_organization_settings: {
    name: 'update_organization_settings',
    description: 'Update the settings of an organization. Requires environmentId parameter (format: env_<number>). It needs the following parameters: organizationId, feature (valid json key-value pair array) {[{\"name\":\"dir_sync\",\"enabled\":true}]}.',
    scopes: [SCOPES.organizationWrite],
  },
  list_mcp_servers: {
    name: 'list_mcp_servers',
    description: 'List all MCP servers in the specified environment. Requires environmentId parameter (format: env_<number>). It needs pageToken parameter for showing further pages. Show the response in tabular structured manner. Always ask the client if it should pull next page or not.',
    scopes: [SCOPES.environmentRead],
  },
  register_mcp_server: {
    name: 'register_mcp_server',
    description: 'Register a new MCP server in the specified environment. Requires environmentId parameter (format: env_<number>). It needs the following parameters: name, description, url, access_token_expiry (in seconds), provider (the unique key_id which the customer has setup for connection - this is needed only when use_scalekit_authentication is chosen to be false), use_scalekit_authentication (this is a flag to indicate if the mcp server will be using scalekit authentication solution). The url that you provide will be made available in audience of token. The tool returns resource metadata of the registered MCP server. Show in a structured JSON format for resource metadata and prompt the user to make sure this resource metadata json is published on their mcp server with endpoint /.well-known/oauth-protected-resource.',
    scopes: [SCOPES.environmentWrite],
  },
  update_mcp_server: {
    name: 'update_mcp_server',
    description: 'Update an existing MCP server in the specified environment. Requires environmentId parameter (format: env_<number>). It needs the following parameters: id (id of the MCP server), name (optional), description (optional), url(optional), access_token_expiry (optional) (in seconds), provider (the unique key_id which the customer has setup for connection and should be in capital letters - this is needed only when use_scalekit_authentication is chosen to be false), use_scalekit_authentication (this is a flag to indicate if the mcp server will be using scalekit authentication solution). The url that you provide will be made available in audience of token.',
    scopes: [SCOPES.environmentWrite],
  },
  switch_mcp_auth_to_scalekit: {
    name: 'switch_mcp_auth_to_scalekit',
    description: 'Switch the authentication of an existing MCP server to Scalekit authentication. Requires environmentId parameter (format: env_<number>). It needs the following parameters: id (id of the MCP server). The tool will update the MCP server to use Scalekit authentication solution.',
    scopes: [SCOPES.environmentWrite],
  }
} as const;

export type ToolKey = keyof typeof toolsList;

export type ToolDefinition = {
  name: ToolKey;
  description: string;
  registeredTool?: RegisteredTool;
  scopes: string[];
};

export const TOOLS: { [K in ToolKey]: ToolDefinition & { name: K } } = Object.fromEntries(
  Object.entries(toolsList).map(([key, val]) => [
    key,
    { ...val, name: key, scopes: [...val.scopes] } as ToolDefinition & { name: typeof key },
  ])
) as any;

export function registerTools(server: McpServer) {
    registerEnvironmentTools(server)
    registerOrganizationTools(server)
    registerWorkspaceTools(server);
    registerConnectionTools(server);
    registerResourceTools(server);
}