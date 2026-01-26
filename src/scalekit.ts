import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Scalekit, TokenValidationOptions } from '@scalekit-sdk/node';
import cors from 'cors';
import express from 'express';
import { config } from './config/config.js';
import { oauthProtectedResourceHandler } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerTools, TOOLS } from './tools/index.js';
import { OAUTH_PROTECTED_RESOURCE_PATH, WWWHeader } from './types/endpoints.js';

const PORT = config.port;
const server = new McpServer({ name: config.serverName, version: config.serverVersion });

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

app.get('/', (req, res, next) => {
  if (wantsJson(req)) {
    return next();
  }
  // For browsers, serves landing page from public/
  return res.sendFile('index.html', { root: 'public' });
});

// Static assets (favicon, images, etc.)
app.use(express.static('public'));

app.get(OAUTH_PROTECTED_RESOURCE_PATH, oauthProtectedResourceHandler);

app.use(express.json());
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);

(async () => {
  registerTools(server)
  logger.info('Registered tools successfully');

  app.use(async (req, res, next) => {
    try {
      // Allow public access to well-known endpoints
      if (isPublicRequest(req)) {
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


function wantsJson(req: express.Request) {
  const accept = String(req.headers.accept || '').toLowerCase();
  // If client explicitly accepts JSON, give JSON
  if (accept.includes('application/json')) return true;
  // If client explicitly prefers HTML, give HTML - helper page for listing verifications on marketplaces
  if (accept.includes('text/html')) return false;
  // For */* or empty Accept, default to JSON (CLI behavior)
  return true;
}

const PUBLIC_PATHS = new Set<string>([
  '/',                          // for MCP metadata or HTML (content negotiated)
  OAUTH_PROTECTED_RESOURCE_PATH // your oauth protected resource metadata path
]);

function isPublicRequest(req: express.Request) {
  if (PUBLIC_PATHS.has(req.path)) return true;
  if (req.path.includes('.well-known')) return true;
  // allow static assets like favicon etc
  if (req.path.startsWith('/assets') || req.path.endsWith('.png') || req.path.endsWith('.ico')) return true;
  return false;
}
