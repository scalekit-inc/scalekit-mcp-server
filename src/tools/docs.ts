import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { fetchDocsWithCache } from '../resources/docs.js';
import { TOOLS } from './index.js';

const LLMS_INDEX_URL = 'https://docs.scalekit.com/llms.txt';
const FALLBACK_URL = 'https://docs.scalekit.com/llms-small.txt';
const MAX_RESULT_CHARS = 50000;

async function getDocUrls(): Promise<string[]> {
  const index = await fetchDocsWithCache(LLMS_INDEX_URL);
  const matches = index.match(/https?:\/\/[^\s]+\.txt/g) ?? [];
  return matches.filter(url => !url.includes('llms-full') && !url.includes('llms-small'));
}

function searchSections(query: string, text: string): { score: number; text: string }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const sections = text.split(/(?=\n#{1,3} )/);
  return sections
    .map(section => {
      const lower = section.toLowerCase();
      const score = terms.filter(t => lower.includes(t)).length;
      return { score, text: section };
    })
    .filter(s => s.score > 0);
}

export function registerDocsTools(server: McpServer) {
  TOOLS.search_docs.registeredTool = server.tool(
    TOOLS.search_docs.name,
    TOOLS.search_docs.description,
    { query: z.string().min(1) },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async ({ query }) => {
      try {
        const docUrls = await getDocUrls();
        const allTexts = await Promise.all(docUrls.map(url => fetchDocsWithCache(url)));

        const scored = allTexts
          .flatMap(text => searchSections(query, text))
          .sort((a, b) => b.score - a.score);

        let result = '';
        for (const { text } of scored) {
          if (result.length + text.length > MAX_RESULT_CHARS) break;
          result += text + '\n\n';
        }

        if (!result) {
          const fallback = await fetchDocsWithCache(FALLBACK_URL);
          result = fallback.slice(0, MAX_RESULT_CHARS);
        }

        return { content: [{ type: 'text' as const, text: result.trim() }] };
      } catch (err) {
        logger.error('Failed to fetch docs for search_docs', { error: err, query });
        return {
          content: [{ type: 'text' as const, text: `Failed to retrieve documentation: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
