import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { callerTokenWith, ENV_DOMAIN, ENV_ID, FakeBackend, RecordedRequest } from './helpers.js';

// ENDPOINTS reads SK_API_BASE_URL when it is first imported, so the fake backend must be up and
// the env set before the tool modules load.
const backend = new FakeBackend();
await backend.start();
process.env.SK_API_BASE_URL = backend.baseUrl;
process.env.LOG_LEVEL = 'error';
const { registerTools } = await import('../src/tools/index.js');
const { callerIdentifier } = await import('../src/lib/api.js');

const TOKEN = callerTokenWith({ sub: 'usr_alice' });
let client: Client;

async function connect(token: string | undefined): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // Attach the caller token the way the HTTP transport does, as authInfo on each message.
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message: JSONRPCMessage, options?: any) =>
    send(message, { ...options, authInfo: token ? { token, clientId: 'test', scopes: [] } : undefined });
  await server.connect(serverTransport);
  const c = new Client({ name: 'test-client', version: '0.0.0' });
  await c.connect(clientTransport);
  return c;
}

async function call(name: string, args: Record<string, unknown>, c: Client = client): Promise<{ text: string; isError: boolean }> {
  try {
    const res: any = await c.callTool({ name, arguments: args });
    return { text: (res.content ?? []).map((x: any) => x.text).join('\n'), isError: !!res.isError };
  } catch (error) {
    return { text: (error as Error).message, isError: true };
  }
}

/** Every call to the API must carry the caller token and the target environment's domain. */
function assertScoped(requests: RecordedRequest[]) {
  assert.ok(requests.length > 0, 'expected at least one API call');
  for (const r of requests) {
    assert.equal(r.headers.authorization, `Bearer ${TOKEN}`, `${r.method} ${r.path} must carry the caller token`);
    assert.equal(r.headers['x-env-domain'], ENV_DOMAIN, `${r.method} ${r.path} must be scoped to the environment`);
  }
}

function provider(i: number, extra: Record<string, unknown> = {}) {
  return { identifier: `CONN${i}`, display_name: `Connector ${i}`, description: `Generic connector ${i}`, categories: ['misc'], ...extra };
}

before(async () => {
  client = await connect(TOKEN);
});
after(async () => {
  await client.close();
  await backend.stop();
});
beforeEach(() => backend.reset(() => undefined));

describe('tool registration', () => {
  it('lists the new tools and the agent-facing descriptions', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of [
      'search_connectors', 'get_connector', 'search_tools',
      'create_agentkit_connection', 'update_agentkit_connection', 'get_agentkit_connection', 'list_agentkit_connections',
      'create_virtual_mcp_server', 'get_virtual_mcp_server', 'list_virtual_mcp_servers', 'update_virtual_mcp_server',
      'delete_virtual_mcp_server', 'create_mcp_session_token',
    ]) {
      assert.ok(names.includes(n), `${n} is registered`);
    }
    const create = tools.find((t) => t.name === 'create_agentkit_connection')!;
    assert.match(create.description!, /org-wide connections.*not supported through MCP/);
    assert.ok(!('authMode' in (create.inputSchema.properties ?? {})), 'no auth mode input');
    const mint = tools.find((t) => t.name === 'create_mcp_session_token')!;
    assert.deepEqual(Object.keys(mint.inputSchema.properties ?? {}).sort(), ['accessLevel', 'environmentId', 'virtualMcpServerId']);
    const del = tools.find((t) => t.name === 'delete_virtual_mcp_server')!;
    assert.equal(del.annotations?.destructiveHint, true);
  });

  it('refuses every new tool without a caller token, before calling the API', async () => {
    const anon = await connect(undefined);
    const res = await call('list_agentkit_connections', { environmentId: ENV_ID }, anon);
    assert.match(res.text, /requires OAuth/);
    assert.equal(backend.requests.length, 0);
    await anon.close();
  });
});

