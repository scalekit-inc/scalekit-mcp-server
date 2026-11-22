import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Scalekit, TokenValidationOptions } from '@scalekit-sdk/node';
import cors from 'cors';
import express from 'express';
import { config } from './config/config.js';
import { instrumentServer, posthog } from './lib/analytics.js';
import { oauthProtectedResourceHandler } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { createMcpServer } from './server.js';
import { TOOLS } from './tools/index.js';
import { OAUTH_PROTECTED_RESOURCE_PATH, WWWHeader } from './types/endpoints.js';

const PORT = config.port;

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

let scalekitClient: Scalekit | undefined;
function getScalekit(): Scalekit {
  if (!scalekitClient) {
    scalekitClient = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);
  }
  return scalekitClient;
}

const useStdio = process.argv.includes('--stdio');

(async () => {
  if (useStdio) {
    // HTTP-only: SIGTERM flushes PostHog. Stdio has no instrumentation.
    // Stdio has exactly one long-lived connection, so one server is enough.
    logger.info('Starting MCP server in stdio mode');
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }

  // Build one server at startup so a registration error fails the boot, not the first request.
  createMcpServer();
  logger.info('Registered tools and resources successfully');

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

      await getScalekit().validateToken(token, validateTokenOptions);
      (req as any).token = token;
      
      next();
    } catch (err) {
      logger.warn('Unauthorized request', { error: err instanceof Error ? err.message : String(err) });
      return res.status(401).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).end();
    }
  });

  setupTransportRoutes(app, () => {
    const server = createMcpServer();
    instrumentServer(server);
    return server;
  });
  logger.debug('Transport routes set up completed');

  getScalekit();

  app.listen(PORT, () => logger.info(`MCP server running on http://localhost:${PORT}`));

  process.on('SIGTERM', async () => {
    if (posthog) await posthog.shutdown();
    process.exit(0);
  });
})().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
