import { config } from '../config/config.js';

const AUTH_BASE_URL = process.env.AUTH_ISSUER || '';
const API_BASE_URL = process.env.API_BASE_URL || '';
const SK_API_BASE_URL = process.env.SK_API_BASE_URL || '';
export const OAUTH_AUTHORIZATION_SERVER_PATH = `/.well-known/oauth-authorization-server`;
export const OAUTH_PROTECTED_RESOURCE_PATH = `/.well-known/oauth-protected-resource`;

export const ENDPOINTS = {
  environments: {
    list: `${SK_API_BASE_URL}/api/v1/environments`,
    getById: (id: string) => `${SK_API_BASE_URL}/api/v1/environments/${id}`,
  },
  organizations: {
    create: `${SK_API_BASE_URL}/api/v1/organizations`,
  },
  oauthAuthorizationServer: `${AUTH_BASE_URL}/applications/${config.authServerId}${OAUTH_AUTHORIZATION_SERVER_PATH}`,
  oauthProtectedResource: `${API_BASE_URL}${OAUTH_PROTECTED_RESOURCE_PATH}`,
};
