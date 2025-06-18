import { config } from '../config/config.js';

const AUTH_BASE_URL = process.env.AUTH_ISSUER || 'http://localhost:8888';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
export const OAUTH_AUTHORIZATION_SERVER_PATH = `/.well-known/oauth-authorization-server`;
export const OAUTH_PROTECTED_RESOURCE_PATH = `/.well-known/oauth-protected-resource`;

export const ENDPOINTS = {
  environments: {
    list: `${AUTH_BASE_URL}/api/v1/environments`,
    getById: (id: string) => `${AUTH_BASE_URL}/api/v1/environments/${id}`,
  },
  organizations: {
    create: `${AUTH_BASE_URL}/api/v1/organizations`,
  },
  oauthAuthorizationServer: `${AUTH_BASE_URL}/${config.authServerId}${OAUTH_AUTHORIZATION_SERVER_PATH}`,
  oauthProtectedResource: `${API_BASE_URL}${OAUTH_PROTECTED_RESOURCE_PATH}`,
};
