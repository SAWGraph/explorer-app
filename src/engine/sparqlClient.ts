import { ENDPOINTS, type EndpointKey } from '../constants/endpoints';
import type { SparqlResultSet, SparqlRow } from '../types/sparql';
import {
  SparqlError,
  classifySparqlFailure,
  extractSparqlDetail,
  isRetryable,
} from './sparqlErrors';

export interface SparqlOptions {
  // Cache the result for the lifetime of the page. Only for queries whose answer
  // cannot change within a session — region boundaries, entity-set probes.
  cache?: boolean;
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

  const rows = await requestWithRetry(endpoint, query, 0);
  if (options.cache) responseCache.set(cacheKey, rows);
  return rows;
}

async function requestWithRetry(
  endpoint: EndpointKey,
  query: string,
  attempt: number,
): Promise<SparqlRow[]> {
  let response: Response;
  try {
    response = await fetch(ENDPOINTS[endpoint], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: query,
    });
  } catch (err) {
    throw new SparqlError('network', 0, err instanceof Error ? err.message : String(err));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const kind = classifySparqlFailure(response.status, text);
    // The engine caches the sub-results a failed attempt computed, so one retry
    // starts warm — measured 26.5s cold vs 1.5s warm on the same query.
    if (isRetryable(kind) && attempt < 1) {
      return requestWithRetry(endpoint, query, attempt + 1);
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
