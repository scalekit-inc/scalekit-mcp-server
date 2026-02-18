import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, Environment } from '../types/index.js';
import { validateUrls } from '../validators/types.js';
import { TOOLS } from './index.js';

type Client = {
  id: string;
  name?: string;
  redirect_uris?: string[];
  post_login_uris?: string[];
  post_logout_redirect_uris?: string[];
  back_channel_logout_uris?: string[];
  initiate_login_uri?: string | null;
};

type GetClientResponse = {
  client: Client;
};

type ListClientsResponse = {
  total_size?: number;
  clients: Client[];
  next_page_token?: string;
  prev_page_token?: string;
};

export function registerClientTools(server: McpServer) {
  TOOLS.register_redirect_uri.registeredTool = registerRedirectUriTool(server);
  TOOLS.list_clients.registeredTool = listClientsTool(server);
}

function listClientsTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.list_clients.name,
    TOOLS.list_clients.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      pageToken: z.string().optional().default(''),
    },
    async ({ environmentId, pageToken }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      try {
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        const pageSize = 30;
        const params = new URLSearchParams({
          page_size: String(pageSize),
          page_token: String(pageToken ?? ''),
        });

        const res = await fetch(`${ENDPOINTS.clients.list}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });

        if (!res.ok) {
          const errorText = await res.text();
          logger.error(`Failed to list clients: ${res.status} ${errorText}`);
          return { content: [{ type: 'text', text: 'Failed to list clients.' }] };
        }

        const data = (await res.json()) as ListClientsResponse;
        const lines = (data.clients || []).map((c, idx) => {
          const redirectUris = (c.redirect_uris ?? []).join(', ') || 'N/A';
          const postLoginUris = (c.post_login_uris ?? []).join(', ') || 'N/A';
          const initiateLoginUri = c.initiate_login_uri ?? 'N/A';
          return [
            `#${idx + 1}`,
            `Name: ${c.name ?? 'N/A'}`,
            `ID: ${c.id}`,
            `post_login_uris: ${postLoginUris}`,
            `redirect_uris: ${redirectUris}`,
            `initiate_login_uri: ${initiateLoginUri}`,
          ].join(', ');
        });

        const nextPageTokenText = data.next_page_token ? `\n\nNext Page Token: ${data.next_page_token}` : '';

        return {
          content: [
            {
              type: 'text',
              text: lines.length ? `Clients:\n${lines.join('\n\n')}${nextPageTokenText}` : 'No clients found.',
            },
          ],
        };
      } catch (error) {
        logger.error(`Failed to list clients`, error);
        return { content: [{ type: 'text', text: 'Failed to list clients. Please try again later.' }] };
      }
    }
  );
}

function registerRedirectUriTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.register_redirect_uri.name,
    TOOLS.register_redirect_uri.description,
    {
      environmentId: z.string().regex(/^env_\w+$/, 'Environment ID must start with env_'),
      clientId: z.string().min(1, 'Client ID is required'),
      // If provided, this is sent as the PATCH payload directly (useful when you reverse-engineer the exact UI request body).
      // Example: {"redirect_uris":["https://example.com/callback"],"initiate_login_uri":"https://example.com/login"}
      clientPatchJson: z.string().optional(),
      // Opinionated mode for common redirect settings:
      redirectUri: z.string().optional(),
      redirectUris: z.array(z.string()).optional(),
      type: z.enum(['ALLOWED_CALLBACK', 'INITIATE_LOGIN']).optional().default('ALLOWED_CALLBACK'),
      mode: z.enum(['ADD', 'REPLACE', 'REMOVE']).optional().default('ADD'),
    },
    async ({ environmentId, clientId, clientPatchJson, redirectUri, redirectUris, type, mode }, context) => {
      const authInfo = context.authInfo as AuthInfo;
      const token = authInfo?.token;

      if (!clientPatchJson && !redirectUri && (!redirectUris || redirectUris.length === 0)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Provide either clientPatchJson (raw PATCH body) or redirectUri (opinionated mode).',
            },
          ],
        };
      }

      const urlsToValidate = [
        ...(redirectUri ? [redirectUri] : []),
        ...(redirectUris ?? []),
      ];
      if (urlsToValidate.length > 0) {
        const urlValidation = validateUrls(urlsToValidate);
        if (urlValidation !== null) {
          return {
            content: [{ type: 'text', text: urlValidation }],
          };
        }
      }

      try {
        // Get environment details to obtain the x-env-domain header value
        const envRes = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const envData = (await envRes.json()) as { environment: Environment };
        const environmentDomain = envData.environment.domain;

        // Fetch current client details (so we can append safely)
        const clientRes = await fetch(`${ENDPOINTS.clients.getById(clientId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
        });

        if (!clientRes.ok) {
          const errorText = await clientRes.text();
          logger.error(`Failed to fetch client: ${clientRes.status} ${errorText}`);
          return {
            content: [{ type: 'text', text: `Failed to fetch client "${clientId}".` }],
          };
        }

        const clientData = (await clientRes.json()) as GetClientResponse;
        const client = clientData.client;

        let patchPayload: Record<string, unknown> = {};

        if (clientPatchJson) {
          try {
            const parsed = JSON.parse(clientPatchJson);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              patchPayload = parsed as Record<string, unknown>;
            } else {
              return {
                content: [{ type: 'text', text: 'clientPatchJson must be a JSON object.' }],
              };
            }
          } catch {
            return {
              content: [{ type: 'text', text: 'clientPatchJson must be valid JSON.' }],
            };
          }
        } else if (redirectUri || (redirectUris && redirectUris.length > 0)) {
          if (type === 'INITIATE_LOGIN') {
            if (redirectUris && redirectUris.length > 0) {
              return {
                content: [{ type: 'text', text: 'For type=INITIATE_LOGIN, provide a single redirectUri (not redirectUris).' }],
              };
            }
            patchPayload.initiate_login_uri = redirectUri ?? '';
          } else {
            // Mirror dashboard UI behavior: patch post_login_uris, and keep redirect_uris in sync.
            const existingPostLogin = Array.isArray(client.post_login_uris) ? client.post_login_uris : [];
            const addList = redirectUris && redirectUris.length > 0 ? redirectUris : redirectUri ? [redirectUri] : [];

            let next: string[] = [];
            if (mode === 'REPLACE') {
              next = addList;
            } else if (mode === 'REMOVE') {
              const removeSet = new Set(addList);
              next = existingPostLogin.filter((u) => !removeSet.has(u));
            } else {
              next = Array.from(new Set([...existingPostLogin, ...addList]));
            }

            patchPayload.post_login_uris = next;
          }
        }

        const updateRes = await fetch(`${ENDPOINTS.clients.updateById(clientId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-env-domain': environmentDomain || '',
          },
          body: JSON.stringify(patchPayload),
        });

        if (!updateRes.ok) {
          const errorText = await updateRes.text();
          logger.error(`Failed to update client redirect URIs: ${updateRes.status} ${errorText}`);
          return {
            content: [{ type: 'text', text: `Failed to update redirect URIs for client "${clientId}".` }],
          };
        }

        const updated = (await updateRes.json()) as GetClientResponse;
        const updatedClient = updated.client;

        const summary = clientPatchJson
          ? `redirect_uris: ${(updatedClient.redirect_uris ?? []).join(', ') || 'N/A'}\ninitiate_login_uri: ${updatedClient.initiate_login_uri ?? 'N/A'}`
          : type === 'INITIATE_LOGIN'
            ? `initiate_login_uri: ${updatedClient.initiate_login_uri ?? 'N/A'}`
            : `post_login_uris: ${(updatedClient.post_login_uris ?? []).join(', ') || 'N/A'}\nredirect_uris: ${(updatedClient.redirect_uris ?? []).join(', ') || 'N/A'}`;

        return {
          content: [
            {
              type: 'text',
              text: `Redirect URI updated successfully for client "${clientId}".\n${summary}`,
            },
          ],
        };
      } catch (error) {
        logger.error(`Failed to register redirect uri`, error);
        return {
          content: [
            {
              type: 'text',
              text: 'Failed to register redirect uri. Please try again later.',
            },
          ],
        };
      }
    }
  );
}
