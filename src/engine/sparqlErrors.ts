// QLever reports several very different problems through a small set of HTTP
// statuses, and the most important one is actively misleading: a query that
// exceeds the engine's 30s limit comes back as 429 "Too Many Requests" with the
// real cause only in the JSON body. Classifying here keeps that knowledge in one
// place — the executor uses it to decide whether splitting the work would help,
// and the UI uses it to tell the user something more useful than "went wrong".
//
// See docs/QUERY-MATRIX.md Part 4 for the full catalogue with measurements.
export type SparqlErrorKind =
  | 'timeout' // 429 + "Operation timed out" / "Sort operation was canceled"
  | 'out-of-memory' // 500 + "Tried to allocate X, but only Y were available"
  | 'payload-too-large' // 413/502 — our request body was too big
  | 'sibling-failure' // 500 + "Waited for a result from another thread"
  | 'network' // fetch rejected, response unparseable
  | 'unknown';

export class SparqlError extends Error {
  readonly kind: SparqlErrorKind;
  readonly status: number;
  readonly detail: string;

  constructor(kind: SparqlErrorKind, status: number, detail: string) {
    super(`SPARQL ${kind} (${status}): ${detail.slice(0, 200)}`);
    this.name = 'SparqlError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

export function classifySparqlFailure(status: number, body: string): SparqlErrorKind {
  let detail = body;
  try {
    detail = (JSON.parse(body) as { exception?: string }).exception ?? body;
  } catch {
    // Non-JSON error body (gateway HTML, truncated response) — match on raw text.
  }
  if (status === 413 || status === 502) return 'payload-too-large';
  if (/Tried to allocate/.test(detail)) return 'out-of-memory';
  if (/Operation timed out|Sort operation was canceled/.test(detail)) return 'timeout';
  if (/Waited for a result from another thread/.test(detail)) return 'sibling-failure';
  return 'unknown';
}

export function extractSparqlDetail(body: string): string {
  try {
    return (JSON.parse(body) as { exception?: string }).exception ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

// True when the same query over a smaller slice of the data has a real chance of
// succeeding. Every one of these is a "too much work in one request" failure.
export function isSplittable(kind: SparqlErrorKind): boolean {
  return kind === 'timeout' || kind === 'out-of-memory' || kind === 'payload-too-large';
}

// True when simply asking again may work — the engine caches partial results, so
// a retry after a timeout starts warm.
export function isRetryable(kind: SparqlErrorKind): boolean {
  return kind === 'timeout' || kind === 'sibling-failure';
}

export function userMessageFor(error: unknown): string {
  const kind = error instanceof SparqlError ? error.kind : 'unknown';
  switch (kind) {
    case 'timeout':
    case 'out-of-memory':
      // Point at the second block specifically. Measured: narrowing the first
      // block to a single county does not help at all (still 500 OOM at 2.6GB)
      // because the work is driven by the unconstrained second block — with no
      // filter it means every facility in the graph, 1.5 million of them.
      return 'This question covers too much data for the knowledge graph to answer at once. The usual cause is that the second block has no filter or region set, which means "every one in the country". Adding an industry, type, or region there is the most effective change; a shorter distance also helps.';
    case 'payload-too-large':
      return 'This question produced too much data to send in one request. Try narrowing the area or adding a filter.';
    case 'sibling-failure':
      return 'The knowledge graph was busy and dropped this request. Running it again usually works.';
    case 'network':
      return 'Could not reach the knowledge graph. Check your connection and try again.';
    default:
      return 'Something went wrong. You can edit the question and try again.';
  }
}
