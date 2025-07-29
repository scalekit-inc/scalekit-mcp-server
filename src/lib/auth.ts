import type { AuthInfo as McpAuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { Request, Response } from 'express';
import { config } from '../config/config.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { getAllScopes } from '../types/scopes.js';
import { logger } from './logger.js';

export type AuthInfo = McpAuthInfo;

/**
 * Proxies the authorization server metadata from the actual issuer.
 */
export const oauthAuthorizationServerHandler = async (req: Request, res: Response) => {
  const serverId = config.authServerId;

  try {
    const response = await fetch(`${ENDPOINTS.oauthAuthorizationServer}`);
    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).json(data);
  } catch (err: any) {
    logger.error('Failed to fetch authorization server metadata', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch metadata', details: err.message });
  }
};

/**
 * Serves metadata for the protected resource.
 */
export const oauthProtectedResourceHandler = (req: Request, res: Response) => {
  const metadata = {
    resource: `${config.apiBaseUrl}/`,
    authorization_servers: [`${config.authIssuer}/resources/${config.authServerId}`],
    bearer_methods_supported: ['header'],
    resource_documentation: `${config.apiBaseUrl}/docs`,
    scopes_supported: getAllScopes(),
  };

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(metadata);
};
