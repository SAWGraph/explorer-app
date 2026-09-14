import type { AnalysisQuestion } from '../types/query';
import type { SparqlRow } from '../types/sparql';
import type { PipelineStep, PipelineContext } from './planner';
import type { Scope } from './scope';
import { executeSparql } from './sparqlClient';
import { SparqlError, isSplittable } from './sparqlErrors';

export interface PartialFailure {
  step: string;
  scopes: string[];
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

// Splitting a very large question can produce dozens of slices, each taking
// seconds — "facilities downstream of facilities in Maine" divides into 16
// counties and still cannot finish. Past this point a user is better served by
// a partial map (or a clear "too large" message) than by an open-ended spinner.
//
// Budgeted per step rather than per pipeline: a question whose every step makes
// steady progress should be allowed to finish — Illinois downstream questions
// legitimately take ~3.5 minutes across all steps — while a single step that
// cannot get anywhere is cut off quickly.
const STEP_BUDGET_MS = 120_000;

// Queries that have already failed as a whole in this session. Re-running the
// same question would otherwise pay the engine's full 30s timeout again before
// reaching the same conclusion.
const knownTooLarge = new Set<string>();

interface StepOutcome {
  rows: SparqlRow[];
  failedScopes: string[];
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
  deadline: number,
  report: (chunksDone: number, chunksTotal: number) => void,
): Promise<StepOutcome> {
  const queue: (Scope | undefined)[] = step.initialScopes?.(context) ?? [undefined];
  const rows: SparqlRow[] = [];
  const seen = new Set<string>();
  const failedScopes: string[] = [];
  let lastError: SparqlError | Error | undefined;
  let done = 0;

  while (queue.length > 0) {
    const scope = queue.shift()!;

    // Out of time. Keep whatever came back and record the rest as skipped; if
    // nothing came back, the step reports failure below rather than running on.
    if (Date.now() > deadline) {
      failedScopes.push(
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
  return { rows, failedScopes, lastError };
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
      const deadline = Date.now() + STEP_BUDGET_MS;
      outcome = await runStep(step, context, deadline, (chunksDone, chunksTotal) => {
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

    // Every slice failed and nothing came back: this step has no answer to give.
    if (outcome.failedScopes.length > 0 && outcome.rows.length === 0 && !step.optional) {
      onProgress({ ...base, status: 'failed' });
      return {
        status: 'error',
        failedAtStep: i,
        message: `Error at step: ${step.description}`,
        error: outcome.lastError ?? new Error('Query failed'),
      };
    }
    if (outcome.failedScopes.length > 0) {
      partial.push({ step: step.description, scopes: outcome.failedScopes });
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