describe('search_connectors', () => {
  // 450 connectors across three pages of 200; the match sits on the last page.
  const catalog = Array.from({ length: 450 }, (_, i) =>
    i === 430 ? provider(i, { identifier: 'GMAIL', display_name: 'Gmail', categories: ['email'] }) : provider(i)
  );
  const providersRoute = (req: RecordedRequest) => {
    if (req.path !== '/api/v1/providers') return undefined;
    const size = Number(req.query.get('page_size'));
    const start = Number(req.query.get('page_token') ?? 0);
    const next = start + size < catalog.length ? String(start + size) : '';
    return { body: { providers: catalog.slice(start, start + size), next_page_token: next, total_size: catalog.length } };
  };

  it('reads every page at 200 per call and finds a match past the first page', async () => {
    backend.reset(providersRoute);
    const res = await call('search_connectors', { environmentId: ENV_ID, query: 'gmail' });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /— 1 found/);
    assert.match(res.text, /identifier: GMAIL/);
    const calls = backend.apiRequests();
    assert.equal(calls.length, 3);
    for (const r of calls) assert.equal(r.query.get('page_size'), '200');
    assert.deepEqual(calls.map((r) => r.query.get('page_token')), [null, '200', '400']);
    assertScoped(calls);
  });

  it('pages keyword matches locally with its own token', async () => {
    backend.reset(providersRoute);
    const first = await call('search_connectors', { environmentId: ENV_ID, query: 'generic', pageSize: 2 });
    assert.match(first.text, /— 450 found \(showing 1–2\)/);
    assert.match(first.text, /Next page token: csearch_2/);
    const second = await call('search_connectors', { environmentId: ENV_ID, query: 'generic', pageSize: 2, pageToken: 'csearch_2' });
    assert.match(second.text, /showing 3–4/);
    assert.match(second.text, /CONN2/);
  });

  it('returns the whole catalog in compact form with all=true', async () => {
    backend.reset(providersRoute);
    const res = await call('search_connectors', { environmentId: ENV_ID, all: true });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /All connectors \(ALL\) — 450 found/);
    assert.match(res.text, /- GMAIL \| Gmail \| email/);
    assert.ok(!res.text.includes('description:'), 'compact rows leave out descriptions');
    assert.ok(!res.text.includes('Next page token'));
  });

  it('returns an error asking to retry when a page fails, with no partial list', async () => {
    backend.reset((req) => (req.query.get('page_token') === '200' ? { status: 500, body: { message: 'boom' } } : providersRoute(req)));
    const res = await call('search_connectors', { environmentId: ENV_ID, query: 'gmail' });
    assert.equal(res.isError, true);
    assert.match(res.text, /page 2/);
    assert.match(res.text, /Retry the call/);
    assert.ok(!res.text.includes('CONN'), 'no partial results');
  });

  it('fails instead of showing "not_configured" when setup status cannot be read', async () => {
    backend.reset((req) => (req.path === '/api/v1/connections/app' ? { status: 500 } : providersRoute(req)));
    const res = await call('search_connectors', { environmentId: ENV_ID, query: 'gmail', includeSetupStatus: true });
    assert.equal(res.isError, true);
    assert.ok(!res.text.includes('not_configured'));
  });

  it('pages setup status at 200 per call too', async () => {
    const conns = Array.from({ length: 250 }, (_, i) => ({ id: `conn_${i}`, provider_key: i === 249 ? 'GMAIL:env' : `X${i}`, status: 'ACTIVE', type: 'OAUTH', key_id: `k${i}` }));
    backend.reset((req) => {
      if (req.path === '/api/v1/connections/app') {
        const start = Number(req.query.get('page_token') ?? 0);
        return { body: { connections: conns.slice(start, start + 200), next_page_token: start + 200 < conns.length ? String(start + 200) : '' } };
      }
      return providersRoute(req);
    });
    const res = await call('search_connectors', { environmentId: ENV_ID, query: 'gmail', includeSetupStatus: true });
    assert.match(res.text, /setup: ACTIVE \(OAUTH, k249\)/);
    const setupCalls = backend.apiRequests().filter((r) => r.path === '/api/v1/connections/app');
    assert.equal(setupCalls.length, 2);
    for (const r of setupCalls) assert.equal(r.query.get('page_size'), '200');
  });

  it('without a keyword or all, returns one API page at the requested size', async () => {
    backend.reset(providersRoute);
    const res = await call('search_connectors', { environmentId: ENV_ID, pageSize: 5 });
    assert.match(res.text, /Next page token: 5/);
    const calls = backend.apiRequests();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].query.get('page_size'), '5');
  });

  it('maps SCALEKIT to the backend DEFAULT provider type', async () => {
    backend.reset(providersRoute);
    await call('search_connectors', { environmentId: ENV_ID, query: 'gmail', connectorType: 'SCALEKIT' });
    assert.equal(backend.apiRequests()[0].query.get('filter.provider_type'), 'DEFAULT');
  });

  it('rejects page sizes over 100', async () => {
    const res = await call('search_connectors', { environmentId: ENV_ID, pageSize: 1000 });
    assert.equal(res.isError, true);
    assert.equal(backend.requests.length, 0);
  });
});

