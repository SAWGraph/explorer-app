import type { AnalysisQuestion } from '../types/query';
import type { SparqlRow } from '../types/sparql';
import type { PipelineStep, PipelineContext } from './planner';
import type { Scope } from './scope';
import { executeSparql } from './sparqlClient';
import { SparqlError, isSplittable } from './sparqlErrors';

export interface PartialFailure {
  step: string;
  // Slices the engine refused even at their smallest.
  failed: string[];
  // Slices never attempted because the step ran out of budget. These are not
  // "too large" — re-running continues from a warmer cache and usually gets
  // further, so the two must not be reported as the same thing.
  skipped: string[];
}

export interface PipelineSuccess {
  status: 'success';
  data: Record<string, SparqlRow[]>;
  // Set when some slices of the work failed but enough succeeded to show a map.
  partial?: PartialFailure[];
}

export interface PipelineEmpty {
  status: 'empty';
  failedAtStep: number;
  message: string;
}

export interface PipelineError {
  status: 'error';
  failedAtStep: number;
  message: string;
  error: Error;
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
// request (sparqlClient) that admits up to ~5 slices of pure failure before
// stopping, which is enough for every shape measured in docs/QUERY-MATRIX.md.
const STEP_CEILING_MS = 300_000;

// Queries that have already failed as a whole in this session. Re-running the
// same question would otherwise pay the engine's full 30s timeout again before
// reaching the same conclusion.
const knownTooLarge = new Set<string>();

interface StepOutcome {
  rows: SparqlRow[];
  failedScopes: string[];
  skippedScopes: string[];
  lastError?: SparqlError | Error;
}

// Runs one step, slicing it up if the engine refuses the whole thing.
//
// The engine kills any query at 30s and reports it as a 429 (see sparqlErrors).
// Rather than guessing a safe size up front, we try the whole query and only
// split what actually fails — most questions never split at all, and the ones
// that do split only as far as they need.
async function runStep(
  step: PipelineStep,
  context: PipelineContext,
  report: (chunksDone: number, chunksTotal: number) => void,
): Promise<StepOutcome> {
  const startedAt = Date.now();
  const queue: (Scope | undefined)[] = step.initialScopes?.(context) ?? [undefined];
  const rows: SparqlRow[] = [];
  const seen = new Set<string>();
  const failedScopes: string[] = [];
  const skippedScopes: string[] = [];
  let lastError: SparqlError | Error | undefined;
  let done = 0;

  while (queue.length > 0) {
    const scope = queue.shift()!;

    // Out of budget. Record the rest as skipped (not failed) and keep what we
    // have — those slices were never refused, just never reached.
    if (Date.now() - startedAt > STEP_CEILING_MS) {
      skippedScopes.push(
        ...[scope, ...queue].map((s, i) => s?.label ?? `remaining slice ${i + 1}`),
      );
      break;
    }

    const total = done + queue.length + 1;
    report(done, total);

    const query = step.buildQuery(context, scope);

    if (!scope && knownTooLarge.has(query) && step.divide) {
      const smaller = await step.divide(context, undefined);
      if (smaller?.length) {
        queue.unshift(...smaller);
        continue;
      }
    }

    try {
      const result = await executeSparql(step.endpoint, query, { cache: step.cache });
      // Slices can overlap — the same river reach is reached from several
      // anchors — so merge as a set. Whole-row identity is the right key: for
      // aggregate rows the GROUP BY key never spans slices (chunking always
      // follows that key), so identical rows are genuine duplicates.
      for (const row of result) {
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      done++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      const splittable = error instanceof SparqlError && isSplittable(error.kind);
      if (splittable && !scope) knownTooLarge.add(query);
      const smaller = splittable ? await step.divide?.(context, scope) : null;

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
  return { rows, failedScopes, skippedScopes, lastError };
}

export async function executePipeline(
  steps: PipelineStep[],
  question: AnalysisQuestion,
  onProgress: (progress: StepProgress) => void,
): Promise<PipelineResult> {
  const context: PipelineContext = {
    question,
    targetIris: [],
    anchorIris: [],
    results: {},
  };
  const partial: PartialFailure[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const base = { stepIndex: i, totalSteps: steps.length, description: step.description };
    onProgress({ ...base, status: 'running' });

    let outcome: StepOutcome;
    try {
      outcome = await runStep(step, context, (chunksDone, chunksTotal) => {
        if (chunksTotal > 1) {
          onProgress({ ...base, status: 'running', chunksDone, chunksTotal });
        }
      });
    } catch (err) {
      onProgress({ ...base, status: 'failed' });
      return {
        status: 'error',
        failedAtStep: i,
        message: `Error at step: ${step.description}`,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }

    // Nothing came back at all: this step has no answer to give.
    const missing = [...outcome.failedScopes, ...outcome.skippedScopes];
    if (missing.length > 0 && outcome.rows.length === 0 && !step.optional) {
      onProgress({ ...base, status: 'failed' });
      return {
        status: 'error',
        failedAtStep: i,
        message: `Error at step: ${step.description}`,
        error: outcome.lastError ?? new Error('Query failed'),
      };
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

    if (step.type === 'FIND_TARGET_IRIS') {
      const iris = new Set<string>();
      for (const r of results) if (r.iri) iris.add(r.iri);
      context.targetIris = [...iris];

      if (context.targetIris.length === 0) {
        onProgress({ ...base, status: 'done', resultCount: 0 });
        return {
          status: 'empty',
          failedAtStep: i,
          message: `No results at step: ${step.description}`,
        };
      }
    }

    if (step.type === 'FIND_ANCHOR_IRIS') {
      const iris = new Set<string>();
      for (const r of results) if (r.iri) iris.add(r.iri);
      context.anchorIris = [...iris];
    }

    // Hydrate results are aliased into the legacy keys that useMapLayers
    // (src/hooks/useMapLayers.ts:38-42) consumes unchanged.
    if (step.type === 'HYDRATE_TARGET_BY_IRI') {
      context.results['FIND_TARGET_ENTITIES'] = results;
    }
    if (step.type === 'HYDRATE_ANCHOR_BY_IRI') {
      context.results['GET_ANCHOR_DETAILS'] = results;
    }

    onProgress({ ...base, status: 'done', resultCount: results.length });
  }

  return {
    status: 'success',
    data: context.results,
    ...(partial.length > 0 ? { partial } : {}),
  };
}
