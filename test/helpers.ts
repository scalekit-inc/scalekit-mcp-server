import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export interface FakeResponse {
  status?: number;
  body?: unknown;
  /** Hold the response this long, to simulate a slow backend call. */
  delayMs?: number;
}

export type Route = (req: RecordedRequest) => FakeResponse | undefined;

export const ENV_ID = 'env_58345499215790610';
export const ENV_DOMAIN = 'acme.scalekit.test';

/**
 * Local stand-in for the Scalekit API. Every request is recorded. The environment lookup the
 * tools make first is answered automatically; everything else goes to the test's route.
 */
export class FakeBackend {
  requests: RecordedRequest[] = [];
  route: Route = () => undefined;
  private server = http.createServer((req, res) => this.handle(req, res));
  baseUrl = '';

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  reset(route: Route): void {
    this.requests = [];
    this.route = route;
  }

  /** Requests other than the environment lookup. */
  apiRequests(): RecordedRequest[] {
    return this.requests.filter((r) => !r.path.startsWith('/api/v1/environments/'));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', this.baseUrl);
      const recorded: RecordedRequest = {
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined,
      };
      this.requests.push(recorded);

      let out: FakeResponse | undefined;
      if (recorded.path === `/api/v1/environments/${ENV_ID}`) {
        out = { body: { environment: { id: ENV_ID, domain: ENV_DOMAIN } } };
      } else {
        out = this.route(recorded);
      }
      const final = out ?? { status: 404, body: { code: 5, message: `no fake route for ${recorded.method} ${recorded.path}` } };
      setTimeout(() => {
        res.writeHead(final.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(final.body ?? {}));
      }, final.delayMs ?? 0);
    });
  }
}

/** A caller token with the given claims. Signature checks happen in middleware, not in tools. */
export function callerTokenWith(claims: Record<string, unknown>): string {
  return jwt.sign(claims, 'test-secret');
}