describe('get_connector', () => {
  it('reads the connector and its existing connections', async () => {
    backend.reset((req) => {
      if (req.path === '/api/v1/providers' && req.query.get('identifier') === 'GMAIL') {
        return { body: { providers: [{ identifier: 'GMAIL', display_name: 'Gmail', description: 'Mail', categories: ['email'] }] } };
      }
      if (req.path === '/api/v1/providers') return { body: { providers: [] } };
      if (req.path === '/api/v1/agentkit/connection') {
        assert.equal(req.query.get('provider'), 'GMAIL');
        return { body: { connections: [{ id: 'conn_1', connection_name: 'gmail-work', provider: 'GMAIL', type: 'OAUTH' }] } };
      }
      return undefined;
    });
    const res = await call('get_connector', { environmentId: ENV_ID, connector: 'gmail' });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /Connector GMAIL/);
    assert.match(res.text, /connections in this environment: gmail-work \(conn_1, OAUTH\)/);
    assertScoped(backend.apiRequests());
  });

  it('says how to find the ID when the connector does not exist', async () => {
    backend.reset((req) => (req.path === '/api/v1/providers' ? { status: 404, body: { message: 'not found' } } : undefined));
    const res = await call('get_connector', { environmentId: ENV_ID, connector: 'NOPE' });
    assert.equal(res.isError, true);
    assert.match(res.text, /No connector with ID "NOPE".*search_connectors/);
  });
});

