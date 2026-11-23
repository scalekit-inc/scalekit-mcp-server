import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from './config/config.js';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

const SERVER_INSTRUCTIONS = `You have access to Scalekit's documentation via docs:// resources and a search_docs tool.

PREFERRED WORKFLOW:
1. For any question about how to use Scalekit, start by reading docs://index to understand which section covers the topic.
2. Then read the specific docs:// resource (e.g. docs://mcp-auth, docs://full-stack-auth, docs://agent-auth).
3. Only use search_docs if no docs:// resource clearly covers the topic.

Available resources:
- docs://index — start here to navigate all documentation
- docs://mcp-auth — add authentication to MCP servers (OAuth 2.1, DCR)
- docs://full-stack-auth — user login, sessions, RBAC for web apps
- docs://agent-auth — AI agent OAuth token vault, connectors, tool calling
- docs://sso-scim — enterprise SSO (SAML/OIDC) and directory sync
- docs://quickstart — getting started guides
- docs://api-sdk — API reference, SDK methods, webhooks
- docs://integrations — Okta, Google, Microsoft, and other IdP guides
- docs://m2m-auth — machine-to-machine auth, client credentials, API keys`;

/**
 * Builds a fully registered MCP server.
 *
 * Over HTTP the server is stateless, and an McpServer accepts only one transport at a time:
 * connecting a second request's transport while the first is still open throws "Already
 * connected to a transport". So the HTTP route builds one server per request (the MCP SDK's
 * stateless pattern) instead of sharing one instance across concurrent requests.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: config.serverName, version: config.serverVersion },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerTools(server);
  registerResources(server);
  return server;
}
