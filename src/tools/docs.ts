import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { fetchDocsWithCache } from '../resources/docs.js';
import { TOOLS } from './index.js';

const BASE_URL = 'https://docs.scalekit.com/_llms-txt';
const FALLBACK_URL = 'https://docs.scalekit.com/llms-small.txt';

const ROUTES = [
  { keywords: ['fsa', 'full stack', 'session', 'rbac'], url: `${BASE_URL}/full-stack-auth-complete.txt` },
  { keywords: ['agent', 'oauth token', 'connector', 'tool calling'], url: `${BASE_URL}/agent-authentication.txt` },
  { keywords: ['mcp', 'remote mcp', 'dcr', 'oauth 2.1'], url: `${BASE_URL}/mcp-authentication.txt` },
  { keywords: ['sso', 'saml', 'scim', 'directory', 'enterprise'], url: `${BASE_URL}/enterprise-sso--scim.txt` },
  { keywords: ['quickstart', 'getting started', 'setup'], url: `${BASE_URL}/quickstart-collection.txt` },
  { keywords: ['api', 'sdk', 'node', 'python', 'go', 'java', 'webhook'], url: `${BASE_URL}/api--sdk-reference.txt` },
  { keywords: ['integration', 'provider', 'okta', 'google'], url: `${BASE_URL}/integration-guides.txt` },
  { keywords: ['m2m', 'client credentials', 'api key', 'machine'], url: `${BASE_URL}/machine-to-machine-auth.txt` },
];

function routeQuery(query: string): string {
  const lower = query.toLowerCase();
  for (const route of ROUTES) {
    if (route.keywords.some((kw) => lower.includes(kw))) {
      return route.url;
    }
  }
  return FALLBACK_URL;
}

export function registerDocsTools(server: McpServer) {
  server.tool(
    TOOLS.search_docs.name,
    TOOLS.search_docs.description,
    { query: z.string().min(1) },
    async ({ query }) => {
      const url = routeQuery(query);
      try {
        const text = await fetchDocsWithCache(url);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        logger.error('Failed to fetch docs for search_docs', { error: err, query, url });
        return {
          content: [{ type: 'text' as const, text: `Failed to retrieve documentation: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