describe('search_tools', () => {
  const toolsByProvider: Record<string, unknown[]> = {
    GMAIL: [
      { id: 't1', provider: 'GMAIL', definition: { name: 'gmail_send_email', description: 'Send an email' } },
      { id: 't2', provider: 'GMAIL', definition: { name: 'gmail_list_labels', description: 'List labels' } },
    ],
    SLACK: [{ id: 't3', provider: 'SLACK', definition: { name: 'slack_send_message', description: 'Post a message' } }],
  };
  const toolsRoute = (req: RecordedRequest) => {
    if (req.path !== '/api/v1/tools') return undefined;
    const p = req.query.get('filter.provider') ?? '';
    return { body: { tools: toolsByProvider[p] ?? [], total_size: (toolsByProvider[p] ?? []).length } };
  };

  it('makes one call per connector at page_size 300, never sends filter.query, and matches the keyword locally', async () => {
    backend.reset(toolsRoute);
    const res = await call('search_tools', { environmentId: ENV_ID, connectors: ['gmail', 'SLACK'], query: 'send' });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /— 2 total/);
    assert.match(res.text, /gmail_send_email/);
    assert.match(res.text, /slack_send_message/);
    assert.ok(!res.text.includes('gmail_list_labels'));
    const calls = backend.apiRequests();
    assert.deepEqual(calls.map((r) => r.query.get('filter.provider')).sort(), ['GMAIL', 'SLACK']);
    for (const r of calls) {
      assert.equal(r.query.get('page_size'), '300');
      assert.equal(r.query.get('filter.query'), null);
    }
    assertScoped(calls);
  });

  it('uses page_size 300 for full schemas too', async () => {
    backend.reset(toolsRoute);
    const res = await call('search_tools', { environmentId: ENV_ID, connectors: ['GMAIL'], summary: false });
    assert.match(res.text, /definition: \{/);
    assert.equal(backend.apiRequests()[0].query.get('page_size'), '300');
  });

  it('returns an error naming the connector when one call fails, with no partial results', async () => {
    backend.reset((req) => (req.query.get('filter.provider') === 'SLACK' ? { status: 503 } : toolsRoute(req)));
    const res = await call('search_tools', { environmentId: ENV_ID, connectors: ['GMAIL', 'SLACK'] });
    assert.equal(res.isError, true);
    assert.match(res.text, /SLACK/);
    assert.match(res.text, /Retry the call/);
    assert.ok(!res.text.includes('gmail_send_email'));
  });

  it('points to search_connectors for an unknown connector', async () => {
    backend.reset(toolsRoute);
    const res = await call('search_tools', { environmentId: ENV_ID, connectors: ['NOPE'] });
    assert.match(res.text, /No connector named NOPE. Find the ID with search_connectors/);
  });

  it('sends connector and identifier for custom connectors', async () => {
    backend.reset((req) => (req.path === '/api/v1/tools' ? { body: { tools: [{ id: 'c1', provider: 'MY', definition: { name: 'my_action' } }] } } : undefined));
    await call('search_tools', { environmentId: ENV_ID, connectors: ['My Sentry'], identifier: 'user-1' });
    const r = backend.apiRequests()[0];
    assert.equal(r.query.get('filter.connector'), 'MY SENTRY');
    assert.equal(r.query.get('filter.identifier'), 'user-1');
    assert.equal(r.query.get('filter.provider'), null);
  });

  it('reports more than 300 actions with a page token for a single connector', async () => {
    backend.reset((req) => (req.path === '/api/v1/tools' ? { body: { tools: toolsByProvider.GMAIL, total_size: 420, next_page_token: 'n1' } } : undefined));
    const res = await call('search_tools', { environmentId: ENV_ID, connectors: ['GMAIL'] });
    assert.match(res.text, /more than 300 actions \(420 total\). Next page token: n1/);
  });

  it('rejects calls without connectors, with more than five, or a page token with several connectors', async () => {
    assert.equal((await call('search_tools', { environmentId: ENV_ID, connectors: [] })).isError, true);
    assert.equal((await call('search_tools', { environmentId: ENV_ID, connectors: ['A', 'B', 'C', 'D', 'E', 'F'] })).isError, true);
    const multi = await call('search_tools', { environmentId: ENV_ID, connectors: ['A', 'B'], pageToken: 'x' });
    assert.equal(multi.isError, true);
    assert.equal(backend.requests.length, 0);
  });
});

