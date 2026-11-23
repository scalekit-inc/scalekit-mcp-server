export interface DetailedEnvironment {
  environment: Environment;
  organizations: Organization[];

}

export interface ClientSecret {
  id: string;
  secret_suffix: string;
  status: string;
  last_used_time: string;
}

export interface Client {
  id: string;
  name: string;
  client_type: string;
  redirect_uris: string[];
  post_login_uris: string[];
  post_logout_redirect_uris: string[];
  initiate_login_uri: string;
  secrets: ClientSecret[];
}

export interface ListClientsResponse {
  total_size: number;
  clients: Client[];
  next_page_token: string;
}

export interface ListEnvironmentsResponse {
  next_page_token: string;
  total_size: number;
  environments: Environment[];
}

export interface ListOrganizationsResponse {
  next_page_token: string;
  total_size: number;
  organizations: Organization[];
  prev_page_token: string;
}

export interface GetOrganizationResponse {
  organization: Organization;
}

export interface Organization {
  id: string;
  external_id?: string;
  display_name?: string;
  settings?: OrganizationSettings;
}

export interface OrganizationSettings {
  features: Feature[],
}

export interface Environment {
  id: string;
  display_name?: string;
  domain?: string;
  type?: string;
  custom_domain?: string;
  custom_domain_status?: string;
}

export interface ListMembersResponse {
  next_page_token: string;
  members: Member[];
}

export interface CreateMemberResponse {
  member: Member;
}

export interface Member {
  id: string;
  email: string;
  organizations: MemberOrganization[];
}

export interface MemberOrganization {
  organization_id: string;
  membership_status: string;
}

export interface Feature {
  name: string;
  enabled: boolean;
}

export interface AuthInfo {
  token: string;
  issuer: string;
  subject: string;
  clientId?: string;
  scopes?: string[] | string;
  claims?: Record<string, unknown>;
  selectedEnvironmentId?: string;
  selectedEnvironmentDomain?: string;
}

export interface Connection {
  id: string;
  provider: string;
  type: string;
  status: string;
  enabled: boolean;
  organization_id: string;
  ui_button_title: string;
  domains: string[];
  organization_name: string;
}

export interface ListConnectionsResponse {
  connections: Connection[];
}

/** OAuth / connector account linked at environment scope (distinct from IdP connections). */
export interface ConnectedAccount {
  id: string;
  identifier: string;
  provider: string;
  status: string;
  authorization_type: string;
  updated_at: string;
  connector: string;
  connection_id: string;
  token_expires_at?: string;
  last_used_at?: string;
}

export interface ListConnectedAccountsResponse {
  connected_accounts: ConnectedAccount[];
  total_size: number;
  next_page_token: string;
  prev_page_token: string;
}

export interface CreateConnectedAccountMagicLinkResponse {
  link: string;
  expiry: string;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  default: boolean;
}

export interface Link {
  id: string;
  location: string;
  expire_time: string;
}

export interface GenerateAdminPortalLinkResponse {
  link: Link;
}

export interface ListUsersResponse {
  next_page_token: string;
  total_size: number;
  users: User[];
  prev_page_token: string;
}

export interface User {
  id: string;
  environment_id: string;
  create_time: string;
  update_time: string;
  email: string;
  external_id: string;
  memberships: UserMembership[];
  user_profile: UserProfile;
  metadata: Record<string, unknown>;
}

export interface UserMembership {
  organization_id: string;
  membership_status: string;
  roles: UserRole[];
  name: string;
  primary_identity_provider: string;
  metadata: Record<string, unknown>;
}

export interface UserRole {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  locale: string;
  email_verified: boolean;
  phone_number: string;
  metadata: Record<string, unknown>;
  custom_attributes: Record<string, unknown>;
}

export interface Scope {
  name: string;
  description: string;
}

export interface ListResourcesResponse {
  total_size: number;
  next_page_token: string;
  resources: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  resource_id: string;
  description: string;
  resource_type: string;
  third_party: boolean;
  disable_dynamic_client_registration: boolean;
  logo_uri: string;
  access_token_expiry: string;
  refresh_token_expiry: string;
  create_time: string;
  update_time: string;
  provider: string;
  use_scalekit_authentication: boolean;
}


