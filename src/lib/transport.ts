import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { ENDPOINTS } from '../types/endpoints.js';

const transports: Record<string, SSEServerTransport> = {};

export const setupTransportRoutes = (
  app: express.Express,
  server: McpServer,
  verifyToken: (token: string) => Promise<any>
) => {
  app.get('/sse', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).set('WWW-Authenticate', `Bearer realm="OAuth", resource_metadata="${ENDPOINTS.oauthProtectedResource}"`).end();
    }

    const token = authHeader.replace('Bearer ', '');
    let authInfo
    try {
      authInfo = await verifyToken(token);
    } catch (err) {
      return res.status(401).set('WWW-Authenticate', `Bearer realm="OAuth", resource_metadata="${ENDPOINTS.oauthProtectedResource}"`).end();
    }
    const transport = new SSEServerTransport('/messages', res);
    (transport as any).session = { authInfo, token };

    const originalHandleMessage = transport.handleMessage.bind(transport);
    transport.handleMessage = async (message, extra) => {
      extra = extra || {};
      extra.authInfo = (transport as any).session?.authInfo;
      return await originalHandleMessage(message, extra);
    };

    transports[transport.sessionId] = transport;
    res.on('close', () => delete transports[transport.sessionId]);

    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = String(req.query.sessionId);
    const transport = transports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req as any, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });
};
