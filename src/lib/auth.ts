import type { AuthInfo as McpAuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import type { Algorithm } from 'jsonwebtoken';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import { config } from '../config/config.js';
import { ENDPOINTS } from '../types/endpoints.js';

export type AuthInfo = McpAuthInfo;

export const verifyToken = async (token: string): Promise<AuthInfo> => {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object') throw new Error('Invalid token');

    const payload = decoded.payload as JwtPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Token has expired');

    if (payload.iss !== config.authIssuer) {
        throw new Error(`Invalid issuer in token: expected ${config.authIssuer}, got ${payload.iss}`);
    }

    const userId = payload.sub || payload.user_id || payload.uid;
    if (!userId) throw new Error('userId not found in token');

    const audience = payload.aud;
    const expectedAudience = config.authAudience;
    if (
        !audience ||
        (Array.isArray(audience)
            ? !audience.includes(expectedAudience)
            : audience !== expectedAudience)
    ) {
        throw new Error("Invalid audience in token");
    }

    const metadata = await fetchMetadata();
    const jwksUri = metadata.jwks_uri;
    if (!jwksUri) throw new Error("JWKS URI not found in metadata");

    const jwksRes = await fetch(jwksUri);
    const jwks = await jwksRes.json();

    const { header } = decoded as { header: { kid?: string; alg?: string } };
    if (!header.kid) throw new Error("Token header missing 'kid'");

    const key = jwks.keys.find((k: any) => k.kid === header.kid);
    if (!key) throw new Error("Matching JWK not found");

    // Convert JWK to PEM
    const pem = jwkToPem(key);

    const algorithm = (header.alg ?? 'RS256') as Algorithm; // Provide a default algorithm if undefined
    if (!algorithm) throw new Error("Token header missing 'alg'");

    try {
        jwt.verify(token, pem, { algorithms: [algorithm], audience: expectedAudience, issuer: payload.iss });
    } catch (err) {
        throw new Error("Token signature verification failed");
    }

    return {
        token,
        issuer: payload.iss ?? "",
        subject: String(userId),
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
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object') throw new Error('Invalid token');

    const payload = decoded.payload as JwtPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Token has expired');

    const tokenScopes = payload.scopes
    if (!tokenScopes) return false;
    return requiredScopes.every(scope => tokenScopes.includes(scope));
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
