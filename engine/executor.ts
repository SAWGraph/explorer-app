import type { AnalysisQuestion } from './types/query';
import type { SparqlRow } from './types/sparql';
import type { EndpointKey } from './constants/endpoints';
import type { PipelineStep, PipelineContext } from './planner';
import type { Scope } from './slicing';
import { executeSparql, type SparqlRunner } from './endpoint';
import { type Failure, type SparqlError, failureOf, splittingWouldHelp, stepEmptyMessage, stepFailedMessage } from './errors';
import { foundIris, sliceMerger } from './merge';
import { normalise } from './question';

export interface PartialFailure {
  step: string;
  // Slices the engine refused even at their smallest.
  failed: string[];
  // Slices never attempted because the step ran out of budget. These are not
  // "too large" — re-running continues from a warmer cache and usually gets
  // further, so the two must not be reported as the same thing.
  skipped: string[];
}

// One request as it was actually sent, kept so the exact SPARQL behind a map
// can be shown and copied. A step that was split appears once per slice.
export interface SentQuery {
  step: number;
  description: string;
  endpoint: EndpointKey;
  scope?: string;
  query: string;
  error?: string;
}

// How many entities each block matched, from the counts the run took before
// discovery. A block is missing when its count was dropped or not taken.
export interface SideCounts {
  A?: number;
  C?: number;
}

// What a run draws around the answer: county outlines and the river network
// between the two sides. Empty when not asked for (no region, a near question).
export interface Decoration {
  boundaries: SparqlRow[];
  streamLines: SparqlRow[];
}

// A run answers by block (plan decision 15): the rows the details step loaded
// for block A and for block C, whichever role (anchor or target) each played.
export interface PipelineSuccess {
  status: 'success';
  blockA: SparqlRow[];
  blockC: SparqlRow[];
  decoration: Decoration;
  // Set when some slices of the work failed but enough succeeded to show a map.
  partial?: PartialFailure[];
  queries?: SentQuery[];
  counts?: SideCounts;
}

export interface PipelineEmpty {
  status: 'empty';
  failedAtStep: number;
  message: string;
  queries?: SentQuery[];
  counts?: SideCounts;
  // Set when a count found a block with nothing in it, before any discovery.
  emptyBlock?: 'A' | 'C';
}

export interface PipelineError {
  status: 'error';
  failedAtStep: number;
  // A short log line for the scripts ("Error at step: ..."); no screen shows
  // it. The UI shows outcomeMessage and failureDetail (errors.ts).
  message: string;
  error: Error;
  // What failed, in parts (errors.ts Failure).
  failure: Failure;
  queries?: SentQuery[];
  counts?: SideCounts;
  // Set when the run had chunking on refusal off: it stopped at the first
  // failure, without retrying or splitting (errors.ts says so).
  chunkingOff?: true;
}

export type PipelineResult = PipelineSuccess | PipelineEmpty | PipelineError;

export interface StepProgress {
  stepIndex: number;
  totalSteps: number;
  description: string;
  status: 'running' | 'done' | 'failed' | 'skipped';
  resultCount?: number;
  // Present once a step has been split into slices, so the UI can show
  // "3 of 8 areas" instead of an unmoving spinner.
  chunksDone?: number;
  chunksTotal?: number;
}

// One limit: how long a single step may spend in total.
//
// Two earlier attempts were both worse. Budgeting elapsed time at 120s cut off
// runs that were succeeding — "wells near 4 miles" had 13 of 16 county slices
// working and was killed for being big. Budgeting only *wasted* time (90s of
// failed attempts) then broke the opposite case: Illinois downstream has 4
// slices where the first two fail slowly and the last two succeed, so it gave
// up before reaching the slices that had the answer.
//
// Every slice gets attempted; only the total is bounded. With a 60s cap per
// request (endpoint.ts) that admits up to ~5 slices of pure failure before
// stopping, which is enough for every shape measured in docs/QUERY-SWEEP.md.
const STEP_CEILING_MS = 300_000;

// Queries that have already failed as a whole in this session. Re-running the
// same question would otherwise pay the engine's full 30s timeout again before
// reaching the same conclusion. Kept per runner: a refusal is a fact about the
// endpoint that refused, and a test's fake must not inherit another's.
const knownTooLargeByRunner = new WeakMap<SparqlRunner, Set<string>>();

