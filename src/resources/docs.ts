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
    description: 'Start here: maps all Scalekit docs — read to find which resource covers your question',
    url: 'https://docs.scalekit.com/llms.txt',
  },
  {
    name: 'docs-full-stack-auth',
    uri: 'docs://full-stack-auth',
    description: 'Implement full-stack auth: user login, sessions, RBAC, and access control for web apps',
    url: `${BASE_URL}/full-stack-auth-complete.txt`,
  },
  {
    name: 'docs-agent-auth',
    uri: 'docs://agent-auth',
    description: 'Authenticate AI agents: OAuth token vault, connect to APIs, secure tool calling',
    url: `${BASE_URL}/agent-authentication.txt`,
  },
  {
    name: 'docs-mcp-auth',
    uri: 'docs://mcp-auth',
    description: 'Add auth to your MCP server, secure remote MCP, OAuth 2.1 and Dynamic Client Registration',
    url: `${BASE_URL}/mcp-authentication.txt`,
  },
  {
    name: 'docs-sso-scim',
    uri: 'docs://sso-scim',
    description: 'Set up enterprise SSO (SAML/OIDC) and SCIM directory sync for B2B customers',
    url: `${BASE_URL}/enterprise-sso--scim.txt`,
  },
  {
    name: 'docs-quickstart',
    uri: 'docs://quickstart',
    description: 'Get started with Scalekit: quickstart guides and initial setup',
    url: `${BASE_URL}/quickstart-collection.txt`,
  },
  {
    name: 'docs-api-sdk',
    uri: 'docs://api-sdk',
    description: 'API reference, SDK methods for Node/Python/Go/Java, and webhook event docs',
    url: `${BASE_URL}/api--sdk-reference.txt`,
  },
  {
    name: 'docs-integrations',
    uri: 'docs://integrations',
    description: 'Connect identity providers: step-by-step guides for Okta, Google, Microsoft, and more',
    url: `${BASE_URL}/integration-guides.txt`,
  },
  {
    name: 'docs-m2m-auth',
    uri: 'docs://m2m-auth',
    description: 'M2M auth: client credentials flow, API key management, service-to-service auth',
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
