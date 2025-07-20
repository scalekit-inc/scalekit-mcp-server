import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

export const setupTransportRoutes = (
  app: express.Express,
  server: McpServer
) => {
  app.post('/', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    const token = (req as any).token;
    
    let authInfo = { token: token };
    (req as any).auth = authInfo;
    
    await server.connect(transport);
    
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Transport error:', error);
    }
  });
};
