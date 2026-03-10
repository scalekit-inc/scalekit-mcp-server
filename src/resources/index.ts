import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDocsResources } from './docs.js';

export function registerResources(server: McpServer) {
  registerDocsResources(server);
}
