import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import cors from 'cors';
import express from 'express';
import { MCPAuth } from 'mcp-auth';
import { config } from './config/config.js';
import { convertMetadataKeys, fetchMetadata, oauthAuthorizationServerHandler, oauthProtectedResourceHandler, verifyToken } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerTools } from './tools/index.js';
import { OAUTH_AUTHORIZATION_SERVER_PATH, OAUTH_PROTECTED_RESOURCE_PATH, WWWHeader } from './types/endpoints.js';

const PORT = config.port;
const server = new McpServer({ name: config.serverName, version: config.serverVersion });

const app = express();

app.use(cors({
  origin: [config.apiBaseUrl],
  credentials: true,
}));

app.use(express.json());

(async () => {
  const metadata = await fetchMetadata();
  const mcpAuth = new MCPAuth({ server: { type: 'oauth', metadata: convertMetadataKeys(metadata) } });

  registerTools(server)
  logger.info('Registered tools successfully');

  setupTransportRoutes(app, server, verifyToken);
  logger.debug('Transport routes set up completed');
  app.use(mcpAuth.delegatedRouter());
  app.use(async (req, res, next) => {
    try {
      if (req.path.includes('.well-known')) {
        return next();
      }
      await mcpAuth.bearerAuth(verifyToken)(req, res, next);
    } catch (err) {
      return res.status(401).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).end();
    }
  });

  app.get(OAUTH_AUTHORIZATION_SERVER_PATH, oauthAuthorizationServerHandler);
  app.get(OAUTH_PROTECTED_RESOURCE_PATH, oauthProtectedResourceHandler);

  app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}`));
})();