describe('AgentKit connections', () => {
  const conn = {
    id: 'conn_92716344089821478', connection_name: 'slack-team', provider: 'SLACK', type: 'OAUTH', auth_mode: 'USER',
    oauth_config: { client_id: 'abc', client_secret: '****cret', scopes: ['chat:write'], use_scalekit_creds: false },
    connection_mcp_url: 'https://acme/mcp/v3/connections/slack-team',
  };

  it('creates a per-user connection and ignores any auth mode the agent sends', async () => {
    backend.reset((req) => (req.method === 'POST' && req.path === '/api/v1/agentkit/connection' ? { body: { connection: conn } } : undefined));
    const res = await call('create_agentkit_connection', { environmentId: ENV_ID, connector: 'SLACK', connectionName: 'slack-team', authMode: 'ORG_WIDE' });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /Created connection slack-team/);
    const r = backend.apiRequests()[0];
    assert.deepEqual(r.body, { provider: 'SLACK', auth_mode: 'USER', connection_name: 'slack-team' });
    assertScoped(backend.apiRequests());
  });

  it('passes the API message through for a duplicate name', async () => {
    backend.reset(() => ({ status: 400, body: { code: 3, message: 'connection_name already exists' } }));
    const res = await call('create_agentkit_connection', { environmentId: ENV_ID, connector: 'SLACK', connectionName: 'slack-team' });
    assert.equal(res.isError, true);
    assert.match(res.text, /connection_name already exists \(HTTP 400\)/);
  });

  it('hides server error details and asks for a retry', async () => {
    backend.reset(() => ({ status: 500, body: { message: 'pq: connection refused at 10.0.0.3' } }));
    const res = await call('create_agentkit_connection', { environmentId: ENV_ID, connector: 'SLACK' });
    assert.equal(res.isError, true);
    assert.ok(!res.text.includes('10.0.0.3'));
    assert.match(res.text, /Retry the call/);
  });

  it('rejects connection names the API would refuse', async () => {
    const res = await call('create_agentkit_connection', { environmentId: ENV_ID, connector: 'SLACK', connectionName: 'bad name!' });
    assert.equal(res.isError, true);
    assert.equal(backend.requests.length, 0);
  });

  it('updates only the sent fields, by ID, and never echoes the secret', async () => {
    backend.reset((req) => (req.method === 'PATCH' ? { body: { connection: conn } } : undefined));
    const res = await call('update_agentkit_connection', {
      environmentId: ENV_ID, connectionId: conn.id, scopes: ['chat:write', 'files:write'], clientSecret: 'super-secret-value',
    });
    assert.equal(res.isError, false, res.text);
    const r = backend.apiRequests()[0];
    assert.equal(r.path, `/api/v1/agentkit/connection/${conn.id}`);
    assert.deepEqual(r.body, { oauth_config: { scopes: ['chat:write', 'files:write'], client_secret: 'super-secret-value' } });
    assert.ok(!res.text.includes('super-secret-value'));
    assert.ok(!res.text.includes('****cret'));
    assert.match(res.text, /client_secret: \(set, hidden\)/);
    assert.match(res.text, /changed: scopes, client_secret/);
  });

  it('refuses an update with nothing to change, and a name instead of an ID', async () => {
    assert.match((await call('update_agentkit_connection', { environmentId: ENV_ID, connectionId: conn.id })).text, /Nothing to update/);
    assert.equal((await call('update_agentkit_connection', { environmentId: ENV_ID, connectionId: 'slack-team', scopes: [] })).isError, true);
    assert.equal(backend.requests.length, 0);
  });

  it('sends an empty scope list to clear scopes', async () => {
    backend.reset(() => ({ body: { connection: { ...conn, oauth_config: { scopes: [] } } } }));
    const res = await call('update_agentkit_connection', { environmentId: ENV_ID, connectionId: conn.id, scopes: [] });
    assert.deepEqual(backend.apiRequests()[0].body, { oauth_config: { scopes: [] } });
    assert.match(res.text, /scopes: \(none\)/);
  });

  it('gets a connection by name, URL-encoded', async () => {
    backend.reset((req) => (req.path === '/api/v1/agentkit/connection/slack%20team' || req.path === '/api/v1/agentkit/connection/slack team' ? { body: { connection: conn } } : undefined));
    const res = await call('get_agentkit_connection', { environmentId: ENV_ID, connection: 'slack team' });
    assert.equal(res.isError, false, res.text);
    assert.match(res.text, /connection_mcp_url: https:\/\/acme/);
  });

  it('lists connections with filters mapped to the API names', async () => {
    backend.reset(() => ({ body: { connections: [conn], total_size: 1, next_page_token: 'p2' } }));
    const res = await call('list_agentkit_connections', { environmentId: ENV_ID, connector: 'SLACK', query: 'team', pageSize: 10 });
    const r = backend.apiRequests()[0];
    assert.equal(r.query.get('provider'), 'SLACK');
    assert.equal(r.query.get('query'), 'team');
    assert.equal(r.query.get('page_size'), '10');
    assert.match(res.text, /name: slack-team/);
    assert.match(res.text, /Next page token: p2/);
  });
});

