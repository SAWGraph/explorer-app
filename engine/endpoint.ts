import { ENDPOINTS, type EndpointKey } from './constants/endpoints';
import type { SparqlResultSet, SparqlRow } from './types/sparql';
import {
  SparqlError,
  classifySparqlFailure,
  extractSparqlDetail,
  isRetryable,
} from './errors';

// The engine's own limit is 30s, so a request still open well past that is not
// working — it is stalled behind an overloaded endpoint. Without this the client
// waits forever: the query sweep recorded single requests hanging for 959s and
// 1,918s, which also defeats the per-step budget (that is checked between
// slices, not during one).
const REQUEST_TIMEOUT_MS = 60_000;

export interface SparqlOptions {
  // Cache the result for the lifetime of the page. Only for queries whose answer
  // cannot change within a session — region boundaries, entity-set probes.
  cache?: boolean;
  // Aborts the request when the user cancels the run. A cancelled request
  // rejects with the abort reason, never as a SparqlError, so the executor
  // cannot mistake it for a query to split or a slice that failed.
  signal?: AbortSignal;
  // Send the query once more after a timeout or a busy error (default true).
  // A run with chunking off passes false, so the first error is what it sees.
  retry?: boolean;
}

// What the engine sends every request through. `executeSparql` (QLever over
// HTTP) is the production one; a test passes its own, so the whole run,
// splitting and probes included, works without a network.
export type SparqlRunner = (
  endpoint: EndpointKey,
  query: string,
  options?: SparqlOptions,
) => Promise<SparqlRow[]>;

// One request as the endpoint saw it. The query sweep records these to write
// one CSV row per request (engine/scripts/query-sweep.mts).
export interface RequestRecord {
  endpoint: EndpointKey;
  query: string;
  // Size of the query sent, which is what a request-size refusal (413) is about.
  requestBytes: number;
  ms: number;
  rows: number;
  // 200 when it answered; the HTTP status of a refusal; 0 when nothing came back.
  status: number;
  // 'ok', or the classified kind of the failure (timeout, out-of-memory, ...).
  kind: string;
  message: string;
  // Asked for a cached response (probes, boundaries): may not have reached the server.
  cached: boolean;
}

// Wraps a runner so every request it sends is reported. The run itself is
// unchanged: rows and errors pass straight through.
export function recordingEndpoint(inner: SparqlRunner, onRequest: (record: RequestRecord) => void): SparqlRunner {
  return async (endpoint, query, options = {}) => {
    const base = { endpoint, query, requestBytes: new TextEncoder().encode(query).length, cached: Boolean(options.cache) };
    const startedAt = Date.now();
    try {
      const rows = await inner(endpoint, query, options);
      onRequest({ ...base, ms: Date.now() - startedAt, rows: rows.length, status: 200, kind: 'ok', message: '' });
      return rows;
    } catch (err) {
      const sparql = err instanceof SparqlError ? err : undefined;
      onRequest({
        ...base,
        ms: Date.now() - startedAt,
        rows: 0,
        status: sparql?.status ?? 0,
        kind: sparql?.kind ?? (err instanceof Error && err.name === 'AbortError' ? 'cancelled' : 'unknown'),
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

// ponytail: a plain Map, not an LRU. Entries are per-session and few (one per
// distinct cacheable query); nothing here justifies eviction logic yet.
const responseCache = new Map<string, SparqlRow[]>();

export async function executeSparql(
  endpoint: EndpointKey,
  query: string,
  options: SparqlOptions = {},
): Promise<SparqlRow[]> {
  const cacheKey = `${endpoint}::${query}`;
  if (options.cache) {
    const hit = responseCache.get(cacheKey);
    if (hit) return hit;
  }

  // Starting the count at the last attempt leaves no retry.
  const rows = await requestWithRetry(endpoint, query, options.retry === false ? 1 : 0, options.signal);
  if (options.cache) responseCache.set(cacheKey, rows);
  return rows;
}

async function requestWithRetry(
  endpoint: EndpointKey,
  query: string,
  attempt: number,
  cancel: AbortSignal | undefined,
): Promise<SparqlRow[]> {
  let response: Response;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(ENDPOINTS[endpoint], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: query,
      signal: cancel ? AbortSignal.any([cancel, abort.signal]) : abort.signal,
    });
  } catch (err) {
    cancel?.throwIfAborted();
    // Report a stall as a timeout, not a network fault: it means the same thing
    // (too much work) and, unlike a network fault, it tells the executor that
    // splitting the query is worth trying. No retry — a stalled endpoint will
    // just stall again.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SparqlError('timeout', 0, `No response within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new SparqlError('network', 0, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    cancel?.throwIfAborted();
    const kind = classifySparqlFailure(response.status, text);
    // The engine caches the sub-results a failed attempt computed, so one retry
    // starts warm — measured 26.5s cold vs 1.5s warm on the same query.
    if (isRetryable(kind) && attempt < 1) {
      return requestWithRetry(endpoint, query, attempt + 1, cancel);
    }
    throw new SparqlError(kind, response.status, extractSparqlDetail(text));
  }

  // A 200 can still carry a truncated body when the response is very large
  // (observed at ~4MB and ~12MB under load), so parse defensively.
  const text = await response.text();
  let json: SparqlResultSet;
  try {
    json = JSON.parse(text) as SparqlResultSet;
  } catch {
    throw new SparqlError(
      'network',
      response.status,
      `Truncated or invalid response (${text.length} bytes)`,
    );
  }
  return transformSparqlResults(json);
}

function transformSparqlResults(json: SparqlResultSet): SparqlRow[] {
  return json.results.bindings.map((binding) => {
    const row: SparqlRow = {};
    for (const key of Object.keys(binding)) {
      row[key] = binding[key].value;
    }
    return row;
  });
}
