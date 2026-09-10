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
      // Build the response headers after the handler runs instead of streaming
      // SSE. Analytics needs this: with SSE the headers are flushed before any
      // handler executes, so the `Mcp-Session-Id` token minted during
      // `initialize` never reaches the client and every request is attributed
      // to a fresh session. With JSON responses the token goes out, clients
      // replay it, and any instance can recover the session from the header.
      enableJsonResponse: true,
    });

    const token = (req as any).token;

    let authInfo = { token: token };
    (req as any).auth = authInfo;

    res.on('finish', () => { transport.close().catch(() => {}); });

    await server.connect(transport);

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Transport error:', error);
    }
  });
};
