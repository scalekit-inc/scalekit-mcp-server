import fetch from 'node-fetch';
import { ENDPOINTS } from '../types/endpoints.js';
import { Environment } from '../types/index.js';

/**
 * Fetches the environment by ID and returns its domain. Used by tools that need
 * the x-env-domain header for API calls.
 */
export async function getEnvironmentDomain(
  token: string,
  environmentId: string
): Promise<string> {
  const res = await fetch(`${ENDPOINTS.environments.getById(environmentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { environment: Environment };
  return data.environment.domain ?? '';
}

/**
 * Builds headers for environment-scoped API calls, including Authorization and x-env-domain.
 * Pass any additional headers in the optional `extra` object.
 */
export function envHeaders(
  token: string,
  environmentDomain: string | undefined,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'x-env-domain': environmentDomain || '',
    ...extra,
  };
}

/** Builds the standard MCP text content response. */
export function textContent(text: string): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text }] };
}
