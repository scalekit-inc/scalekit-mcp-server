import { getRequestHeaders, instrument } from '@posthog/mcp';
import jwt from 'jsonwebtoken';
import { PostHog } from 'posthog-node';
import { config } from '../config/config.js';
import { logger } from './logger.js';

export const posthog = config.posthogApiKey
  ? new PostHog(config.posthogApiKey, { host: 'https://us.i.posthog.com' })
  : null;

interface AccessTokenClaims {
  sub:        string;
  xoid:       string;
  iss?:       string;
  user_email?: string;
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

type Region = 'us' | 'eu' | 'unknown';

// Known issuer hostnames per region. Anything else — missing, unparseable,
// or unrecognized — is 'unknown', and PII is only ever attached for a
// confirmed 'us' issuer (fail closed).
const US_ISSUER_HOSTS = new Set(['auth.scalekit.com', 'auth.scalekit.cloud']);
const EU_ISSUER_HOSTS = new Set(['auth.eu.scalekit.com', 'auth.eu.scalekit.cloud']);

function getRegionFromIssuer(iss: string | undefined): Region {
  if (!iss) return 'unknown';
  try {
    const hostname = new URL(iss).hostname.toLowerCase();
    if (US_ISSUER_HOSTS.has(hostname)) return 'us';
    if (EU_ISSUER_HOSTS.has(hostname)) return 'eu';
    return 'unknown';
  } catch {
    logger.warn(`PostHog identify: unparseable iss claim "${iss}" — withholding PII`);
    return 'unknown';
  }
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

      // PII (email) is only attached for confirmed-US issuers; EU and
      // unknown-region users are identified by user id alone.
      const email =
        getRegionFromIssuer(claims.iss) === 'us' ? claims.user_email : undefined;

      return {
        distinctId: claims.sub,
        ...(email ? { properties: { email } } : {}),
        groups: {
          workspace: claims.xoid,
        },
      };
    },
  });
}
