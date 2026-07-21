import { instrument } from '@posthog/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import jwt from 'jsonwebtoken';
import { PostHog } from 'posthog-node';
import { config } from '../config/config.js';

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

// EU issuers carry an "eu" hostname label (eu.auth.scalekit.cloud,
// auth.eu.scalekit.com); anything else — including a missing or
// malformed iss — is treated as US.
function isEuIssuer(iss: string | undefined): boolean {
  if (!iss) return false;
  try {
    return new URL(iss).hostname.toLowerCase().split('.').includes('eu');
  } catch {
    return false;
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

      // PII (email) is only attached for non-EU regions; EU users are
      // identified by user id alone.
      const email = isEuIssuer(claims.iss) ? undefined : claims.user_email;

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
