import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEnvironmentTools } from './environments.js';
import { registerOrganizationTools } from './organizations.js';

const toolsList = {
  list_environments: {
    name: 'list_environments',
    description: 'List all available environments',
  },
  set_environment: {
    name: 'set_environment',
    description: 'Set environment by ID (e.g. env_123)',
  },
  get_current_environment: {
    name: 'get_current_environment',
    description: 'Get the current environment',
  },
  create_organization: {
    name: 'create_organization',
    description: 'Create a new organization under the selected environment',
  },
} as const;

export type ToolKey = keyof typeof toolsList;

export type ToolDefinition = {
  name: ToolKey;
  description: string;
  registeredTool?: RegisteredTool;
};

export const TOOLS: { [K in ToolKey]: ToolDefinition & { name: K } } = Object.fromEntries(
  Object.entries(toolsList).map(([key, val]) => [
    key,
    { ...val, name: key } as ToolDefinition & { name: typeof key },
  ])
) as any;

export function registerTools(server: McpServer) {
    registerEnvironmentTools(server)
    registerOrganizationTools(server)
}