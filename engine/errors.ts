import type { PipelineResult } from './executor';
import type { AnalysisQuestion, EntityBlock } from './types/query';

// Every failure the engine can meet, and the words it shows a user about one:
// a run that failed, found nothing, or answered only in part. The progress
// strip and the incomplete-results notice display what this file returns and
// write none of it themselves.
//
// One exception is left on purpose: the edit modal still puts its own "Error:"
// label before stepFailedMessage and shows the raw error text under it. Routing
// it through here changes what it says, so it moves with the structured
// failures (engine redesign, Phase 1).

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

// What to actually change when a question is too big. The levers are ordered by
// measured effect, and only ones that apply to *this* question are offered —
// telling someone to filter a block that already has three counties and a
// substance on it is worse than saying nothing.
//
// Measured on "facilities within 30 km upstream of PFOS samples in York,
// Washington and Waldo counties": York alone timed out at 30 km (429 after 64s)
// and returned 145 samples in 25s at 10 km. Note that adding a filter can turn a
// timeout into an *empty* result rather than a smaller one — it makes the query
// cheaper by asking for less — so distance comes first when there is one.
function adviceForOversizedQuestion(question?: AnalysisQuestion): string {
  if (!question) return 'Try a shorter distance, a smaller region, or one county at a time.';

  const { blockA, blockC, relationship } = question;
  const isTrace = relationship.type === 'downstream' || relationship.type === 'upstream';

  if (isTrace && relationship.maxDistanceKm) {
    return `Try a shorter distance than ${relationship.maxDistanceKm} km, or run those areas one at a time.`;
  }
  if (isTrace) {
    return 'Setting a maximum distance on the relationship is the most effective change. An unbounded trace follows the river network to the sea.';
  }

  const wide = !isNarrowed(blockC) ? 'second' : !isNarrowed(blockA) ? 'first' : null;
  if (wide) {
    return `The ${wide} block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.`;
  }
  return 'Try a smaller region, or run one county at a time.';
}

// A second definition of "this block narrows the question", kept for the advice
// only. It disagrees with the entity modules' isFiltered for samples: it counts
// the default `includeNondetects: true` tick as a filter. Unifying them changes
// the advice a user reads, so it is a Phase 1 fix (engine redesign plan).
function isNarrowed(block: EntityBlock): boolean {
  if (block.region?.stateCode || block.region?.countyCodes?.length) return true;
  const filters = [
    block.sampleFilters,
    block.facilityFilters,
    block.waterBodyFilters,
    block.wellFilters,
    block.aquiferFilters,
    block.streamFilters,
  ];
  return filters.some((f) => f && Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : v != null)));
}

function userMessageFor(error: unknown, question?: AnalysisQuestion): string {
  const kind = error instanceof SparqlError ? error.kind : 'unknown';
  switch (kind) {
    case 'timeout':
    case 'out-of-memory':
      return `This question covers too much data for the knowledge graph to answer at once. ${adviceForOversizedQuestion(question)}`;
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

// What a run carries in `message` when it stops at a step. The edit modal shows
// it after an "Error:" label when Apply fails, and the scripts (health-check)
// log it. The progress strip shows outcomeMessage instead.
export function stepFailedMessage(stepDescription: string): string {
  return `Error at step: ${stepDescription}`;
}

export function stepEmptyMessage(stepDescription: string): string {
  return `No results at step: ${stepDescription}`;
}

// The one line shown when a run did not answer: why it failed and what to try,
// or that nothing matched. Null for a run that answered.
export function outcomeMessage(result: PipelineResult | null | undefined, question?: AnalysisQuestion): string | null {
  if (result?.status === 'empty') return 'No results found for this query. Try adjusting the filters.';
  if (result?.status === 'error') return userMessageFor(result.error, question);
  return null;
}

// Shown when some slices of a split query failed but the rest returned data.
// Silently showing an incomplete map would be worse than saying so. Null when
// the answer is complete.
//
// Failed and skipped slices get different advice: a failed slice will fail
// again unless the question is narrowed, while a skipped one simply ran out of
// budget and usually completes on a second run against a warmer cache.
export function partialNotice(result: PipelineResult | null | undefined, question?: AnalysisQuestion): string | null {
  if (result?.status !== 'success' || !result.partial?.length) return null;
  const failed = result.partial.flatMap((p) => p.failed);
  const skipped = result.partial.flatMap((p) => p.skipped);

  const reasons = [
    failed.length > 0 ? `${nameList(failed)} could not be answered` : null,
    skipped.length > 0 ? `${nameList(skipped)} not attempted before the time limit` : null,
  ].filter((r): r is string => r !== null);

  return [
    `Showing incomplete results: ${reasons.join(', ')}.`,
    skipped.length > 0 ? 'Running the question again picks up where this left off.' : null,
    failed.length > 0 ? adviceForOversizedQuestion(question) : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
}

// Slice labels are county names ("York County, Maine") or entity batches
// ("facilities batch 3"). Three is enough to be actionable; a list of twelve
// counties is a wall of text nobody reads.
function nameList(labels: string[]): string {
  if (labels.length > 3) return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
  return labels.join(', ');
}
