import { instrument } from '@posthog/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

function decodeClaims(extra: unknown): AccessTokenClaims | null {
  const token = (extra as any)?.authInfo?.token ?? null;
  if (!token) return null;
  return jwt.decode(token) as AccessTokenClaims | null;
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

      return {
        distinctId: claims.sub,
        groups: {
          workspace: claims.xoid,
        },
      };
    },
  });
}
