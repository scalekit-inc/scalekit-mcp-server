import { instrument } from '@posthog/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

function decodeClaims(extra: unknown): AccessTokenClaims | null {
  const token = (extra as any)?.authInfo?.token ?? null;
  if (!token) return null;
  return jwt.decode(token) as AccessTokenClaims | null;
}

type Region = 'us' | 'eu' | 'unknown';

// Known US issuer hostnames; EU issuers carry an "eu" hostname label
// (eu.auth.scalekit.cloud, auth.eu.scalekit.com). Anything else — missing,
// unparseable, or unrecognized — is 'unknown', and PII is only ever
// attached for a confirmed 'us' issuer (fail closed).
const US_ISSUER_HOSTS = new Set(['auth.scalekit.com', 'auth.scalekit.cloud']);

function getRegionFromIssuer(iss: string | undefined): Region {
  if (!iss) return 'unknown';
  try {
    const hostname = new URL(iss).hostname.toLowerCase();
    if (US_ISSUER_HOSTS.has(hostname)) return 'us';
    if (hostname.split('.').includes('eu')) return 'eu';
    return 'unknown';
  } catch {
    logger.warn(`PostHog identify: unparseable iss claim "${iss}" — withholding PII`);
    return 'unknown';
  }
}

export function instrumentServer(server: McpServer): void {
  if (!posthog) return;

  instrument(server.server, posthog, {
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
