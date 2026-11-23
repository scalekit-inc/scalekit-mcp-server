import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { logger } from './logger.js';

/**
 * Stateless Streamable HTTP route. Each request gets its own server and transport, built by
 * `createServer`, because one McpServer accepts only one open transport: sharing an instance
 * made a request that overlapped a slower one fail with "Already connected to a transport"
 * and an HTML 500 page.
 */
export const setupTransportRoutes = (
  app: express.Express,
  createServer: () => McpServer
) => {
  app.post('/', async (req, res) => {
    const token = (req as any).token;
    (req as any).auth = { token };

    let server: McpServer | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    res.on('close', () => {
      transport.close().catch(() => {});
      server?.close().catch(() => {});
    });

    try {
      server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error(`MCP request failed method=${req.body?.method ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        // A JSON-RPC error the client can parse, not Express's HTML error page.
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error. Retry the request.' },
          id: req.body?.id ?? null,
        });
      }
    }
  });
};
