import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { logger } from './logger.js';

export const setupTransportRoutes = (
  app: express.Express,
  createServer: () => McpServer
) => {
  app.post('/', async (req, res) => {
    // A server and a transport per request. Reusing one server across requests
    // means every request overwrites the shared `server.transport`, so a response
    // can be written to a concurrent request's transport (the SDK captures the
    // transport when it dispatches, but `connect()` and `handleRequest()` are
    // separate awaits, and another request can connect in between).
    const server = createServer();
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

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Transport error', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });
};
