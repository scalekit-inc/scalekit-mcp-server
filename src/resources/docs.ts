import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { logger } from '../lib/logger.js';

const BASE_URL = 'https://docs.scalekit.com/_llms-txt';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const docsCache: Map<string, { content: string; ts: number }> = new Map();

export async function fetchDocsWithCache(url: string): Promise<string> {
  const cached = docsCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.content;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch docs from ${url}: ${res.status} ${res.statusText}`);
  }
  const content = await res.text();
  docsCache.set(url, { content, ts: Date.now() });
  return content;
}

const DOC_RESOURCES = [
  {
    name: 'docs-index',
    uri: 'docs://index',
    description: 'Navigation guide — read first to pick the right Scalekit documentation section',
    url: 'https://docs.scalekit.com/llms.txt',
  },
  {
    name: 'docs-full-stack-auth',
    uri: 'docs://full-stack-auth',
    description: 'Full-stack authentication: users, sessions, RBAC',
    url: `${BASE_URL}/full-stack-auth-complete.txt`,
  },
  {
    name: 'docs-agent-auth',
    uri: 'docs://agent-auth',
    description: 'AI agent authentication: OAuth token vault, connectors, tool calling',
    url: `${BASE_URL}/agent-authentication.txt`,
  },
  {
    name: 'docs-mcp-auth',
    uri: 'docs://mcp-auth',
    description: 'Remote MCP server authentication: OAuth 2.1, Dynamic Client Registration',
    url: `${BASE_URL}/mcp-authentication.txt`,
  },
  {
    name: 'docs-sso-scim',
    uri: 'docs://sso-scim',
    description: 'Enterprise SSO and SCIM: SAML, OIDC, directory sync provisioning',
    url: `${BASE_URL}/enterprise-sso--scim.txt`,
  },
  {
    name: 'docs-quickstart',
    uri: 'docs://quickstart',
    description: 'Getting started guides and quickstart collection',
    url: `${BASE_URL}/quickstart-collection.txt`,
  },
  {
    name: 'docs-api-sdk',
    uri: 'docs://api-sdk',
    description: 'API endpoints, SDK methods (Node, Python, Go, Java), and webhooks reference',
    url: `${BASE_URL}/api--sdk-reference.txt`,
  },
  {
    name: 'docs-integrations',
    uri: 'docs://integrations',
    description: 'Provider-specific integration guides (Okta, Google, Microsoft, etc.)',
    url: `${BASE_URL}/integration-guides.txt`,
  },
  {
    name: 'docs-m2m-auth',
    uri: 'docs://m2m-auth',
    description: 'Machine-to-machine authentication: client credentials, API keys',
    url: `${BASE_URL}/machine-to-machine-auth.txt`,
  },
] as const;

export function registerDocsResources(server: McpServer) {
  for (const doc of DOC_RESOURCES) {
    server.resource(
      doc.name,
      doc.uri,
      { description: doc.description, mimeType: 'text/plain' },
      async (uri) => {
        try {
          const text = await fetchDocsWithCache(doc.url);
          return { contents: [{ uri: uri.href, text, mimeType: 'text/plain' }] };
        } catch (err) {
          logger.error(`Failed to fetch docs resource ${doc.uri}`, { error: err });
          return {
            contents: [{ uri: uri.href, text: `Failed to load documentation: ${err instanceof Error ? err.message : String(err)}`, mimeType: 'text/plain' }],
          };
        }
      }
    );
  }
}
