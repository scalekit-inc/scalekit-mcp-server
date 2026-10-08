import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { SCOPES } from '../types/scopes.js';
import { registerConnectionTools } from './connections.js';
import { registerDocsTools } from './docs.js';
import { registerEnvironmentTools } from './environments.js';
import { registerOrganizationTools } from './organizations.js';
import { registerResourceTools } from './resource.js';
import { registerToolSearchTools } from './tool-search.js';
import { registerWorkspaceTools } from './workspace.js';

const readTool: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const readOpenTool: ToolAnnotations = {
  ...readTool,
  openWorldHint: true,
};

const createTool: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const writeTool: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const removeTool: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const toolsList = {
  list_environments: {
    name: 'list_environments',
    description: 'List environments in the current workspace, one page at a time. Use this to discover environment ids. Use get_environment_details when you already have an id. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  get_environment_details: {
    name: 'get_environment_details',
    description: 'Read one environment by id, including its type and domain. Use list_environments when you need to discover an id. This tool does not list organizations. Use list_organizations for that. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  list_environment_roles: {
    name: 'list_environment_roles',
    description: 'List roles defined in one environment. Use create_environment_role to add a role. This tool does not list permission scopes. Use list_environment_scopes for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  create_environment_role: {
    name: 'create_environment_role',
    description: 'Create one role in an environment. Use list_environment_roles to see roles that already exist. This tool does not create a permission scope. Use create_environment_scope for that. Requires the caller OAuth token. A duplicate role name is rejected.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  list_environment_scopes: {
    name: 'list_environment_scopes',
    description: 'List permission scopes defined in one environment. Use create_environment_scope to add a scope. This tool does not list roles. Use list_environment_roles for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  create_environment_scope: {
    name: 'create_environment_scope',
    description: 'Create one permission scope in an environment. Use list_environment_scopes to see scopes that already exist. This tool does not create a role. Use create_environment_role for that. Requires the caller OAuth token. A duplicate scope name is rejected.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  list_workspace_members: {
    name: 'list_workspace_members',
    description: 'List members of the current workspace, one page at a time. Use invite_workspace_member to add a member. This tool does not list users inside an organization. Use list_organization_users for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.workspaceRead],
  },
  invite_workspace_member: {
    name: 'invite_workspace_member',
    description: 'Invite one person to the current workspace by email. Use list_workspace_members to see who is already a member. This tool does not add a user to an organization. Use create_organization_user for that. Requires the caller OAuth token. Each call can send a new invite.',
    annotations: createTool,
    scopes: [SCOPES.workspaceWrite],
  },
  list_organizations: {
    name: 'list_organizations',
    description: 'List organizations in one environment, one page at a time. Use get_organization_details when you already have an organization id. Use create_organization to add one. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.organizationRead],
  },
  get_organization_details: {
    name: 'get_organization_details',
    description: 'Read one organization by id. Use list_organizations when you need to discover an id. This tool does not list the organization users. Use list_organization_users for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.organizationRead],
  },
  create_organization: {
    name: 'create_organization',
    description: 'Create one organization in an environment. Use list_organizations to see organizations that already exist. This tool does not create users inside the organization. Use create_organization_user after the organization exists. Requires the caller OAuth token.',
    annotations: createTool,
    scopes: [SCOPES.organizationWrite],
  },
  generate_admin_portal_link: {
    name: 'generate_admin_portal_link',
    description: 'Create a one-time admin portal link for one organization. Use get_organization_details to read the organization. This tool does not change organization settings. Use update_organization_settings for that. Requires the caller OAuth token. Each call returns a new link.',
    annotations: createTool,
    scopes: [SCOPES.organizationWrite],
  },
  get_environment_credentials: {
    name: 'get_environment_credentials',
    description: 'Read the API client id, environment URL, and secret suffix for one environment, as a .env block. Use get_environment_details for the environment name and domain, not the client id. Requires the caller OAuth token. The client secret value is not returned. The dashboard shows that secret.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  list_environment_connections: {
    name: 'list_environment_connections',
    description: 'List SSO connections configured on one environment. Use list_organization_connections for connections on one organization. Use list_connected_accounts for OAuth connector accounts. Those are a different record. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  list_connected_accounts: {
    name: 'list_connected_accounts',
    description: 'List connected accounts in one environment, one page at a time. These are the users who authorized a connector. Use search_connectors to find a connector in the catalog. Use list_environment_connections for SSO connections, not connector accounts. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  create_connected_account_magic_link: {
    name: 'create_connected_account_magic_link',
    description: 'Create a link that lets someone connect an OAuth connector account, such as Notion or Gmail, in one environment. Use list_connected_accounts to see accounts that are already connected. This tool does not search the catalog. Use search_connectors for that. Requires the caller OAuth token. Each call returns a new link and an expiry.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  list_organization_connections: {
    name: 'list_organization_connections',
    description: 'List SSO connections for one organization. Use list_environment_connections for connections on the environment as a whole. Use enable_environment_connection to enable an environment connection, not an organization connection. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.organizationRead],
  },
  enable_environment_connection: {
    name: 'enable_environment_connection',
    description: 'Enable one existing environment connection. Use list_environment_connections to find the connection id. This tool does not create a connection, and it does not enable an organization connection. Requires the caller OAuth token. Enabling an already enabled connection leaves it enabled.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  create_organization_user: {
    name: 'create_organization_user',
    description: 'Create one user in an organization and assign a role. Use list_organization_users to see users that already exist. This tool does not invite someone to the workspace. Use invite_workspace_member for that. Requires the caller OAuth token.',
    annotations: createTool,
    scopes: [SCOPES.organizationWrite],
  },
  list_organization_users: {
    name: 'list_organization_users',
    description: 'List users in one organization, one page at a time. Use get_organization_details to read the organization record. Use create_organization_user to add a user. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.organizationRead],
  },
  update_organization_settings: {
    name: 'update_organization_settings',
    description: 'Turn features on or off for one organization, such as directory sync. Use get_organization_details to read the organization. This tool does not rename the organization and does not add users. Requires the caller OAuth token.',
    annotations: writeTool,
    scopes: [SCOPES.organizationWrite],
  },
  list_mcp_servers: {
    name: 'list_mcp_servers',
    description: 'List MCP servers registered in one environment, one page at a time. Use register_mcp_server to add a server. Use update_mcp_server to change one. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  register_mcp_server: {
    name: 'register_mcp_server',
    description: 'Register one MCP server in an environment and return its protected-resource metadata. Use list_mcp_servers to see servers that already exist. Use update_mcp_server to change a server after it exists. Requires the caller OAuth token. Publish that metadata at /.well-known/oauth-protected-resource on the server. The URL you pass becomes the token audience.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  update_mcp_server: {
    name: 'update_mcp_server',
    description: 'Update fields on one registered MCP server, such as its name or URL. Use switch_mcp_auth_to_scalekit when the only change is to clear an external provider and use Scalekit authentication. Use list_mcp_servers to find the id. Requires the caller OAuth token.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  switch_mcp_auth_to_scalekit: {
    name: 'switch_mcp_auth_to_scalekit',
    description: 'Clear the external provider on one registered MCP server and move that server onto Scalekit authentication. Use update_mcp_server to change the name, URL, or other fields. This tool does not edit those fields. Requires the caller OAuth token. The call always sends the switch request.',
    annotations: removeTool,
    scopes: [SCOPES.environmentWrite],
  },
  search_connectors: {
    name: 'search_connectors',
    description: 'Search the connector catalog in one environment, one page at a time. Examples are Google, Notion, and Slack. Use search_tools to search actions on a connector. This tool does not list connected accounts. Use list_connected_accounts for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  search_tools: {
    name: 'search_tools',
    description: 'Search actions exposed by connectors in one environment, one page at a time. Use search_connectors to find the connector itself. This tool does not call the action. Output schemas are not returned. Read the connector API docs for the response shape. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  search_docs: {
    name: 'search_docs',
    description: 'Search public Scalekit documentation by keyword. The result is capped at 50,000 characters. Read a docs:// resource when one resource already covers the topic. Use this tool only when no docs:// resource matches. This tool does not require a Scalekit OAuth token. It does not change any Scalekit record.',
    annotations: readOpenTool,
    scopes: [],
  },
  list_redirect_uris: {
    name: 'list_redirect_uris',
    description: 'Read the login redirect URIs, the initiate-login URI, and the post-logout redirect URIs for one environment. Use add_redirect_uri, set_initiate_login_uri, or add_post_logout_redirect_uri to change one of those values. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  add_redirect_uri: {
    name: 'add_redirect_uri',
    description: 'Add one login callback URL to an environment. Use add_post_logout_redirect_uri for a URL used after logout. Use list_redirect_uris to read the current list. Requires the caller OAuth token. Adding a URL that is already on the list leaves the list unchanged.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  remove_redirect_uri: {
    name: 'remove_redirect_uri',
    description: 'Remove one login callback URL from an environment. Use remove_post_logout_redirect_uri to remove a post-logout URL. Use list_redirect_uris to read the current list. Requires the caller OAuth token. This deletes that URL from the allowed list.',
    annotations: removeTool,
    scopes: [SCOPES.environmentWrite],
  },
  set_initiate_login_uri: {
    name: 'set_initiate_login_uri',
    description: 'Set the initiate-login URI for an environment. That URI is the app endpoint that redirects to the Scalekit authorize endpoint for logins that did not start in the app, including IdP-initiated SSO. Use remove_initiate_login_uri to clear it. Use list_redirect_uris to read it. Requires the caller OAuth token. Setting the same URI again leaves it unchanged.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  remove_initiate_login_uri: {
    name: 'remove_initiate_login_uri',
    description: 'Clear the initiate-login URI for an environment. Use set_initiate_login_uri to set a new one. Use list_redirect_uris to read the current value. Requires the caller OAuth token. This deletes the URI.',
    annotations: removeTool,
    scopes: [SCOPES.environmentWrite],
  },
  add_post_logout_redirect_uri: {
    name: 'add_post_logout_redirect_uri',
    description: 'Add one URL that a user may be sent to after logout. Use add_redirect_uri for a login callback URL. Use list_redirect_uris to read the current list. Requires the caller OAuth token. Adding a URL that is already on the list leaves the list unchanged.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  remove_post_logout_redirect_uri: {
    name: 'remove_post_logout_redirect_uri',
    description: 'Remove one post-logout redirect URL from an environment. Use remove_redirect_uri to remove a login callback URL. Use list_redirect_uris to read the current list. Requires the caller OAuth token. This deletes that URL from the allowed list.',
    annotations: removeTool,
    scopes: [SCOPES.environmentWrite],
  },
} as const;

export type ToolKey = keyof typeof toolsList;

export type ToolDefinition = {
  name: ToolKey;
  description: string;
  annotations: ToolAnnotations;
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
    registerToolSearchTools(server);
    registerDocsTools(server);
}