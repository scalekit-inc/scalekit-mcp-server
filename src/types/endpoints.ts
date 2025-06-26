import { config } from '../config/config.js';

const AUTH_BASE_URL = process.env.AUTH_ISSUER || '';
const API_BASE_URL = process.env.API_BASE_URL || '';
const SK_API_BASE_URL = process.env.SK_API_BASE_URL || '';
export const OAUTH_AUTHORIZATION_SERVER_PATH = `/.well-known/oauth-authorization-server`;
export const OAUTH_PROTECTED_RESOURCE_PATH = `/.well-known/oauth-protected-resource`;

export const ENDPOINTS = {
  workspaces: {
    listMembers: `${SK_API_BASE_URL}/api/v1/members`,
    inviteMember: `${SK_API_BASE_URL}/api/v1/members`,
  },
  environments: {
    list: `${SK_API_BASE_URL}/api/v1/environments`,
    getById: (id: string) => `${SK_API_BASE_URL}/api/v1/environments/${id}`,
    listRoles: `${SK_API_BASE_URL}/api/v1/environments/-/roles`,
    createRoleById: (id:string) => `${SK_API_BASE_URL}/api/v1/environments/${id}/roles`,
  },
  organizations: {
    list: `${SK_API_BASE_URL}/api/v1/organizations`,
    create: `${SK_API_BASE_URL}/api/v1/organizations`,
    getById: (id: string) => `${SK_API_BASE_URL}/api/v1/organizations/${id}`,
    updateSettings: (id: string) => `${SK_API_BASE_URL}/api/v1/organizations/${id}/settings`,
    generateAdminPortalLink: (id: string) => `${SK_API_BASE_URL}/api/v1/organizations/${id}/portal_links`,
    createOrganizationUser: (id: string) => `${SK_API_BASE_URL}/api/v1/organizations/${id}/users`,
    listOrganizationUsers: (id: string) => `${SK_API_BASE_URL}/api/v1/organizations/${id}/users`,
  },
  connections: {
    list: `${SK_API_BASE_URL}/api/v1/connections`,
  },
  oauthAuthorizationServer: `${AUTH_BASE_URL}/resources/${config.authServerId}${OAUTH_AUTHORIZATION_SERVER_PATH}`,
  oauthProtectedResource: `${API_BASE_URL}${OAUTH_PROTECTED_RESOURCE_PATH}`,
};

let wwwHeaderValue = `Bearer realm="OAuth", resource_metadata="${ENDPOINTS.oauthProtectedResource}`
if (config.mcpInspector){
  wwwHeaderValue = `Bearer realm="OAuth", resource_metadata="${ENDPOINTS.oauthProtectedResource}, authorization_uri="${ENDPOINTS.oauthAuthorizationServer}"`
}

export const WWWHeader = {
  HeaderKey: 'WWW-Authenticate',
  HeaderValue: wwwHeaderValue,
}
