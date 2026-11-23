import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  apiErrorResult,
  apiJson,
  callerToken,
  describeError,
  getEnvironmentDomain,
  oauthRequired,
  textContent,
} from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import {
  AgentkitConnection,
  AgentkitConnectionResponse,
  AgentkitConnectionSummary,
  ListAgentkitConnectionsResponse,
} from '../types/index.js';
import { connectionIdSchema, environmentIdSchema } from '../validators/types.js';
import { TOOLS } from './index.js';

/**
 * Connections created through the MCP server are always per-user. ORG_WIDE shares one admin
 * credential across every end user, which is too broad to set up from an agent conversation,
 * so it is not offered here; the dashboard still supports it.
 */
export const MCP_CONNECTION_AUTH_MODE = 'USER';

const connectionNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and hyphens only')
  .describe('Name your code and virtual MCP servers use for this connection. Letters, numbers and hyphens; unique in the environment.');

export function registerAgentkitConnectionTools(server: McpServer) {
  TOOLS.create_agentkit_connection.registeredTool = createConnectionTool(server);
  TOOLS.update_agentkit_connection.registeredTool = updateConnectionTool(server);
  TOOLS.get_agentkit_connection.registeredTool = getConnectionTool(server);
  TOOLS.list_agentkit_connections.registeredTool = listConnectionsTool(server);
}

function formatConnection(conn: AgentkitConnection): string[] {
  const oauth = conn.oauth_config;
  const lines: (string | null)[] = [
    `id: ${conn.id}`,
    `connector: ${conn.provider}`,
    conn.type ? `type: ${conn.type}` : null,
    conn.auth_mode ? `auth_mode: ${conn.auth_mode}` : null,
    oauth?.use_scalekit_creds !== undefined ? `use_scalekit_creds: ${oauth.use_scalekit_creds}` : null,
    oauth?.client_id ? `client_id: ${oauth.client_id}` : null,
    // The API masks the secret; never print it, only whether one is stored.
    oauth?.client_secret ? 'client_secret: (set, hidden)' : null,
    oauth?.scopes ? `scopes: ${oauth.scopes.length ? oauth.scopes.join(', ') : '(none)'}` : null,
    oauth?.pkce_enabled !== undefined ? `pkce_enabled: ${oauth.pkce_enabled}` : null,
    oauth?.extra_authorize_params && Object.keys(oauth.extra_authorize_params).length
      ? `extra_authorize_params: ${JSON.stringify(oauth.extra_authorize_params)}`
      : null,
    oauth?.redirect_uri ? `redirect_uri: ${oauth.redirect_uri}` : null,
    conn.provider_configurations && Object.keys(conn.provider_configurations).length
      ? `provider_configurations: ${JSON.stringify(conn.provider_configurations)}`
      : null,
    conn.connection_mcp_url ? `connection_mcp_url: ${conn.connection_mcp_url}` : null,
    conn.create_time ? `created: ${conn.create_time}` : null,
    conn.update_time ? `updated: ${conn.update_time}` : null,
  ];
  return lines.filter((l): l is string => l !== null);
}

function formatSummary(c: AgentkitConnectionSummary): string {
  const parts = [
    `id: ${c.id}`,
    `name: ${c.connection_name ?? '(unnamed)'}`,
    `connector: ${c.provider}`,
    c.type ? `type: ${c.type}` : null,
    c.auth_mode ? `auth_mode: ${c.auth_mode}` : null,
    c.create_time ? `created: ${c.create_time}` : null,
  ];
  return `- ${parts.filter(Boolean).join(' | ')}`;
}

function createConnectionTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.create_agentkit_connection.name,
    TOOLS.create_agentkit_connection.description,
    {
      environmentId: environmentIdSchema,
      connector: z.string().min(1).max(255).describe('Connector ID from search_connectors, for example GMAIL.'),
      connectionName: connectionNameSchema.optional(),
      providerDomain: z
        .string()
        .min(1)
        .optional()
        .describe('Only for connectors whose server host depends on the account\'s region. Can only be set at creation.'),
    },
    TOOLS.create_agentkit_connection.annotations,
    async ({ environmentId, connector, connectionName, providerDomain }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const body: Record<string, unknown> = { provider: connector, auth_mode: MCP_CONNECTION_AUTH_MODE };
        if (connectionName) body.connection_name = connectionName;
        if (providerDomain) body.provider_configurations = { provider_domain: providerDomain };

        const data = await apiJson<AgentkitConnectionResponse>(token, environmentDomain, 'POST', ENDPOINTS.agentkitConnections.create, body);
        const conn = data.connection;
        logger.info(
          `create_agentkit_connection: created environmentId=${environmentId} connectionId=${conn.id} connector=${conn.provider} name=${conn.connection_name ?? ''} authMode=${MCP_CONNECTION_AUTH_MODE}`
        );
        return textContent([`Created connection ${conn.connection_name ?? conn.id}`, '', ...formatConnection(conn)].join('\n'));
      } catch (error) {
        logger.error(`create_agentkit_connection failed environmentId=${environmentId} connector=${connector}: ${describeError(error)}`);
        return apiErrorResult('create the connection', error);
      }
    }
  );
}

function updateConnectionTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.update_agentkit_connection.name,
    TOOLS.update_agentkit_connection.description,
    {
      environmentId: environmentIdSchema,
      connectionId: connectionIdSchema.describe('Connection ID (conn_...). The name is not accepted here; use get_agentkit_connection to find the ID.'),
      connectionName: connectionNameSchema.optional().describe('New name. Code that uses the old name must switch to the new one.'),
      scopes: z.array(z.string().min(1)).optional().describe('OAuth scopes. Replaces the stored list; send [] to clear it.'),
      clientId: z.string().min(1).optional().describe('Your own OAuth client ID.'),
      clientSecret: z.string().min(1).optional().describe('Your own OAuth client secret. Never returned.'),
      useScalekitCreds: z.boolean().optional().describe('Use Scalekit-managed OAuth credentials. Sending clientId or clientSecret turns this off unless it is also sent.'),
      pkceEnabled: z.boolean().optional().describe('Turn PKCE on or off for the authorization flow.'),
      extraAuthorizeParams: z
        .record(z.string(), z.string())
        .optional()
        .describe('Extra query parameters for the authorize URL. Replaces the stored map; send {} to clear it.'),
      providerConfigurations: z
        .record(z.string(), z.string())
        .optional()
        .describe('Connector-specific settings, for example {"slack_connection_type": "BOT"} or {"microsoft_tenant_id": "..."}. provider_domain cannot be changed.'),
    },
    TOOLS.update_agentkit_connection.annotations,
    async (args, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();
      const { environmentId, connectionId } = args;

      const oauthConfig: Record<string, unknown> = {};
      if (args.scopes !== undefined) oauthConfig.scopes = args.scopes;
      if (args.clientId !== undefined) oauthConfig.client_id = args.clientId;
      if (args.clientSecret !== undefined) oauthConfig.client_secret = args.clientSecret;
      if (args.useScalekitCreds !== undefined) oauthConfig.use_scalekit_creds = args.useScalekitCreds;
      if (args.pkceEnabled !== undefined) oauthConfig.pkce_enabled = args.pkceEnabled;
      if (args.extraAuthorizeParams !== undefined) oauthConfig.extra_authorize_params = args.extraAuthorizeParams;

      const body: Record<string, unknown> = {};
      if (Object.keys(oauthConfig).length) body.oauth_config = oauthConfig;
      if (args.providerConfigurations !== undefined) body.provider_configurations = args.providerConfigurations;
      if (args.connectionName !== undefined) body.connection_name = args.connectionName;

      // Field names only, never values: clientSecret must not reach logs or the reply.
      const changed = [
        ...Object.keys(oauthConfig),
        ...(body.provider_configurations ? ['provider_configurations'] : []),
        ...(body.connection_name ? ['connection_name'] : []),
      ];
      if (changed.length === 0) {
        return textContent('Nothing to update. Pass at least one setting to change.', { isError: true });
      }

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const data = await apiJson<AgentkitConnectionResponse>(
          token, environmentDomain, 'PATCH', ENDPOINTS.agentkitConnections.update(connectionId), body
        );
        const conn = data.connection;
        logger.info(`update_agentkit_connection: updated environmentId=${environmentId} connectionId=${connectionId} fields=${changed.join(',')}`);
        return textContent(
          [`Updated connection ${conn.connection_name ?? conn.id} (${conn.id})`, '', `changed: ${changed.join(', ')}`, ...formatConnection(conn)].join('\n')
        );
      } catch (error) {
        logger.error(`update_agentkit_connection failed environmentId=${environmentId} connectionId=${connectionId} fields=${changed.join(',')}: ${describeError(error)}`);
        return apiErrorResult('update the connection', error);
      }
    }
  );
}

function getConnectionTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.get_agentkit_connection.name,
    TOOLS.get_agentkit_connection.description,
    {
      environmentId: environmentIdSchema,
      connection: z.string().min(1).max(255).describe('Connection name or ID (conn_...).'),
    },
    TOOLS.get_agentkit_connection.annotations,
    async ({ environmentId, connection }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const data = await apiJson<AgentkitConnectionResponse>(token, environmentDomain, 'GET', ENDPOINTS.agentkitConnections.get(connection));
        const conn = data.connection;
        return textContent([`Connection ${conn.connection_name ?? conn.id}`, '', ...formatConnection(conn)].join('\n'));
      } catch (error) {
        logger.error(`get_agentkit_connection failed environmentId=${environmentId} connection=${connection}: ${describeError(error)}`);
        return apiErrorResult('read the connection', error);
      }
    }
  );
}

function listConnectionsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_agentkit_connections.name,
    TOOLS.list_agentkit_connections.description,
    {
      environmentId: environmentIdSchema,
      connector: z.string().min(1).max(255).optional().describe('Only connections of this connector, for example GMAIL.'),
      query: z.string().min(3, 'Query must be at least 3 characters').optional().describe('Matches connection name, connector ID or connector display name.'),
      pageSize: z.number().int().min(1).max(100).optional().default(20).describe('Connections per page. Default 20. Maximum 100.'),
      pageToken: z.string().optional().describe('Token from a previous reply, to get the next page.'),
    },
    TOOLS.list_agentkit_connections.annotations,
    async ({ environmentId, connector, query, pageSize, pageToken }, context) => {
      const token = callerToken(context);
      if (!token) return oauthRequired();

      try {
        const environmentDomain = await getEnvironmentDomain(token, environmentId);
        const params = new URLSearchParams({ page_size: String(pageSize) });
        if (connector) params.set('provider', connector);
        if (query) params.set('query', query);
        if (pageToken) params.set('page_token', pageToken);

        const data = await apiJson<ListAgentkitConnectionsResponse>(
          token, environmentDomain, 'GET', `${ENDPOINTS.agentkitConnections.list}?${params.toString()}`
        );
        const conns = data.connections ?? [];
        const filters = [connector ? `connector=${connector}` : null, query ? `query="${query}"` : null].filter(Boolean).join(', ');
        const pagination = data.next_page_token ? `\n\nNext page token: ${data.next_page_token}` : '';
        return textContent(
          `AgentKit connections${filters ? ` (${filters})` : ''} — ${data.total_size ?? conns.length} total\n\n${conns.map(formatSummary).join('\n') || '(no connections found)'}${pagination}`
        );
      } catch (error) {
        logger.error(`list_agentkit_connections failed environmentId=${environmentId}: ${describeError(error)}`);
        return apiErrorResult('list connections', error);
      }
    }
  );
}
