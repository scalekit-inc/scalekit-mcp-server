import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  apiErrorResult,
  apiJson,
  callerIdentifier,
  callerToken,
  describeError,
  getEnvironmentDomain,
  oauthRequired,
  textContent,
} from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  CreateMcpSessionTokenResponse,
  ListMcpConfigsResponse,
  McpConfig,
  McpConfigResponse,
} from '../types/index.js';
import { environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

/** Session tokens minted through the MCP server always last 6 hours. */
export const SESSION_TOKEN_EXPIRY_SECONDS = 6 * 60 * 60;

const virtualMcpServerIdSchema = z
  .string()
  .regex(/^cfg_\w+$/, 'Virtual MCP server ID must start with cfg_')
  .describe('Virtual MCP server ID (cfg_...).');

const connectionsSchema = z
  .array(
    z.object({
      connectionName: z.string().min(1).max(255).describe('AgentKit connection name, from list_agentkit_connections.'),
      tools: z
        .array(z.string().min(1))
        .optional()
        .describe('Action names from search_tools. Leave out to include every action of this connection.'),
    })
  )
  .min(1, 'Pass at least one connection.');

const toolExposureSchema = z
  .enum(['DIRECT', 'META'])
  .describe('DIRECT: every selected action is its own MCP tool, up to 25 connections. META: five discovery tools, no connection limit.');

export function registerVirtualMcpTools(server: McpServer) {
  TOOLS.create_virtual_mcp_server.registeredTool = createTool(server);
  TOOLS.get_virtual_mcp_server.registeredTool = getTool(server);
  TOOLS.list_virtual_mcp_servers.registeredTool = listTool(server);
  TOOLS.update_virtual_mcp_server.registeredTool = updateTool(server);
  TOOLS.delete_virtual_mcp_server.registeredTool = deleteTool(server);
  TOOLS.create_mcp_session_token.registeredTool = createSessionTokenTool(server);
}

function toMappings(connections: { connectionName: string; tools?: string[] }[]) {
  return connections.map((c) => ({ connection_name: c.connectionName, tools: c.tools ?? [] }));
}

function formatMappings(config: McpConfig, withIds: boolean): string[] {
  const mappings = config.connection_tool_mappings ?? [];
  if (!mappings.length) return ['connections: (none)'];
  return [
    'connections:',
    ...mappings.map((m) => {
      const meta = [m.provider, withIds ? m.connection_id : undefined].filter(Boolean).join(', ');
      const tools = m.tools?.length ? m.tools.join(', ') : 'all actions';
      return `  - ${m.connection_name}${meta ? ` (${meta})` : ''}: ${tools}`;
    }),
  ];
}

function formatConfig(config: McpConfig, withIds: boolean): string[] {
  return [
    `id: ${config.id}`,
    config.description ? `description: ${config.description}` : null,
    config.mcp_server_url ? `mcp_server_url: ${config.mcp_server_url}` : null,
    `tool_exposure: ${config.tool_exposure ?? 'DIRECT'}`,
    ...formatMappings(config, withIds),
  ].filter((l): l is string => l !== null);
}

function createTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_virtual_mcp_server.name,
    TOOLS.create_virtual_mcp_server.description,
    {
      environmentId: environmentIdSchema,
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, digits, hyphens and underscores only')
        .describe('Lowercase letters, digits, hyphens and underscores. Cannot be changed later.'),
      description: z.string().max(1000).optional().describe('What the server is for.'),
      connections: connectionsSchema.describe('Connections to include. Leave tools out of an item to include every action of that connection.'),
      toolExposure: toolExposureSchema.optional().default('DIRECT'),
    },
    TOOLS.create_virtual_mcp_server.annotations,
    async ({ environmentId, name, description, connections, toolExposure }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const body: Record<string, unknown> = {
          name,
          connection_tool_mappings: toMappings(connections),
          tool_exposure: toolExposure,
        };
        if (description) body.description = description;
        const data = await apiJson<McpConfigResponse>(token, environmentDomain, 'POST', ENDPOINTS.virtualMcpServers.create, body);
        const config = data.config;
        logger.info(
          `create_virtual_mcp_server: created environmentId=${environmentId} configId=${config.id} name=${config.name} connections=${connections.length} toolExposure=${toolExposure}`
        );
        return textContent([`Created virtual MCP server ${config.name}`, '', ...formatConfig(config, false)].join('\n'));
      } catch (error) {
        logger.error(`create_virtual_mcp_server failed environmentId=${environmentId} name=${name}: ${describeError(error)}`);
        return apiErrorResult('create the virtual MCP server', error);
      }
    }
  );
}

function getTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_virtual_mcp_server.name,
    TOOLS.get_virtual_mcp_server.description,
    {
      environmentId: environmentIdSchema,
      virtualMcpServerId: virtualMcpServerIdSchema,
    },
    TOOLS.get_virtual_mcp_server.annotations,
    async ({ environmentId, virtualMcpServerId }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const data = await apiJson<McpConfigResponse>(token, environmentDomain, 'GET', ENDPOINTS.virtualMcpServers.byId(virtualMcpServerId));
        return textContent([`Virtual MCP server ${data.config.name}`, '', ...formatConfig(data.config, true)].join('\n'));
      } catch (error) {
        logger.error(`get_virtual_mcp_server failed environmentId=${environmentId} configId=${virtualMcpServerId}: ${describeError(error)}`);
        return apiErrorResult('read the virtual MCP server', error);
      }
    }
  );
}

function listTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_virtual_mcp_servers.name,
    TOOLS.list_virtual_mcp_servers.description,
    {
      environmentId: environmentIdSchema,
      search: z.string().min(3, 'Search must be at least 3 characters').optional().describe('Matches servers whose name contains this text.'),
      name: z.string().min(1).max(100).optional().describe('Exact name, case-insensitive.'),
      connector: z.string().min(1).max(255).optional().describe('Only servers that include a connection of this connector, for example GMAIL.'),
      pageSize: z.number().int().min(1).max(30).optional().default(20).describe('Servers per page. Default 20. Maximum 30.'),
      pageToken: z.string().optional().describe('Token from a previous reply, to get the next page.'),
    },
    TOOLS.list_virtual_mcp_servers.annotations,
    async ({ environmentId, search, name, connector, pageSize, pageToken }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const params = new URLSearchParams({ page_size: String(pageSize) });
        if (search) params.set('search', search);
        if (name) params.set('filter.name', name);
        if (connector) params.set('filter.provider', connector);
        if (pageToken) params.set('page_token', pageToken);

        const data = await apiJson<ListMcpConfigsResponse>(
          token, environmentDomain, 'GET', `${ENDPOINTS.virtualMcpServers.list}?${params.toString()}`
        );
        const configs = data.configs ?? [];
        const rows = configs.map((c) => {
          const conns = (c.connection_tool_mappings ?? []).map((m) => m.connection_name).join(', ') || '(none)';
          return `- id: ${c.id} | name: ${c.name} | tool_exposure: ${c.tool_exposure ?? 'DIRECT'} | connections: ${conns}${c.mcp_server_url ? ` | mcp_server_url: ${c.mcp_server_url}` : ''}`;
        });
        const filters = [search ? `search="${search}"` : null, name ? `name=${name}` : null, connector ? `connector=${connector}` : null]
          .filter(Boolean)
          .join(', ');
        const pagination = data.next_page_token ? `\n\nNext page token: ${data.next_page_token}` : '';
        return textContent(
          `Virtual MCP servers${filters ? ` (${filters})` : ''} — ${data.total_size ?? configs.length} total\n\n${rows.join('\n') || '(no virtual MCP servers found)'}${pagination}`
        );
      } catch (error) {
        logger.error(`list_virtual_mcp_servers failed environmentId=${environmentId}: ${describeError(error)}`);
        return apiErrorResult('list virtual MCP servers', error);
      }
    }
  );
}

function updateTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.update_virtual_mcp_server.name,
    TOOLS.update_virtual_mcp_server.description,
    {
      environmentId: environmentIdSchema,
      virtualMcpServerId: virtualMcpServerIdSchema,
      description: z.string().min(1).max(1000).optional().describe('New description.'),
      connections: connectionsSchema.optional().describe('Replaces the server\'s whole connection list. Leave out to keep the current connections.'),
      toolExposure: toolExposureSchema.optional().describe('Leave out to keep the current mode.'),
    },
    TOOLS.update_virtual_mcp_server.annotations,
    async ({ environmentId, virtualMcpServerId, description, connections, toolExposure }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      // The backend keeps a field's stored value when it is empty or left out.
      const body: Record<string, unknown> = {};
      if (description !== undefined) body.description = description;
      if (connections !== undefined) body.connection_tool_mappings = toMappings(connections);
      if (toolExposure !== undefined) body.tool_exposure = toolExposure;
      const changed = Object.keys(body);
      if (changed.length === 0) {
        return textContent('Nothing to update. Pass description, connections or toolExposure.', { isError: true });
      }

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const data = await apiJson<McpConfigResponse>(token, environmentDomain, 'PUT', ENDPOINTS.virtualMcpServers.byId(virtualMcpServerId), body);
        const config = data.config;
        logger.info(`update_virtual_mcp_server: updated environmentId=${environmentId} configId=${virtualMcpServerId} fields=${changed.join(',')}`);
        const lines = [
          `Updated virtual MCP server ${config.name} (${config.id})`,
          '',
          `changed: ${changed.join(', ')}`,
          ...formatConfig(config, false),
        ];
        if (connections !== undefined || toolExposure !== undefined) {
          lines.push('', 'MCP clients connected to this server must list tools again.');
        }
        return textContent(lines.join('\n'));
      } catch (error) {
        logger.error(`update_virtual_mcp_server failed environmentId=${environmentId} configId=${virtualMcpServerId}: ${describeError(error)}`);
        return apiErrorResult('update the virtual MCP server', error);
      }
    }
  );
}

function deleteTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.delete_virtual_mcp_server.name,
    TOOLS.delete_virtual_mcp_server.description,
    {
      environmentId: environmentIdSchema,
      virtualMcpServerId: virtualMcpServerIdSchema,
    },
    TOOLS.delete_virtual_mcp_server.annotations,
    async ({ environmentId, virtualMcpServerId }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        await apiJson<unknown>(token, environmentDomain, 'DELETE', ENDPOINTS.virtualMcpServers.byId(virtualMcpServerId));
        logger.info(`delete_virtual_mcp_server: deleted environmentId=${environmentId} configId=${virtualMcpServerId}`);
        return textContent(
          `Deleted virtual MCP server ${virtualMcpServerId}.\nIts MCP URL no longer works. Connections and connected accounts were not changed.`
        );
      } catch (error) {
        logger.error(`delete_virtual_mcp_server failed environmentId=${environmentId} configId=${virtualMcpServerId}: ${describeError(error)}`);
        return apiErrorResult('delete the virtual MCP server', error);
      }
    }
  );
}

function createSessionTokenTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_mcp_session_token.name,
    TOOLS.create_mcp_session_token.description,
    {
      environmentId: environmentIdSchema,
      virtualMcpServerId: virtualMcpServerIdSchema,
      accessLevel: z.enum(['FULL', 'READ_ONLY']).optional().default('FULL').describe('Access level written into the token. Default FULL.'),
    },
    TOOLS.create_mcp_session_token.annotations,
    async ({ environmentId, virtualMcpServerId, accessLevel }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      // The identifier always comes from the caller's own token, never from tool input, so a
      // caller can only mint for themselves.
      const identifier = callerIdentifier(token);
      if (!identifier) {
        logger.error(`create_mcp_session_token: caller token has no sub claim environmentId=${environmentId} configId=${virtualMcpServerId}`);
        return textContent('Could not read your user ID from your sign-in token. Sign in again and retry.', { isError: true });
      }

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        // Read the server first: confirms it exists in this environment and gives the URL to return.
        const { config } = await apiJson<McpConfigResponse>(token, environmentDomain, 'GET', ENDPOINTS.virtualMcpServers.byId(virtualMcpServerId));
        const minted = await apiJson<CreateMcpSessionTokenResponse>(
          token, environmentDomain, 'POST', ENDPOINTS.virtualMcpServers.createSessionToken(virtualMcpServerId),
          { identifier, expiry: `${SESSION_TOKEN_EXPIRY_SECONDS}s`, access_level: accessLevel }
        );
        // Never log the token itself.
        logger.info(
          `create_mcp_session_token: minted environmentId=${environmentId} configId=${virtualMcpServerId} identifier=${identifier} accessLevel=${accessLevel} expiresAt=${minted.expires_at}`
        );
        return textContent(
          [
            `Session token for you (identifier ${identifier}) on ${config.name}`,
            '',
            `token: ${minted.token}`,
            `expires_at: ${minted.expires_at} (6 hours)`,
            `access_level: ${accessLevel}`,
            config.mcp_server_url ? `mcp_server_url: ${config.mcp_server_url}` : null,
            '',
            'Send it as "Authorization: Bearer <token>" to the MCP URL. It works only on this server. Treat it as a secret.',
          ]
            .filter((l) => l !== null)
            .join('\n')
        );
      } catch (error) {
        logger.error(`create_mcp_session_token failed environmentId=${environmentId} configId=${virtualMcpServerId} identifier=${identifier}: ${describeError(error)}`);
        return apiErrorResult('create the session token', error);
      }
    }
  );
}
