// The one retry in endpoint.ts: a timeout or a busy error is sent once more,
// because the second try often starts warm (26.5s cold, 1.5s warm on the same
// query). With chunking off the run asks for no retry, and the first error is
// what the user sees.
//
// No network: fetch is stubbed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeSparql } from '../endpoint';
import { SparqlError } from '../errors';

const timedOut = () => new Response('{"exception":"Operation timed out"}', { status: 429 });
const answered = () =>
  new Response(JSON.stringify({ head: { vars: ['iri'] }, results: { bindings: [{ iri: { type: 'uri', value: 'http://ex.org/1' } }] } }), { status: 200 });

const stubFetch = (...responses: (() => Response)[]) => {
  const fetch = vi.fn(async () => responses.shift()!());
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe('the retry after a timeout', () => {
  it('sends the query once more by default, and returns the second answer', async () => {
    const fetch = stubFetch(timedOut, answered);
    await expect(executeSparql('federation', 'SELECT 1')).resolves.toEqual([{ iri: 'http://ex.org/1' }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('is skipped when the run asks for no retry, and the timeout is thrown', async () => {
    const fetch = stubFetch(timedOut, answered);
    const error = await executeSparql('federation', 'SELECT 1', { retry: false }).catch((e) => e);
    expect(error).toBeInstanceOf(SparqlError);
    expect((error as SparqlError).kind).toBe('timeout');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