function knownTooLargeFor(sparql: SparqlRunner): Set<string> {
  let known = knownTooLargeByRunner.get(sparql);
  if (!known) {
    known = new Set<string>();
    knownTooLargeByRunner.set(sparql, known);
  }
  return known;
}

interface StepOutcome {
  rows: SparqlRow[];
  failedScopes: string[];
  skippedScopes: string[];
  lastError?: SparqlError | Error;
  // With chunking off: the first failure, at which the step stopped.
  stoppedAt?: SparqlError | Error;
  // An advisory step's failure: dropped, the run goes on without it.
  dropped?: SparqlError | Error;
}

// Runs one step, slicing it up if the engine refuses the whole thing.
//
// The engine kills any query at 30s and reports it as a 429 (see errors.ts).
// Rather than guessing a safe size up front, we try the whole query and only
// split what actually fails — most questions never split at all, and the ones
// that do split only as far as they need.
async function runStep(
  step: PipelineStep,
  context: PipelineContext,
  report: (chunksDone: number, chunksTotal: number) => void,
  record: (sent: Omit<SentQuery, 'step' | 'description' | 'endpoint'>) => void,
  signal: AbortSignal | undefined,
  sparql: SparqlRunner,
  chunkOnRefusal: boolean,
): Promise<StepOutcome> {
  const knownTooLarge = knownTooLargeFor(sparql);
  const startedAt = Date.now();
  const queue: (Scope | undefined)[] = step.initialScopes?.(context) ?? [undefined];
  const merged = sliceMerger();
  const failedScopes: string[] = [];
  const skippedScopes: string[] = [];
  let lastError: SparqlError | Error | undefined;
  let stoppedAt: SparqlError | Error | undefined;
  let dropped: SparqlError | Error | undefined;
  let done = 0;

  while (queue.length > 0) {
    signal?.throwIfAborted();
    const scope = queue.shift()!;

    // Out of budget. Record the rest as skipped (not failed) and keep what we
    // have: those slices were never refused, just never reached. With chunking
    // off there is no budget: every batch is sent, each with its own 60s.
    if (chunkOnRefusal && Date.now() - startedAt > STEP_CEILING_MS) {
      skippedScopes.push(
        ...[scope, ...queue].map((s, i) => s?.label ?? `remaining slice ${i + 1}`),
      );
      break;
    }

    const total = done + queue.length + 1;
    report(done, total);

    const query = step.buildQuery(context, scope);

    if (chunkOnRefusal && !scope && knownTooLarge.has(query) && step.divide) {
      const smaller = await step.divide(context, undefined, sparql);
      if (smaller?.length) {
        queue.unshift(...smaller);
        continue;
      }
    }

    // A step with its own limit stops waiting after it, whatever the run does.
    const limit = step.timeoutMs ? AbortSignal.timeout(step.timeoutMs) : undefined;
    const requestSignal = limit ? (signal ? AbortSignal.any([signal, limit]) : limit) : signal;
    try {
      const result = await sparql(step.endpoint, query, {
        cache: step.cache,
        signal: requestSignal,
        retry: chunkOnRefusal && !step.advisory,
      });
      record({ scope: scope?.label, query });
      merged.add(result);
      done++;
    } catch (err) {
      // A cancelled run is not a failed slice: stop, record nothing.
      signal?.throwIfAborted();
      const error = limit?.aborted
        ? new Error(`No answer within ${step.timeoutMs! / 1000}s`)
        : err instanceof Error
          ? err
          : new Error(String(err));
      lastError = error;
      record({ scope: scope?.label, query, error: error.message });
      // Advice, not answer: drop it and let the run go on, in either mode.
      if (step.advisory) {
        dropped = error;
        break;
      }
      // With chunking off the step stops at its first failure, whatever it is:
      // the run shows that error instead of a partial answer.
      if (!chunkOnRefusal) {
        stoppedAt = error;
        failedScopes.push(scope?.label ?? 'whole query');
        break;
      }
      const splittable = splittingWouldHelp(error);
      if (splittable && !scope) knownTooLarge.add(query);
      const smaller = splittable ? await step.divide?.(context, scope, sparql) : null;

      if (smaller?.length) {
        queue.unshift(...smaller);
        continue;
      }
      // Cannot divide further: keep whatever the other slices produced.
      failedScopes.push(scope?.label ?? 'whole query');
      done++;
    }
  }

  report(done, done);
  return { rows: merged.rows, failedScopes, skippedScopes, lastError, stoppedAt, dropped };
}

