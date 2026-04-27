import type { AnalysisQuestion } from '../types/query';
import type { SparqlRow } from '../types/sparql';
import type { PipelineStep, PipelineContext } from './planner';
import { executeSparql } from './sparqlClient';
import { shortenS2URI } from '../utils/s2cells';

export interface PipelineSuccess {
  status: 'success';
  data: Record<string, SparqlRow[]>;
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
}

const S2_PRODUCING_STEPS = new Set([
  'GET_S2_FOR_ANCHOR',
  'FILTER_S2_TO_REGION',
  'EXPAND_S2_NEAR',
  'TRACE_DOWNSTREAM',
  'TRACE_UPSTREAM',
  'FILTER_S2_POST_SPATIAL',
  'FILTER_ANCHOR_TO_REGION',
]);

// Steps that expand target S2 cells (for multi-hop reverse proximity checks)
const TARGET_S2_EXPANDING_STEPS = new Set([
  'EXPAND_TARGET_S2_NEAR',
]);

// Steps that produce filtered anchor S2 cells (stored separately from s2Cells)
const ANCHOR_FILTER_STEPS = new Set([
  'FILTER_ANCHOR_TO_NEARBY_TARGETS',
]);

export async function executePipeline(
  steps: PipelineStep[],
  question: AnalysisQuestion,
  onProgress: (progress: StepProgress) => void
): Promise<PipelineResult> {
  const context: PipelineContext = { question, s2Cells: [], anchorS2Cells: [], targetS2Cells: [], results: {} };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress({
      stepIndex: i,
      totalSteps: steps.length,
      description: step.description,
      status: 'running',
    });

    try {
      const query = step.buildQuery(context);
      const results = await executeSparql(step.endpoint, query);

      // If this step produces S2 cells, update context
      if (S2_PRODUCING_STEPS.has(step.type)) {
        if (results.length > 0 && results[0].s2cell) {
          context.s2Cells = results.map((r) => shortenS2URI(r.s2cell));
        } else {
          context.s2Cells = [];
        }

        // Save anchor S2 cells immediately after the initial lookup (before any
        // region filtering or spatial expansion), so GET_ANCHOR_DETAILS shows
        // only the facilities/samples that were directly queried, not the
        // inflated set produced by region filter expansion.
        if (step.type === 'GET_S2_FOR_ANCHOR') {
          context.anchorS2Cells = [...context.s2Cells];
        }
        if (step.type === 'FILTER_ANCHOR_TO_REGION') {
          context.anchorS2Cells = [...context.s2Cells];
        }
      }

      // After finding target entities, extract their S2 cells so that
      // FILTER_ANCHOR_TO_NEARBY_TARGETS can use them to reverse-lookup
      // only the anchor entities that are genuinely near the found targets.
      if (step.type === 'FIND_TARGET_ENTITIES') {
        const cells = results
          .map((r) => r.s2cell)
          .filter(Boolean)
          .map((c) => shortenS2URI(c));
        context.targetS2Cells = [...new Set(cells)];

        // If no targets found, return empty now — no point showing anchor entities
        if (results.length === 0) {
          onProgress({
            stepIndex: i,
            totalSteps: steps.length,
            description: step.description,
            status: 'done',
            resultCount: 0,
          });
          context.results[step.type] = results;
          return {
            status: 'empty',
            failedAtStep: i,
            message: `No results at step: ${step.description}`,
          };
        }
      }

      // EXPAND_TARGET_S2_NEAR expands target S2 cells by one hop (for multi-hop
      // reverse proximity checks). Writes back to targetS2Cells.
      if (TARGET_S2_EXPANDING_STEPS.has(step.type)) {
        if (results.length > 0 && results[0].s2cell) {
          context.targetS2Cells = results.map((r) => shortenS2URI(r.s2cell));
        }
      }

      // FILTER_ANCHOR_TO_NEARBY_TARGETS produces a refined set of anchor S2 cells.
      // Update anchorS2Cells so GET_ANCHOR_DETAILS uses only relevant anchors.
      if (ANCHOR_FILTER_STEPS.has(step.type)) {
        if (results.length > 0 && results[0].anchor) {
          context.anchorS2Cells = results.map((r) => shortenS2URI(r.anchor));
        } else {
          context.anchorS2Cells = [];
        }
      }

      context.results[step.type] = results;

      onProgress({
        stepIndex: i,
        totalSteps: steps.length,
        description: step.description,
        status: 'done',
        resultCount: results.length,
      });

      // Early exit if an S2-producing step yields no results
      if (S2_PRODUCING_STEPS.has(step.type) && context.s2Cells.length === 0) {
        return {
          status: 'empty',
          failedAtStep: i,
          message: `No results at step: ${step.description}`,
        };
      }
    } catch (err) {
      onProgress({
        stepIndex: i,
        totalSteps: steps.length,
        description: step.description,
        status: 'failed',
      });

      return {
        status: 'error',
        failedAtStep: i,
        message: `Error at step: ${step.description}`,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  return { status: 'success', data: context.results };
}
