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

app.use(cors({
  origin: [config.apiBaseUrl],
  credentials: true,
}));

app.get(OAUTH_PROTECTED_RESOURCE_PATH, oauthProtectedResourceHandler);

app.use(express.json());
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);

(async () => {
  registerTools(server)
  logger.info('Registered tools successfully');

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
