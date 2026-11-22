import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { callerTokenWith, ENV_ID, FakeBackend } from './helpers.js';

// ENDPOINTS reads SK_API_BASE_URL on first import, so start the fake backend first.
const backend = new FakeBackend();
await backend.start();
process.env.SK_API_BASE_URL = backend.baseUrl;
process.env.LOG_LEVEL = 'error';
const { setupTransportRoutes } = await import('../src/lib/transport.js');
const { createMcpServer } = await import('../src/server.js');

const TOKEN = callerTokenWith({ sub: 'usr_alice' });
let baseUrl = '';
let close: () => Promise<void>;

/** One tools/call over the real Streamable HTTP route, as an MCP client would send it. */
async function postToolCall(id: number, name: string, args: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
}

before(async () => {
  const app = express();
  app.use(express.json());
  // Stand-in for the auth middleware: it validates the token and puts it on the request.
  app.use((req, _res, next) => {
    (req as any).token = TOKEN;
    next();
  });
  setupTransportRoutes(app, createMcpServer);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await close();
  await backend.stop();
});

describe('HTTP transport', () => {
  it('serves overlapping requests: a fast call during a slow one does not fail', async () => {
    // GRANOLA lookups are slow, LINEAR lookups fast, so the LINEAR request starts and ends
    // while the GRANOLA request still holds its transport open.
    backend.reset((req) => {
      if (req.path !== '/api/v1/providers') return undefined;
      const slow = req.query.get('identifier') === 'GRANOLAMCP';
      return {
        delayMs: slow ? 400 : 0,
        body: { providers: [{ identifier: req.query.get('identifier'), display_name: 'x', categories: [] }] },
      };
    });

    const slow = postToolCall(1, 'get_connector', { environmentId: ENV_ID, connector: 'GRANOLAMCP', includeSetupStatus: false });
    await new Promise((r) => setTimeout(r, 100));
    const fast = await postToolCall(2, 'get_connector', { environmentId: ENV_ID, connector: 'LINEARMCP', includeSetupStatus: false });
    const slowRes = await slow;

    for (const [label, res] of [['fast', fast], ['slow', slowRes]] as const) {
      assert.equal(res.status, 200, `${label} request: HTTP ${res.status} ${res.body.slice(0, 200)}`);
      assert.ok(!res.body.includes('<!DOCTYPE html>'), `${label} request returned an HTML error page`);
    }
    assert.match(fast.body, /Connector LINEARMCP/);
    assert.match(slowRes.body, /Connector GRANOLAMCP/);
  });

  it('serves many concurrent requests', async () => {
    backend.reset((req) =>
      req.path === '/api/v1/providers'
        ? { delayMs: 50, body: { providers: [{ identifier: req.query.get('identifier'), display_name: 'x', categories: [] }] } }
        : undefined
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => postToolCall(i, 'get_connector', { environmentId: ENV_ID, connector: `C${i}`, includeSetupStatus: false }))
    );
    results.forEach((r, i) => {
      assert.equal(r.status, 200, `request ${i}: ${r.body.slice(0, 200)}`);
      assert.match(r.body, new RegExp(`Connector C${i}\\b`));
    });
  });

  it('returns a JSON-RPC error, not an HTML page, when building the server fails', async () => {
    const app = express();
    app.use(express.json());
    setupTransportRoutes(app, () => {
      throw new Error('boom');
    });
    const srv = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => srv.once('listening', () => resolve()));
    const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }),
    });
    const body = await res.json();
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    assert.equal(res.status, 500);
    assert.deepEqual(body, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error. Retry the request.' }, id: 7 });
  });
});
