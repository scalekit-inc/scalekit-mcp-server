// src/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import cors from 'cors';
import express from 'express';
import { MCPAuth } from 'mcp-auth';
import { config } from './config/config.js';
import { convertMetadataKeys, fetchMetadata, verifyToken } from './lib/auth.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerCreateOrganizationTool } from './tools/create-organization.js';
import { registerGetCurrentEnvironmentTool } from './tools/get-current-environment.js';
import { registerListEnvironmentsTool } from './tools/list-environments.js';
import { registerSetEnvironmentTool } from './tools/set-environment.js';
import { ENDPOINTS } from './types/endpoints.js';

const PORT = config.port;
const server = new McpServer({ name: 'Scalekit', version: '0.0.0' });

const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  const metadata = await fetchMetadata();
  const mcpAuth = new MCPAuth({ server: { type: 'oauth', metadata: convertMetadataKeys(metadata) } });

  // Register tools
  registerListEnvironmentsTool(server);
  registerSetEnvironmentTool(server);
  registerGetCurrentEnvironmentTool(server);
  registerCreateOrganizationTool(server);

  // Setup transport and middleware
  setupTransportRoutes(app, server, verifyToken);
  app.use(mcpAuth.delegatedRouter());
  app.use(async (req, res, next) => {
    try {
      await mcpAuth.bearerAuth(verifyToken)(req, res, next);
    } catch (err) {
      return res.status(401).set('WWW-Authenticate', `Bearer realm="scalekit", resource_metadata="${ENDPOINTS.oauthProtectedResource}"`).end();
    }
  });

  app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}`));
})();