export interface Provider {
  id: string;
  identifier: string;
  display_name: string;
  description: string;
  categories: string[];
  icon_src: string;
  display_priority: number;
  coming_soon: boolean;
  proxy_url: string;
  proxy_enabled: boolean;
  is_custom: boolean;
  is_custom_mcp: boolean;
  /** How users authenticate with this connector; one entry per supported auth type. */
  auth_patterns?: ProviderAuthPattern[];
}

export interface ProviderAuthPattern {
  type?: string;
  /** The connector is served through an MCP server. */
  is_mcp?: boolean;
  oauth_config?: {
    /** Connections can use Scalekit-managed OAuth credentials instead of the customer's own app. */
    allow_use_scalekit_credentials?: boolean;
  };
}

/** App-level connection from GET /api/v1/connections/app (AgentKit connectors set up in the environment). */
export interface AppConnection {
  id: string;
  provider: string;
  type: string;
  status: string;
  enabled: boolean;
  organization_id: string;
  provider_key: string;
  key_id: string;
  created_at: string;
}

export interface ListAppConnectionsResponse {
  connections: AppConnection[];
  total_size: number;
  next_page_token: string;
}

export interface ListProvidersResponse {
  providers: Provider[];
  total_size: number;
  next_page_token: string;
  prev_page_token: string;
}

export interface ScalekitTool {
  id: string;
  provider: string;
  definition: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  is_default?: boolean;
  updated_at?: string;
}

export interface ListToolsResponse {
  tools: ScalekitTool[];
  tool_names: string[];
  total_size: number;
  next_page_token: string;
  prev_page_token: string;
}

export interface CreateConnectionResponse {
  connection: DetailedConnection;
}

export interface DetailedConnection {
  id: string;
  provider: string;
  type: string;
  status: string;
  enabled: boolean;
  debug_enabled: boolean;
  ui_button_title: string;
  configuration_type: string;
  test_connection_uri: string;
  attribute_mapping: Record<string, string>;
  create_time: string;
  update_time: string;
  oidc_config: OIDCConfig;
}

export interface OIDCConfig {
  issuer: string;
  discovery_endpoint: string;
  authorize_uri: string;
  token_uri: string;
  user_info_uri: string;
  jwks_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  token_auth_type: string;
  redirect_uri: string;
  pkce_enabled: boolean;
  idp_logout_required: boolean;
  post_logout_redirect_uri: string;
  backchannel_logout_redirect_uri: string;
}

export interface UpdateConnectionResponse {
  connection: DetailedConnection;
}

export interface EnableConnectionResponse {
  enabled: boolean;
}

export interface CreateResourceResponse {
  resource: Resource;
}

/** AgentKit app connection from GET/POST/PATCH /api/v1/agentkit/connection. */
export interface AgentkitConnection {
  id: string;
  connection_name?: string;
  provider: string;
  type?: string;
  auth_mode?: string;
  create_time?: string;
  update_time?: string;
  connection_mcp_url?: string;
  oauth_config?: {
    client_id?: string;
    client_secret?: string;
    scopes?: string[];
    redirect_uri?: string;
    pkce_enabled?: boolean;
    use_scalekit_creds?: boolean;
    extra_authorize_params?: Record<string, string>;
  };
  provider_configurations?: Record<string, string>;
}

export interface AgentkitConnectionResponse {
  connection: AgentkitConnection;
}

/** Row of GET /api/v1/agentkit/connection (list). */
export interface AgentkitConnectionSummary {
  id: string;
  connection_name?: string;
  provider: string;
  type?: string;
  auth_mode?: string;
  create_time?: string;
}

export interface ListAgentkitConnectionsResponse {
  connections?: AgentkitConnectionSummary[];
  next_page_token?: string;
  prev_page_token?: string;
  total_size?: number;
}

/** One connection inside a virtual MCP server (MCP configuration). */
export interface McpConfigConnectionToolMapping {
  connection_id?: string;
  connection_name: string;
  provider?: string;
  tools?: string[];
}

/** Virtual MCP server, stored by the backend as an MCP configuration (/api/v1/mcp/configs). */
export interface McpConfig {
  id: string;
  name: string;
  description?: string;
  connection_tool_mappings?: McpConfigConnectionToolMapping[];
  mcp_server_url?: string;
  tool_exposure?: string;
}

export interface McpConfigResponse {
  config: McpConfig;
}

export interface ListMcpConfigsResponse {
  configs?: McpConfig[];
  next_page_token?: string;
  prev_page_token?: string;
  total_size?: number;
}

export interface CreateMcpSessionTokenResponse {
  token: string;
  expires_at: string;
}
