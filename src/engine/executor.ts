import type { AnalysisQuestion } from '../types/query';
import type { SparqlRow } from '../types/sparql';
import type { PipelineStep, PipelineContext } from './planner';
import { executeSparql } from './sparqlClient';

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
      context.results[step.type] = results;

      if (step.type === 'FIND_TARGET_IRIS') {
        const iris = new Set<string>();
        for (const r of results) if (r.iri) iris.add(r.iri);
        context.targetIris = [...iris];

        if (context.targetIris.length === 0) {
          onProgress({
            stepIndex: i,
            totalSteps: steps.length,
            description: step.description,
            status: 'done',
            resultCount: 0,
          });
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

      onProgress({
        stepIndex: i,
        totalSteps: steps.length,
        description: step.description,
        status: 'done',
        resultCount: results.length,
      });
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
