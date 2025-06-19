// src/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import cors from 'cors';
import express from 'express';
import { MCPAuth } from 'mcp-auth';
import { config } from './config/config.js';
import { convertMetadataKeys, fetchMetadata, oauthAuthorizationServerHandler, oauthProtectedResourceHandler, verifyToken } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerCreateOrganizationTool } from './tools/create-organization.js';
import { registerGetCurrentEnvironmentTool } from './tools/get-current-environment.js';
import { registerListEnvironmentsTool } from './tools/list-environments.js';
import { registerSetEnvironmentTool } from './tools/set-environment.js';
import { ENDPOINTS } from './types/endpoints.js';

const PORT = config.port;
const server = new McpServer({ name: 'Scalekit', version: '0.0.0' });

const app = express();

app.use(cors({
  origin: ['https://mcp.scalekit.cloud'],
  credentials: true,
}));

app.use(express.json());

(async () => {
  const metadata = await fetchMetadata();
  const mcpAuth = new MCPAuth({ server: { type: 'oauth', metadata: convertMetadataKeys(metadata) } });

  // Register tools
  registerListEnvironmentsTool(server);
  logger.info('Registered tool: list-environments');
  registerSetEnvironmentTool(server);
  logger.info('Registered tool: set-environment');
  registerGetCurrentEnvironmentTool(server);
  logger.info('Registered tool: get-current-environment');
  registerCreateOrganizationTool(server);
  logger.info('Registered tool: create-organization');

  // Setup transport and middleware
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
      return res.status(401).set('WWW-Authenticate', `Bearer realm="OAuth", resource_metadata="${ENDPOINTS.oauthProtectedResource}"`).end();
    }
  });

  app.get('/.well-known/oauth-authorization-server', oauthAuthorizationServerHandler);
  app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);

  app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}`));
})();
