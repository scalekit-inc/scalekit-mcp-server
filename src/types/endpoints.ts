import { config } from '../config/config.js';

const AUTH_BASE_URL = process.env.AUTH_ISSUER || 'http://localhost:8888';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

export const ENDPOINTS = {
  environments: {
    list: `${AUTH_BASE_URL}/api/v1/environments`,
    getById: (id: string) => `${AUTH_BASE_URL}/api/v1/environments/${id}`,
  },
  organizations: {
    create: `${AUTH_BASE_URL}/api/v1/organizations`,
  },
  oauthAuthorizationServer: `${AUTH_BASE_URL}/${config.authServerId}/.well-known/oauth-authorization-server`,
  oauthProtectedResource: `${API_BASE_URL}/.well-known/oauth-protected-resource`,
};
