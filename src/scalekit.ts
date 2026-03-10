import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Scalekit, TokenValidationOptions } from '@scalekit-sdk/node';
import cors from 'cors';
import express from 'express';
import { config } from './config/config.js';
import { oauthProtectedResourceHandler } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerResources } from './resources/index.js';
import { registerTools, TOOLS } from './tools/index.js';
import { OAUTH_PROTECTED_RESOURCE_PATH, WWWHeader } from './types/endpoints.js';

const PORT = config.port;
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

const app = express();

const allowAll = cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Mcp-Protocol-Version', 'Content-Type', 'Authorization'],
  exposedHeaders: ['WWW-Authenticate'],
  maxAge: 86400,
});

app.options(/.*/, allowAll);
app.use(allowAll);

// Serve static files (including the HTML with favicon)
app.use('/info', express.static('public'));

app.get(OAUTH_PROTECTED_RESOURCE_PATH, oauthProtectedResourceHandler);

app.use(express.json());
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);

(async () => {
  registerTools(server)
  logger.info('Registered tools successfully');
  registerResources(server);
  logger.info('Registered resources successfully');

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

  setupTransportRoutes(app, server);
  logger.debug('Transport routes set up completed');

  app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}`));
})();
