import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Scalekit, TokenValidationOptions } from '@scalekit-sdk/node';
import cors from 'cors';
import express from 'express';
import { config } from './config/config.js';
import { instrumentServer, posthog } from './lib/analytics.js';
import { oauthAuthorizationServerHandler, oauthProtectedResourceHandler } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerResources } from './resources/index.js';
import { registerTools, TOOLS } from './tools/index.js';
import {
  OAUTH_AUTHORIZATION_SERVER_PATH,
  OAUTH_PROTECTED_RESOURCE_PATH,
  WWWHeader,
} from './types/endpoints.js';

const PORT = config.port;

// A fresh server per request (see lib/transport.ts). Registration is pure
// in-memory wiring, and PostHog keeps session identity on the replayed
// `Mcp-Session-Id` token rather than in per-instance state, so building one
// per request costs nothing in attribution.
const createMcpServer = (): McpServer => {
  const server = new McpServer(
  { name: config.serverName, version: config.serverVersion },
  {
    instructions: `You have access to Scalekit's documentation via docs:// resources and a search_docs tool.

PREFERRED WORKFLOW:
1. For any question about how to use Scalekit, start by reading docs://index to understand which section covers the topic.
2. Then read the specific docs:// resource (e.g. docs://mcp-auth, docs://full-stack-auth, docs://agent-auth).
3. Only use search_docs if no docs:// resource clearly covers the topic.

Available resources:
- docs://index — start here to navigate all documentation
- docs://mcp-auth — add authentication to MCP servers (OAuth 2.1, DCR)
- docs://full-stack-auth — user login, sessions, RBAC for web apps
- docs://agent-auth — AI agent OAuth token vault, connectors, tool calling
- docs://sso-scim — enterprise SSO (SAML/OIDC) and directory sync
- docs://quickstart — getting started guides
- docs://api-sdk — API reference, SDK methods, webhooks
- docs://integrations — Okta, Google, Microsoft, and other IdP guides
- docs://m2m-auth — machine-to-machine auth, client credentials, API keys`,
  }
  );

  registerTools(server);
  registerResources(server);
  instrumentServer(server);
  return server;
};

const app = express();

const allowAll = cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  // Mcp-Session-Id must be both readable and sendable: session attribution
  // depends on the client reading the token off the response and replaying it,
  // and a browser client can do neither unless it is listed here.
  allowedHeaders: [
    'Mcp-Protocol-Version',
    'Mcp-Session-Id',
    'Content-Type',
    'Authorization',
  ],
  exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'],
  maxAge: 86400,
});

app.options(/.*/, allowAll);
app.use(allowAll);

// Serve static files (including the HTML with favicon)
app.use('/info', express.static('public'));

app.get(OAUTH_PROTECTED_RESOURCE_PATH, oauthProtectedResourceHandler);
// Protected-resource metadata already points clients at the real issuer, but
// some clients look for authorization-server metadata on the resource origin
// before following that pointer. Without this route they hit the auth
// middleware and get a 401 instead of metadata.
app.get(OAUTH_AUTHORIZATION_SERVER_PATH, oauthAuthorizationServerHandler);

app.use(express.json());
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);

(async () => {
  logger.info('MCP server factory ready (tools, resources and analytics wired per request)');

  app.use(async (req, res, next) => {
    try {
      // Allow public access to well-known endpoints
      if (req.path.includes('.well-known')) {
        return next();
      }

      // Apply authentication to all MCP requests
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]?.trim()
        : null;

      if (!token) {
        logger.warn('Missing Bearer token', {
          path: req.path,
          method: req.method,
          body: req.body
        });
        throw new Error('Missing or invalid Bearer token');
      }

      // For tool calls, validate scopes
      let validateTokenOptions: TokenValidationOptions = { audience: [config.authAudience] };
      const isToolCall = req.body?.method === 'tools/call';
      if (isToolCall) {
        const toolName = req.body?.params?.name as keyof typeof TOOLS;
        if (toolName && (toolName in TOOLS)) {
          validateTokenOptions.requiredScopes = TOOLS[toolName].scopes;
        }
      }

      await scalekit.validateToken(token, validateTokenOptions);
      (req as any).token = token;
      
      next();
    } catch (err) {
      logger.warn('Unauthorized request', { error: err instanceof Error ? err.message : String(err) });
      return res.status(401).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).end();
    }
  });

  setupTransportRoutes(app, createMcpServer);
  logger.debug('Transport routes set up completed');

  app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}`));

  // Buffered events are lost unless the client is flushed, so drain on both
  // signals - SIGINT is what a local Ctrl-C sends.
  const shutdown = async () => {
    if (posthog) await posthog.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
