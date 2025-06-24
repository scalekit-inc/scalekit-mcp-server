import type { AuthInfo as McpAuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { Request, Response } from 'express';
import type { Algorithm } from 'jsonwebtoken';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import { config } from '../config/config.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { getAllScopes } from '../types/scopes.js';
import { logger } from './logger.js';

export type AuthInfo = McpAuthInfo;

export const verifyToken = async (token: string): Promise<AuthInfo> => {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object') {
        logger.error('Invalid token format', { token });
        throw new Error('Invalid token');
    }

    const payload = decoded.payload as JwtPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) {
        logger.error('Token has expired', { token, exp: payload.exp });
        throw new Error('Token has expired');
    }

    if (payload.iss !== config.authIssuer) {
        logger.error('Invalid issuer in token', { expected: config.authIssuer, actual: payload.iss });
        throw new Error(`Invalid issuer in token: expected ${config.authIssuer}, got ${payload.iss}`);
    }

    const sub = payload.sub;
    if (!sub) {
        logger.error('sub not found in token', { token });
        throw new Error('sub not found in token');
    }

    const audience = payload.aud;
    const expectedAudience = config.authAudience;
    if (
        !audience ||
        (Array.isArray(audience)
            ? !audience.includes(expectedAudience)
            : audience !== expectedAudience)
    ) {
        logger.error('Invalid audience in token', { expected: expectedAudience, actual: audience });
        throw new Error("Invalid audience in token");
    }

    const metadata = await fetchMetadata();
    const jwksUri = metadata.jwks_uri;
    if (!jwksUri) {
        logger.error('JWKS URI not found in metadata', { metadata });
        throw new Error("JWKS URI not found in metadata");
    }

    const jwksRes = await fetch(jwksUri);
    const jwks = await jwksRes.json();

    const { header } = decoded as { header: { kid?: string; alg?: string } };
    if (!header.kid) {
        logger.error('Token header missing "kid"', { token });
        throw new Error("Token header missing 'kid'");
    }

    const key = jwks.keys.find((k: any) => k.kid === header.kid);
    if (!key) {
        logger.error('Matching JWK not found', { kid: header.kid, jwks });
        throw new Error("Matching JWK not found");
    }

    // Convert JWK to PEM
    const pem = jwkToPem(key);

    const algorithm = (header.alg ?? 'RS256') as Algorithm; // Provide a default algorithm if undefined
    if (!algorithm){
        logger.error('Token header missing "alg"', { token });
        throw new Error("Token header missing 'alg'");
    }

    try {
        jwt.verify(token, pem, { algorithms: [algorithm], audience: expectedAudience, issuer: payload.iss });
    } catch (err) {
        logger.error('Token signature verification failed', { error: err, token });
        throw new Error("Token signature verification failed");
    }

    return {
        token,
        issuer: payload.iss ?? "",
        subject: String(sub),
        clientId: payload.client_id,
        scopes: payload.scope,
        claims: payload,
    };
};

export const fetchMetadata = async (): Promise<any> => {
  const res = await fetch(`${ENDPOINTS.oauthAuthorizationServer}`);
  return res.json();
};

export const verifyScopes = (token: string, requiredScopes: string[]): Boolean => {
    if (config.mcpInspector) {
        return true;
    }
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object') {
        logger.error('Invalid token format', { token });
        throw new Error('Invalid token');
    }

    const payload = decoded.payload as JwtPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) {
        logger.error('Token has expired', { token, exp: payload.exp });
        throw new Error('Token has expired');
    }

    const tokenScopes = payload.scopes
    if (!tokenScopes) {
        logger.error('Scopes not found in token', { token });
        return false;
    }

    const result = requiredScopes.every(scope => tokenScopes.includes(scope));
    if (!result) {
        logger.error('Required scopes not found in token', { requiredScopes, tokenScopes });
    }
    return result;
};

export const convertMetadataKeys = (metadata: any) => ({
  issuer: metadata.issuer,
  authorizationEndpoint: metadata.authorization_endpoint,
  tokenEndpoint: metadata.token_endpoint,
  introspectionEndpoint: metadata.introspection_endpoint,
  revocationEndpoint: metadata.revocation_endpoint,
  jwksUri: metadata.jwks_uri,
  registrationEndpoint: metadata.registration_endpoint,
  scopesSupported: metadata.scopes_supported,
  responseTypesSupported: metadata.response_types_supported,
  responseModesSupported: metadata.response_modes_supported,
  grantTypesSupported: metadata.grant_types_supported,
  subjectTypesSupported: metadata.subject_types_supported,
  tokenEndpointAuthMethodsSupported: metadata.token_endpoint_auth_methods_supported,
  tokenEndpointAuthSigningAlgValuesSupported: metadata.token_endpoint_auth_signing_alg_values_supported,
  codeChallengeMethodsSupported: metadata.code_challenge_methods_supported,
  requestUriParameterSupported: metadata.request_uri_parameter_supported,
});

/**
 * Proxies the authorization server metadata from the actual issuer.
 */
export const oauthAuthorizationServerHandler = async (req: Request, res: Response) => {
  const serverId = config.authServerId;

  try {
    const response = await fetch(`${config.authIssuer}/${serverId}/.well-known/oauth-authorization-server`);
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
    resource: config.apiBaseUrl,
    authorization_servers: [`${config.apiBaseUrl}/.well-known/oauth-authorization-server`],
    bearer_methods_supported: ['header'],
    resource_documentation: `${config.apiBaseUrl}/docs`,
    scopes_supported: getAllScopes(),
  };

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(metadata);
};