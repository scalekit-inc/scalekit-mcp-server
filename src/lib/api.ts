import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
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
export function textContent(text: string, opts?: { isError?: boolean }) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(opts?.isError && { isError: true }),
  };
}

/** Caller OAuth token from the MCP request context, if any. */
export function callerToken(context: { authInfo?: unknown }): string | undefined {
  return (context.authInfo as { token?: string } | undefined)?.token;
}

/** Response when an admin tool is called without an OAuth token. */
export function oauthRequired() {
  return textContent('This tool requires OAuth. Sign in and retry.');
}

/** A non-2xx response from the Scalekit API, carrying the status and the API's own error message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly apiMessage: string,
    readonly url: string
  ) {
    super(`Scalekit API ${status} for ${url}: ${apiMessage}`);
    this.name = 'ApiError';
  }

  /** 4xx errors carry a message the caller can act on (bad input, duplicate name, not found). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/**
 * Calls an environment-scoped Scalekit API and returns the parsed JSON body.
 * Throws ApiError on a non-2xx response, with the API's `message` when the body has one.
 */
export async function apiJson<T>(
  token: string,
  environmentDomain: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: envHeaders(token, environmentDomain, body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(res.status, message, url.split('?')[0]);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Error result for a failed Scalekit API call. 4xx errors pass the API message through so the
 * agent can fix its input; anything else asks for a retry without exposing internals.
 */
export function apiErrorResult(action: string, error: unknown) {
  if (error instanceof ApiError && error.isClientError) {
    return textContent(`Failed to ${action}: ${error.apiMessage} (HTTP ${error.status}).`, { isError: true });
  }
  return textContent(`Failed to ${action}. Retry the call.`, { isError: true });
}

/** Formats an error for log lines (the logger prints only the message string). */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Short, stable identifier for the signed-in caller: the first 16 hex characters of
 * SHA-256(sub) from the caller's OAuth token. Used as the connected-account identifier for
 * session tokens, so a caller can only ever mint for themselves. Returns undefined when the
 * token has no `sub` claim. The token itself is validated by the auth middleware before any
 * tool runs, so decoding without verifying here is safe.
 */
export function callerIdentifier(token: string): string | undefined {
  const decoded = jwt.decode(token);
  const sub = decoded && typeof decoded === 'object' ? decoded.sub : undefined;
  if (!sub) return undefined;
  return createHash('sha256').update(sub).digest('hex').slice(0, 16);
}
