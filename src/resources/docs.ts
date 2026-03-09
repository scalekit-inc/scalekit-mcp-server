import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const SKILLS_ROOT = path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'skills');

const docsCache: Map<string, { content: string; ts: number }> = new Map();

export async function fetchDocsWithCache(url: string): Promise<string> {
  const cached = docsCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.content;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch docs from ${url}: ${res.status} ${res.statusText}`);
  }
  const content = await res.text();
  docsCache.set(url, { content, ts: Date.now() });
  return content;
}

const SKILL_PLUGINS = [
  { name: 'skills-agent-auth',      uri: 'skills://agent-auth',      plugin: 'agent-auth',      description: 'AI agent authentication: OAuth flows, token storage, connectors (Gmail, Slack, Notion, Calendar)' },
  { name: 'skills-full-stack-auth', uri: 'skills://full-stack-auth', plugin: 'full-stack-auth', description: 'Full-stack user authentication: sign-up, login, logout, sessions, RBAC, admin portal' },
  { name: 'skills-mcp-auth',        uri: 'skills://mcp-auth',        plugin: 'mcp-auth',        description: 'MCP server authentication: OAuth 2.1, Dynamic Client Registration, Express/FastAPI/FastMCP' },
  { name: 'skills-modular-scim',    uri: 'skills://modular-scim',    plugin: 'modular-scim',    description: 'SCIM directory sync: user provisioning/deprovisioning, admin portal' },
  { name: 'skills-modular-sso',     uri: 'skills://modular-sso',     plugin: 'modular-sso',     description: 'Enterprise SSO: SAML, OIDC, admin portal integration' },
] as const;

async function readPluginSkills(plugin: string): Promise<string> {
  const skillsDir = path.join(SKILLS_ROOT, plugin);
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      parts.push(content);
    } catch {
      // skip missing files
    }
  }
  return parts.join('\n\n---\n\n');
}

export function registerSkillResources(server: McpServer) {
  for (const skill of SKILL_PLUGINS) {
    server.resource(
      skill.name,
      skill.uri,
      { description: skill.description, mimeType: 'text/plain' },
      async (uri) => {
        try {
          const text = await readPluginSkills(skill.plugin);
          return { contents: [{ uri: uri.href, text, mimeType: 'text/plain' }] };
        } catch (err) {
          logger.error(`Failed to read skill resource ${skill.uri}`, { error: err });
          return {
            contents: [{ uri: uri.href, text: `Failed to load skills: ${err instanceof Error ? err.message : String(err)}`, mimeType: 'text/plain' }],
          };
        }
      }
    );
  }
}
