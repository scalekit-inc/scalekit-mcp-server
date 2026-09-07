import { getRequestHeaders, instrument } from '@posthog/mcp';
import jwt from 'jsonwebtoken';
import { PostHog } from 'posthog-node';
import { config } from '../config/config.js';

export const posthog = config.posthogApiKey
  ? new PostHog(config.posthogApiKey, { host: 'https://us.i.posthog.com' })
  : null;

interface AccessTokenClaims {
  sub:  string;
  xoid: string;
}

// MCP SDK v1 hands request handlers the bearer token at `extra.authInfo.token`; v2 removed
// that shape, so fall back to the Authorization header via the SDK-agnostic helper.
function extractToken(extra: unknown): string | null {
  const v1Token = (extra as any)?.authInfo?.token;
  if (typeof v1Token === 'string' && v1Token) return v1Token;

  const auth = getRequestHeaders(extra)?.['authorization'];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

function decodeClaims(extra: unknown): AccessTokenClaims | null {
  const token = extractToken(extra);
  if (!token) return null;
  return jwt.decode(token) as AccessTokenClaims | null;
}

// `server` is deliberately untyped so this module compiles against both MCP SDK majors;
// instrument() detects the server shape (McpServer or Server, v1 or v2) at runtime.
export function instrumentServer(server: unknown): void {
  if (!posthog) return;

  instrument(server, posthog, {
    enableConversationId:       true,
    reportMissing:              true,
    enableExceptionAutocapture: true,

    identify: async (_request, extra) => {
      const claims = decodeClaims(extra);
      if (!claims?.sub) return null;

      return {
        distinctId: claims.sub,
        groups: {
          workspace: claims.xoid,
        },
      };
    },
  });
}
