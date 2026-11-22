import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { SCOPES } from '../types/scopes.js';
import { registerAgentkitConnectionTools } from './agentkit-connections.js';
import { registerConnectionTools } from './connections.js';
import { registerConnectorTools } from './connectors.js';
import { registerDocsTools } from './docs.js';
import { registerEnvironmentTools } from './environments.js';
import { registerOrganizationTools } from './organizations.js';
import { registerResourceTools } from './resource.js';
import { registerToolSearchTools } from './tool-search.js';
import { registerVirtualMcpTools } from './virtual-mcp.js';
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
    description: 'Find connectors, such as Gmail, Notion or Slack, by keyword, or list every connector with all set to true. Use this first to get a connector ID, then pass that ID to get_connector, to search_tools to see its actions, or to create_agentkit_connection to set it up. Each result shows scalekit_credentials (available when a connection can use Scalekit-managed OAuth credentials, so no OAuth app of your own is needed) and mcp: true for connectors served through an MCP server. Results come back 20 at a time with a page token; all returns every connector in a compact format in one call. This tool does not list connected accounts. Use list_connected_accounts for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  get_connector: {
    name: 'get_connector',
    description: 'Read one connector by its exact ID: display name, description, categories, supported auth types, whether connections can use Scalekit-managed OAuth credentials (scalekit_credentials), whether it is served through an MCP server (mcp), whether it is a custom connector, and the AgentKit connections it already has in this environment. Use search_connectors to find an ID by keyword. Use search_tools to see the connector actions. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  search_tools: {
    name: 'search_tools',
    description: 'Search the actions available on specific connectors, such as GMAIL or SLACK. Call search_connectors first to find each connector ID, then pass one to five IDs here. An optional keyword narrows the results by action name or description, only within those connectors. Returns up to 300 actions per connector. This tool does not search every connector at once and does not run an action. Output schemas are not returned. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  create_agentkit_connection: {
    name: 'create_agentkit_connection',
    description: 'Create one AgentKit connection for a connector, so agents can act in that app for each user through their own connected account. Use search_connectors to find the connector ID and list_agentkit_connections to see connections that already exist. Use update_agentkit_connection afterwards to change scopes or set your own OAuth client. Connections created here are always per user: org-wide connections, where one shared account acts for every user, are not supported through MCP. Create those in the Scalekit dashboard. Requires the caller OAuth token. A duplicate connection name is rejected.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  update_agentkit_connection: {
    name: 'update_agentkit_connection',
    description: 'Change settings on one AgentKit connection, such as its scopes, its own OAuth client ID and secret, or its name. Send only what should change; everything else keeps its stored value. Use get_agentkit_connection to read the current settings and find the connection ID. Sending a client ID or secret turns off Scalekit-managed credentials unless useScalekitCreds is also sent. This tool does not change the auth mode. Requires the caller OAuth token.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  get_agentkit_connection: {
    name: 'get_agentkit_connection',
    description: 'Read one AgentKit connection by name or ID, including its OAuth settings, scopes and MCP URL. The client secret is never shown. Use list_agentkit_connections to find a name. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  list_agentkit_connections: {
    name: 'list_agentkit_connections',
    description: 'List AgentKit connections in one environment, newest first, one page at a time. Each row has the connection ID, name, connector, auth type and auth mode. Use get_agentkit_connection to read one connection settings. This tool does not list SSO connections. Use list_environment_connections for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  create_virtual_mcp_server: {
    name: 'create_virtual_mcp_server',
    description: 'Create one virtual MCP server that offers actions from one or more AgentKit connections behind a single MCP URL. Use list_agentkit_connections for connection names and search_tools for action names; leave tools out to include every action of a connection. Returns the server ID and its MCP URL. The name cannot be changed later. Requires the caller OAuth token.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
  },
  get_virtual_mcp_server: {
    name: 'get_virtual_mcp_server',
    description: 'Read one virtual MCP server by ID, including its MCP URL, tool exposure mode, and the connections and actions it includes. Use list_virtual_mcp_servers to find an ID. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  list_virtual_mcp_servers: {
    name: 'list_virtual_mcp_servers',
    description: 'List virtual MCP servers in one environment, one page at a time, with each server ID, name, MCP URL and connections. Use get_virtual_mcp_server to read one server. This tool does not list MCP servers registered for MCP auth. Use list_mcp_servers for those. Requires the caller OAuth token.',
    annotations: readTool,
    scopes: [SCOPES.environmentRead],
  },
  update_virtual_mcp_server: {
    name: 'update_virtual_mcp_server',
    description: 'Change the description, connections or tool exposure mode of one virtual MCP server. Fields you leave out keep their current value; connections, when sent, replaces the whole list. The name cannot be changed. Switching to DIRECT fails with more than 25 connections or when two connections have actions with the same name. After a change, MCP clients must list tools again; existing session tokens keep working. Use get_virtual_mcp_server to read the current settings. Requires the caller OAuth token.',
    annotations: writeTool,
    scopes: [SCOPES.environmentWrite],
  },
  delete_virtual_mcp_server: {
    name: 'delete_virtual_mcp_server',
    description: 'Delete one virtual MCP server. Its MCP URL stops working. Users keep their connected accounts, and the connections are not deleted. This cannot be undone. Requires the caller OAuth token.',
    annotations: removeTool,
    scopes: [SCOPES.environmentWrite],
  },
  create_mcp_session_token: {
    name: 'create_mcp_session_token',
    description: 'Create a 6-hour session token for the signed-in user, for one virtual MCP server. The token is always issued for you, identified by a short hash of your user ID, and cannot be created for anyone else. For a DIRECT server, every connection in it needs an active connected account for that identifier first, or the call fails. Returns the token, its expiry and the MCP URL it works on. Treat the token as a secret. Requires the caller OAuth token.',
    annotations: createTool,
    scopes: [SCOPES.environmentWrite],
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
    registerConnectorTools(server);
    registerAgentkitConnectionTools(server);
    registerVirtualMcpTools(server);
    registerResourceTools(server);
    registerToolSearchTools(server);
    registerDocsTools(server);
}