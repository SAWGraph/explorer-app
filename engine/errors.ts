import type { PipelineError, PipelineResult, SideCounts } from './executor';
import type { AnalysisQuestion, EntityBlock } from './types/query';
import { normalise } from './question';
import { entityFor } from './entities';

// Every failure the engine can meet, and the words it shows a user about one:
// a run that failed, found nothing, or answered only in part. The progress
// strip and the incomplete-results notice display what this file returns and
// write none of it themselves.
//
// A failed run carries its failure in parts (Failure: code, step, block,
// slices, status, raw text). The edit modal shows outcomeMessage, then
// failureDetail, then the raw text; the progress strip shows outcomeMessage.

// QLever reports several very different problems through a small set of HTTP
// statuses, and the most important one is actively misleading: a query that
// exceeds the engine's 30s limit comes back as 429 "Too Many Requests" with the
// real cause only in the JSON body. Classifying here keeps that knowledge in one
// place — the executor uses it to decide whether splitting the work would help,
// and the UI uses it to tell the user something more useful than "went wrong".
//
// See docs/QUERY-SWEEP.md Part 4 for the full catalogue with measurements.
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
//
// When the run counted both sides, the advice gives the counts and names the
// bigger block, which is the one to narrow on a near question.
function adviceForOversizedQuestion(question?: AnalysisQuestion, counts?: SideCounts): string {
  if (!question) return 'Try a shorter distance, a smaller region, or one county at a time.';

  const { blockA, blockC, relationship } = question;
  const isTrace = normalise(question).kind === 'trace';
  const both = counts?.A !== undefined && counts?.C !== undefined ? { A: counts.A, C: counts.C } : null;
  const sizes = both
    ? `The first block matches ${both.A.toLocaleString('en-US')} ${entityFor(blockA.type).label}, the second ${both.C.toLocaleString('en-US')} ${entityFor(blockC.type).label}. `
    : '';

  if (isTrace && relationship.maxDistanceKm) {
    return `${sizes}Try a shorter distance than ${relationship.maxDistanceKm} km, or run those areas one at a time.`;
  }
  if (isTrace) {
    return `${sizes}Setting a maximum distance on the relationship is the most effective change. An unbounded trace follows the river network to the sea.`;
  }
  if (both) {
    return `${sizes}Adding a filter or region to the ${both.C >= both.A ? 'second' : 'first'} block is the most effective change.`;
  }

  const wide = !isNarrowed(blockC) ? 'second' : !isNarrowed(blockA) ? 'first' : null;
  if (wide) {
    return `The ${wide} block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.`;
  }
  return 'Try a smaller region, or run one county at a time.';
}

// Whether a block narrows the question at all: a region, or a filter its entity
// module counts (the default non-detect tick on samples is not one). The same
// test the engine ranks sides by (engine/sides.ts).
function isNarrowed(block: EntityBlock): boolean {
  if (block.region?.stateCode || block.region?.countyCodes?.length) return true;
  return entityFor(block.type).isFiltered(block);
}

