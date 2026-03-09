import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSkillResources } from './docs.js';

export function registerResources(server: McpServer) {
  registerSkillResources(server);
}
