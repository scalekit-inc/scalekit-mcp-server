/** Page size the MCP server uses when it pages through a list on the caller's behalf. */
export const SERVER_PAGE_SIZE = 200;
/** Hard stop on pages per loop, so a bad or repeating page token cannot loop forever. */
export const MAX_PAGES = 20;
/** Time budget for a whole loop, so a tool call cannot hang on a slow backend. */
export const PAGING_TIMEOUT_MS = 10_000;

export class PagingError extends Error {
  constructor(
    message: string,
    readonly page: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PagingError';
  }
}

export interface Page<T> {
  items: T[];
  nextPageToken?: string;
}

export interface PagingResult<T> {
  items: T[];
  pages: number;
}

/**
 * Follows next-page tokens until the list ends, and returns every item. Pages are fetched one
 * after another because each request needs the previous page's token.
 *
 * Fails with PagingError, never a partial list, when a page fails, the backend repeats a token,
 * more than maxPages pages are needed, or the loop runs past timeoutMs: a silently short list
 * would mislead the agent into thinking a connector does not exist.
 */
export async function fetchAllPages<T>(
  fetchPage: (pageToken: string | undefined, signal: AbortSignal) => Promise<Page<T>>,
  opts: { maxPages?: number; timeoutMs?: number } = {}
): Promise<PagingResult<T>> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? PAGING_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const items: T[] = [];
  const seenTokens = new Set<string>();
  let token: string | undefined;
  let page = 0;
  try {
    while (true) {
      page++;
      if (page > maxPages) {
        throw new PagingError(`stopped after ${maxPages} pages without reaching the end of the list`, page);
      }
      let result: Page<T>;
      try {
        result = await fetchPage(token, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          throw new PagingError(`timed out after ${timeoutMs} ms`, page, error);
        }
        throw new PagingError(`page ${page} failed`, page, error);
      }
      items.push(...result.items);
      const next = result.nextPageToken || undefined;
      if (!next) return { items, pages: page };
      if (seenTokens.has(next)) {
        throw new PagingError(`the API returned page token "${next}" twice`, page);
      }
      seenTokens.add(next);
      token = next;
    }
  } finally {
    clearTimeout(timer);
  }
}