// Worded from the failure's code, not from the error object it came from: a
// result rebuilt from its parts (or a test's) carries the code alone.
function userMessageFor(kind: SparqlErrorKind, question?: AnalysisQuestion, counts?: SideCounts): string {
  switch (kind) {
    case 'timeout':
    case 'out-of-memory':
      return `This question covers too much data for the knowledge graph to answer at once. ${adviceForOversizedQuestion(question, counts)}`;
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

// What a failed run carries, in parts: the UI shows them and words nothing
// itself. `code` keeps the classifier's names (the query-sweep CSVs compare on
// them). `step` and `block` are missing for a failure outside the steps.
export interface Failure {
  code: SparqlErrorKind;
  step?: { index: number; total: number; type: string; description: string };
  // The block the step was working on; none for decoration (boundaries,
  // stream lines).
  block?: 'A' | 'C';
  // The slices of the step that failed, and those never reached.
  slices: { failed: string[]; skipped: string[] };
  // The HTTP status, when the endpoint answered with one.
  status?: number;
  // What the server said, or the error's own message.
  raw: string;
}

export function failureOf(
  error: unknown,
  where: { step?: Failure['step']; block?: 'A' | 'C'; failed?: string[]; skipped?: string[] } = {},
): Failure {
  const sparql = error instanceof SparqlError ? error : null;
  return {
    code: sparql?.kind ?? 'unknown',
    ...(where.step ? { step: where.step } : {}),
    ...(where.block ? { block: where.block } : {}),
    slices: { failed: where.failed ?? [], skipped: where.skipped ?? [] },
    ...(sparql && sparql.status > 0 ? { status: sparql.status } : {}),
    raw: sparql ? sparql.detail : error instanceof Error ? error.message : String(error),
  };
}

// A run that threw outside its steps (a bug, the cache client): no step, code
// unknown, the generic sentence.
export function unexpectedFailure(err: unknown): PipelineError {
  const error = err instanceof Error ? err : new Error(String(err));
  return { status: 'error', failedAtStep: -1, message: error.message, error, failure: failureOf(error) };
}

// One line under a failure's headline: where it failed and how.
// "Step 4 of 7, loading details for samples (block A): timeout (HTTP 429)".
export function failureDetail(result: PipelineResult | null | undefined): string | null {
  if (result?.status !== 'error') return null;
  const { step, block, code, status, slices } = result.failure;
  const where = step
    ? `Step ${step.index + 1} of ${step.total}, ${step.description.charAt(0).toLowerCase()}${step.description.slice(1)}${block ? ` (block ${block})` : ''}: `
    : '';
  const http = status ? ` (HTTP ${status})` : '';
  // A step that was never split failed as "whole query": the step says it.
  const named = slices.failed.filter((label) => label !== 'whole query');
  const sliceNote = named.length > 0 ? `. Not answered: ${nameList(named)}` : '';
  return `${where}${code}${http}${sliceNote}`;
}

// The button on a failed run's error strip that runs the question again,
// fresh. With chunking off it is the only retry the run gets.
export const RUN_AGAIN_LABEL = 'Run again';

// Whether a run that did not answer is worth running again as it is. A failure
// often is (a busy or slow server); a run that found nothing finds nothing
// again until the question changes.
export function canRunAgain(result: PipelineResult | null | undefined): boolean {
  return result?.status === 'error';
}

// A refusal that splitting the query into smaller ones could have rescued: too
// much work, too much memory, or too big a request. The executor splits these
// (unless told not to); the messages below say when it was told not to.
export function splittingWouldHelp(error: unknown): boolean {
  return error instanceof SparqlError && isSplittable(error.kind);
}

// A failure chunking on would have retried (timeout, busy) or split (timeout,
// out of memory, too large). A network error is neither.
function chunkingWouldHaveTried(kind: SparqlErrorKind): boolean {
  return isSplittable(kind) || isRetryable(kind);
}

const CHUNKING_OFF = `Chunking is turned off for this run, so the question was not retried or split into smaller queries. Use ${RUN_AGAIN_LABEL} to try it once more.`;

// The one line shown when a run did not answer: why it failed and what to try,
// or that nothing matched. Null for a run that answered.
export function outcomeMessage(result: PipelineResult | null | undefined, question?: AnalysisQuestion): string | null {
  if (result?.status === 'empty') {
    // A count found a block with nothing in it: name it, since that block is
    // the one to change.
    if (result.emptyBlock && question) {
      const block = result.emptyBlock === 'A' ? question.blockA : question.blockC;
      const which = result.emptyBlock === 'A' ? 'first' : 'second';
      return `No ${entityFor(block.type).label} match the ${which} block, so the question has no answer. Try a wider region or fewer filters.`;
    }
    return 'No results found for this query. Try adjusting the filters.';
  }
  if (result?.status === 'error') {
    const message = userMessageFor(result.failure.code, question, result.counts);
    // The run was told not to retry or split, so say what it did not try:
    // otherwise the advice reads as though it had. Only after a failure that
    // chunking on would have retried or split.
    return result.chunkingOff && chunkingWouldHaveTried(result.failure.code) ? `${message} ${CHUNKING_OFF}` : message;
  }
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
    failed.length > 0 ? adviceForOversizedQuestion(question, result.counts) : null,
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
