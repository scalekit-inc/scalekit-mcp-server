import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callerIdentifier } from '../src/lib/api.js';
import { fetchAllPages, PagingError } from '../src/lib/paging.js';
import { queryWords, toolMatches } from '../src/tools/tool-search.js';
import { callerTokenWith } from './helpers.js';

describe('fetchAllPages', () => {
  it('follows tokens until the list ends and keeps order', async () => {
    const pages: Record<string, { items: number[]; nextPageToken?: string }> = {
      first: { items: [1, 2], nextPageToken: 'b' },
      b: { items: [3, 4], nextPageToken: 'c' },
      c: { items: [5] },
    };
    const seen: (string | undefined)[] = [];
    const result = await fetchAllPages<number>(async (token) => {
      seen.push(token);
      return pages[token ?? 'first'];
    });
    assert.deepEqual(result.items, [1, 2, 3, 4, 5]);
    assert.equal(result.pages, 3);
    assert.deepEqual(seen, [undefined, 'b', 'c']);
  });

  it('treats an empty next token as the end of the list', async () => {
    const result = await fetchAllPages<number>(async () => ({ items: [1], nextPageToken: '' }));
    assert.deepEqual(result.items, [1]);
  });

  it('fails instead of looping when the backend repeats a token', async () => {
    await assert.rejects(
      fetchAllPages<number>(async () => ({ items: [1], nextPageToken: 'same' })),
      (e: unknown) => e instanceof PagingError && /twice/.test(e.message)
    );
  });

  it('stops at the page limit', async () => {
    let n = 0;
    await assert.rejects(
      fetchAllPages<number>(async () => ({ items: [n], nextPageToken: `t${++n}` }), { maxPages: 3 }),
      (e: unknown) => e instanceof PagingError && e.page === 4 && /3 pages/.test(e.message)
    );
    assert.equal(n, 3);
  });

  it('reports which page failed and returns no partial list', async () => {
    await assert.rejects(
      fetchAllPages<number>(async (token) => {
        if (token === 'b') throw new Error('backend 500');
        return { items: [1], nextPageToken: 'b' };
      }),
      (e: unknown) => e instanceof PagingError && e.page === 2 && (e.cause as Error).message === 'backend 500'
    );
  });

  it('times out a slow loop', async () => {
    await assert.rejects(
      fetchAllPages<number>(
        (_token, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
        { timeoutMs: 50 }
      ),
      (e: unknown) => e instanceof PagingError && /timed out/.test(e.message)
    );
  });
});

describe('callerIdentifier', () => {
  it('is a stable 16-character hex hash of sub', () => {
    const a = callerIdentifier(callerTokenWith({ sub: 'usr_123' }));
    const b = callerIdentifier(callerTokenWith({ sub: 'usr_123', email: 'x@y.z' }));
    assert.match(a!, /^[0-9a-f]{16}$/);
    assert.equal(a, b, 'only sub feeds the hash');
  });

  it('differs between users', () => {
    assert.notEqual(callerIdentifier(callerTokenWith({ sub: 'usr_1' })), callerIdentifier(callerTokenWith({ sub: 'usr_2' })));
  });

  it('does not contain the raw sub', () => {
    const id = callerIdentifier(callerTokenWith({ sub: 'usr_123' }))!;
    assert.ok(!id.includes('usr_123'));
  });

  it('is undefined without a sub claim or for a non-JWT token', () => {
    assert.equal(callerIdentifier(callerTokenWith({ email: 'a@b.c' })), undefined);
    assert.equal(callerIdentifier('not-a-jwt'), undefined);
    assert.equal(callerIdentifier(''), undefined);
  });
});

describe('toolMatches', () => {
  const tool = (name: string, description = '') => ({ id: name, provider: 'GMAIL', definition: { name, description } });

  it('matches every word across name and description, ignoring case and underscores', () => {
    assert.ok(toolMatches(tool('gmail_send_email', 'Send an email'), queryWords('Send Email')));
    assert.ok(toolMatches(tool('gmail_send_email'), queryWords('send_email')));
    assert.ok(!toolMatches(tool('gmail_list_labels', 'List labels'), queryWords('send email')));
  });

  it('matches everything for an empty query', () => {
    assert.ok(toolMatches(tool('anything'), []));
  });

  it('handles tools without a definition', () => {
    assert.ok(!toolMatches({ id: 'x', provider: 'GMAIL', definition: undefined as any }, queryWords('send')));
  });
});