export interface ExecuteOptions {
  // Each step as it starts, splits and finishes.
  onProgress?: (progress: StepProgress) => void;
  // Cancels the run. It then rejects with the abort reason instead of
  // resolving, so a cancelled run never produces a result to show.
  signal?: AbortSignal;
  // Where every request goes. QLever over HTTP unless a caller (a test) swaps
  // in its own.
  endpoint?: SparqlRunner;
  // Work around what the endpoint refuses: retry a timeout once, split a query
  // that was too big, stop a step after 300s keeping what it has. Off: the run
  // answers completely or shows the first error, from any step. Request-size
  // batches stay on either way. Default on.
  chunkOnRefusal?: boolean;
}

// What one started step came back with: its outcome, or what it threw.
type Finished =
  | { index: number; ok: true; outcome: StepOutcome }
  | { index: number; ok: false; thrown: unknown };

export async function executePipeline(
  steps: PipelineStep[],
  question: AnalysisQuestion,
  options: ExecuteOptions = {},
): Promise<PipelineResult> {
  const { onProgress = () => {}, signal, endpoint: sparql = executeSparql, chunkOnRefusal = true } = options;
  const context: PipelineContext = {
    question,
    targetIris: [],
    anchorIris: [],
    results: {},
    counts: {},
  };
  const partial: PartialFailure[] = [];
  const queries: SentQuery[] = [];
  const counts: SideCounts = {};

  // Steps start as soon as what they wait for is done (`after`, planner.ts),
  // so decoration runs alongside the main steps. Once the run has its outcome
  // (an empty side, a failed step) the steps still running are stopped: their
  // rows would not be shown.
  const ended = new AbortController();
  const stepSignal = signal ? AbortSignal.any([signal, ended.signal]) : ended.signal;
  const planned = new Set(steps.map((step) => step.type));
  const done = new Set<PipelineStep['type']>();
  const waiting = new Set(steps.keys());
  const running = new Map<number, Promise<Finished>>();
  const progressBase = (i: number) => ({ stepIndex: i, totalSteps: steps.length, description: steps[i].description });
  // Where a failure happened, for errors.ts to word.
  const where = (i: number) => ({
    step: { index: i, total: steps.length, type: steps[i].type, description: steps[i].description },
    block: steps[i].block,
  });

  const start = (i: number) => {
    const step = steps[i];
    const base = progressBase(i);
    onProgress({ ...base, status: 'running' });
    const finished = runStep(
      step,
      context,
      // A step stopped when the run ended may still hear back from a request
      // already on its way; the run has returned, so neither is reported.
      (chunksDone, chunksTotal) => {
        if (chunksTotal > 1 && !ended.signal.aborted) {
          onProgress({ ...base, status: 'running', chunksDone, chunksTotal });
        }
      },
      (sent) => {
        if (!ended.signal.aborted) queries.push({ step: i, description: step.description, endpoint: step.endpoint, ...sent });
      },
      stepSignal,
      sparql,
      chunkOnRefusal,
    ).then(
      (outcome): Finished => ({ index: i, ok: true, outcome }),
      (thrown: unknown): Finished => ({ index: i, ok: false, thrown }),
    );
    running.set(i, finished);
  };

  // Every result leaves through here: it stops what is still running, and
  // lists the SPARQL in step order, not in the order the answers came back.
  const end = <R extends PipelineResult>(result: R): R => {
    ended.abort();
    for (const i of running.keys()) onProgress({ ...progressBase(i), status: 'skipped' });
    queries.sort((a, b) => a.step - b.step);
    return Object.keys(counts).length > 0 ? { ...result, counts } : result;
  };

  while (waiting.size > 0 || running.size > 0) {
    for (const i of waiting) {
      if (steps[i].after.every((type) => done.has(type) || !planned.has(type))) {
        waiting.delete(i);
        start(i);
      }
    }
    if (running.size === 0) {
      throw new Error(`Steps that wait for each other: ${[...waiting].map((i) => steps[i].type).join(', ')}`);
    }

    const finished = await Promise.race(running.values());
    running.delete(finished.index);
    const i = finished.index;
    const step = steps[i];
    const base = progressBase(i);

    if (!finished.ok) {
      // A cancelled run rejects with the cancel, whichever step saw it first.
      if (signal?.aborted) {
        ended.abort();
        throw signal.reason;
      }
      onProgress({ ...base, status: 'failed' });
      return end({
        status: 'error',
        failedAtStep: i,
        message: stepFailedMessage(step.description),
        error: finished.thrown instanceof Error ? finished.thrown : new Error(String(finished.thrown)),
        failure: failureOf(finished.thrown, where(i)),
        queries,
      });
    }
    const { outcome } = finished;

    // A dropped count: the run goes on as if it had not been taken.
    if (outcome.dropped) {
      onProgress({ ...base, status: 'skipped' });
      done.add(step.type);
      continue;
    }

    // With chunking off the run answers completely or shows the first error:
    // any failure, in any step (optional ones too), fails it.
    if (outcome.stoppedAt) {
      onProgress({ ...base, status: 'failed' });
      return end({
        status: 'error',
        failedAtStep: i,
        message: stepFailedMessage(step.description),
        error: outcome.stoppedAt,
        failure: failureOf(outcome.stoppedAt, { ...where(i), failed: outcome.failedScopes, skipped: outcome.skippedScopes }),
        queries,
        chunkingOff: true,
      });
    }

    // Nothing came back at all: this step has no answer to give.
    const missing = [...outcome.failedScopes, ...outcome.skippedScopes];
    if (missing.length > 0 && outcome.rows.length === 0 && !step.optional) {
      onProgress({ ...base, status: 'failed' });
      return end({
        status: 'error',
        failedAtStep: i,
        message: stepFailedMessage(step.description),
        error: outcome.lastError ?? new Error('Query failed'),
        failure: failureOf(outcome.lastError ?? new Error('Query failed'), { ...where(i), failed: outcome.failedScopes, skipped: outcome.skippedScopes }),
        queries,
      });
    }
    if (missing.length > 0) {
      partial.push({
        step: step.description,
        failed: outcome.failedScopes,
        skipped: outcome.skippedScopes,
      });
    }

    const results = outcome.rows;
    context.results[step.type] = results;

    // A count step reports the count, not its one row.
    let resultCount = results.length;
    if (step.counts) {
      const n = Number(results[0]?.count);
      if (results.length === 1 && Number.isInteger(n) && n >= 0) {
        context.counts = { ...context.counts, [step.counts.side]: n };
        counts[step.counts.block] = n;
        resultCount = n;
        // A side with nothing in it: the question has no answer, so say which
        // block matched nothing instead of running discovery to find out.
        if (n === 0) {
          onProgress({ ...base, status: 'done', resultCount: 0 });
          return end({
            status: 'empty',
            failedAtStep: i,
            message: stepEmptyMessage(step.description),
            queries,
            emptyBlock: step.counts.block,
          });
        }
      }
    }

    if (step.type === 'FIND_TARGET_IRIS') {
      context.targetIris = foundIris(results);

      if (context.targetIris.length === 0) {
        onProgress({ ...base, status: 'done', resultCount: 0 });
        return end({
          status: 'empty',
          failedAtStep: i,
          message: stepEmptyMessage(step.description),
          queries,
        });
      }
    }

    if (step.type === 'FIND_ANCHOR_IRIS') {
      context.anchorIris = foundIris(results);
    }

    onProgress({ ...base, status: 'done', resultCount });
    done.add(step.type);
  }

  // The details steps' rows by block: the target is block A for near and
  // downstream, block C for upstream (engine/question.ts).
  const target = context.results['HYDRATE_TARGET_BY_IRI'] ?? [];
  const anchor = context.results['HYDRATE_ANCHOR_BY_IRI'] ?? [];
  const targetIsA = normalise(question).targetIs === 'A';
  return end({
    status: 'success',
    blockA: targetIsA ? target : anchor,
    blockC: targetIsA ? anchor : target,
    decoration: {
      boundaries: context.results['GET_REGION_BOUNDARIES'] ?? [],
      streamLines: context.results['GET_FLOWLINE_GEOMETRIES'] ?? [],
    },
    ...(partial.length > 0 ? { partial } : {}),
    queries,
  });
}