describe('virtual MCP servers', () => {
  const cfg = {
    id: 'cfg_85630864460904897', name: 'sales-assistant', description: 'Sales',
    mcp_server_url: 'https://acme/mcp/v3/uuid', tool_exposure: 'DIRECT',
    connection_tool_mappings: [
      { connection_id: 'conn_1', connection_name: 'gmail-work', provider: 'GMAIL', tools: ['gmail_send_email'] },
      { connection_id: 'conn_2', connection_name: 'slack-team', provider: 'SLACK', tools: [] },
    ],
  };

  it('creates a server with connection mappings in API shape', async () => {
    backend.reset((req) => (req.method === 'POST' ? { body: { config: cfg } } : undefined));
    const res = await call('create_virtual_mcp_server', {
      environmentId: ENV_ID, name: 'sales-assistant',
      connections: [{ connectionName: 'gmail-work', tools: ['gmail_send_email'] }, { connectionName: 'slack-team' }],
    });
    assert.equal(res.isError, false, res.text);
    assert.deepEqual(backend.apiRequests()[0].body, {
      name: 'sales-assistant',
      connection_tool_mappings: [{ connection_name: 'gmail-work', tools: ['gmail_send_email'] }, { connection_name: 'slack-team', tools: [] }],
      tool_exposure: 'DIRECT',
    });
    assert.match(res.text, /slack-team \(SLACK\): all actions/);
    assertScoped(backend.apiRequests());
  });

  it('rejects names with upper case or spaces before calling the API', async () => {
    const res = await call('create_virtual_mcp_server', { environmentId: ENV_ID, name: 'Sales Bot', connections: [{ connectionName: 'x' }] });
    assert.equal(res.isError, true);
    assert.equal(backend.requests.length, 0);
  });

  it('updates only the fields that were sent', async () => {
    backend.reset((req) => (req.method === 'PUT' ? { body: { config: { ...cfg, description: 'New' } } } : undefined));
    const res = await call('update_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id, description: 'New' });
    assert.equal(res.isError, false, res.text);
    assert.deepEqual(backend.apiRequests()[0].body, { description: 'New' });
    assert.ok(!res.text.includes('list tools again'), 'a description change does not change tools');
  });

  it('tells the agent to re-list tools after a connection change', async () => {
    backend.reset(() => ({ body: { config: cfg } }));
    const res = await call('update_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id, connections: [{ connectionName: 'gmail-work' }] });
    assert.match(res.text, /list tools again/);
  });

  it('refuses an update with nothing to change and an empty connection list', async () => {
    assert.match((await call('update_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id })).text, /Nothing to update/);
    assert.equal((await call('update_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id, connections: [] })).isError, true);
    assert.equal(backend.requests.length, 0);
  });

  it('gets, lists and deletes', async () => {
    backend.reset((req) => {
      if (req.method === 'GET' && req.path === `/api/v1/mcp/configs/${cfg.id}`) return { body: { config: cfg } };
      if (req.method === 'GET' && req.path === '/api/v1/mcp/configs') return { body: { configs: [cfg], total_size: 1 } };
      if (req.method === 'DELETE') return { body: {} };
      return undefined;
    });
    const got = await call('get_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id });
    assert.match(got.text, /gmail-work \(GMAIL, conn_1\): gmail_send_email/);
    const listed = await call('list_virtual_mcp_servers', { environmentId: ENV_ID, search: 'sales', connector: 'GMAIL' });
    assert.match(listed.text, /connections: gmail-work, slack-team/);
    const listReq = backend.apiRequests().find((r) => r.path === '/api/v1/mcp/configs')!;
    assert.equal(listReq.query.get('search'), 'sales');
    assert.equal(listReq.query.get('filter.provider'), 'GMAIL');
    const deleted = await call('delete_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: cfg.id });
    assert.match(deleted.text, /Deleted virtual MCP server cfg_/);
    assertScoped(backend.apiRequests());
  });

  it('caps list page size at the backend limit of 30', async () => {
    assert.equal((await call('list_virtual_mcp_servers', { environmentId: ENV_ID, pageSize: 31 })).isError, true);
  });

  it('passes not-found through on get', async () => {
    backend.reset(() => ({ status: 404, body: { message: "config 'cfg_1' not found" } }));
    const res = await call('get_virtual_mcp_server', { environmentId: ENV_ID, virtualMcpServerId: 'cfg_1' });
    assert.match(res.text, /not found \(HTTP 404\)/);
  });
});

describe('create_mcp_session_token', () => {
  const cfg = { id: 'cfg_85630864460904897', name: 'sales-assistant', mcp_server_url: 'https://acme/mcp/v3/uuid' };
  const route = (req: RecordedRequest) => {
    if (req.method === 'GET' && req.path === `/api/v1/mcp/configs/${cfg.id}`) return { body: { config: cfg } };
    if (req.method === 'POST' && req.path === `/api/v1/mcp/configs/${cfg.id}/tokens`) {
      return { body: { token: 'eyJ.session.token', expires_at: '2026-11-20T16:14:03Z' } };
    }
    return undefined;
  };

  it('mints a 6-hour token for a hash of the caller sub', async () => {
    backend.reset(route);
    const res = await call('create_mcp_session_token', { environmentId: ENV_ID, virtualMcpServerId: cfg.id });
    assert.equal(res.isError, false, res.text);
    const mint = backend.apiRequests().find((r) => r.method === 'POST')!;
    const expected = callerIdentifier(TOKEN)!;
    assert.match(expected, /^[0-9a-f]{16}$/);
    assert.deepEqual(mint.body, { identifier: expected, expiry: '21600s', access_level: 'FULL' });
    assert.match(res.text, /token: eyJ\.session\.token/);
    assert.match(res.text, /mcp_server_url: https:\/\/acme\/mcp\/v3\/uuid/);
    assert.ok(res.text.includes(expected));
    assertScoped(backend.apiRequests());
  });

  it('cannot be pointed at another user: identifier and expiry inputs are ignored', async () => {
    backend.reset(route);
    await call('create_mcp_session_token', {
      environmentId: ENV_ID, virtualMcpServerId: cfg.id, identifier: 'bob@acme.com', expiry: '86400s', accessLevel: 'READ_ONLY',
    });
    const mint = backend.apiRequests().find((r) => r.method === 'POST')!;
    assert.equal(mint.body.identifier, callerIdentifier(TOKEN));
    assert.equal(mint.body.expiry, '21600s');
    assert.equal(mint.body.access_level, 'READ_ONLY');
  });

  it('gives different callers different identifiers', async () => {
    backend.reset(route);
    const bob = await connect(callerTokenWith({ sub: 'usr_bob' }));
    await call('create_mcp_session_token', { environmentId: ENV_ID, virtualMcpServerId: cfg.id }, bob);
    await bob.close();
    const mint = backend.apiRequests().find((r) => r.method === 'POST')!;
    assert.notEqual(mint.body.identifier, callerIdentifier(TOKEN));
  });

  it('refuses when the caller token has no sub, without calling the API', async () => {
    const nosub = await connect(callerTokenWith({ email: 'a@b.c' }));
    const res = await call('create_mcp_session_token', { environmentId: ENV_ID, virtualMcpServerId: cfg.id }, nosub);
    await nosub.close();
    assert.equal(res.isError, true);
    assert.match(res.text, /Could not read your user ID/);
    assert.equal(backend.requests.length, 0);
  });

  it('does not mint when the server is not in this environment', async () => {
    backend.reset(() => ({ status: 404, body: { message: 'config not found' } }));
    const res = await call('create_mcp_session_token', { environmentId: ENV_ID, virtualMcpServerId: cfg.id });
    assert.equal(res.isError, true);
    assert.equal(backend.apiRequests().filter((r) => r.method === 'POST').length, 0);
  });

  it('passes through the reason a mint fails, such as inactive accounts', async () => {
    backend.reset((req) =>
      req.method === 'POST'
        ? { status: 400, body: { message: 'connection gmail-work has no active connected account for identifier' } }
        : route(req)
    );
    const res = await call('create_mcp_session_token', { environmentId: ENV_ID, virtualMcpServerId: cfg.id });
    assert.equal(res.isError, true);
    assert.match(res.text, /gmail-work has no active connected account/);
  });
});
