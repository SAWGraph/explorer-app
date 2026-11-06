import type { AnalysisQuestion } from './types/query';
import { executeSparql, type SparqlRunner } from './endpoint';
import { executePipeline, type PipelineResult, type StepProgress } from './executor';
import { planPipeline } from './planner';

// The one way to run a question. The app and the scripts call this instead of
// wiring the planner into the executor themselves, so a new stage lands in one
// place and every caller gets it. Phase 1 of the engine redesign adds two
// options here, both default on: `chunkOnRefusal` (split a refused query, or
// show its error) and `countSides` (live counts before the run).
//
// planPipeline and executePipeline stay exported for the two callers that need
// the plan itself: the golden SPARQL snapshot, and query-matrix, which runs the
// first N steps of a plan to time each step on its own.
export interface RunOptions {
  // Where every request goes. QLever over HTTP unless a test passes its own.
  endpoint?: SparqlRunner;
  // Cancels the run; it then rejects instead of resolving.
  signal?: AbortSignal;
  // Each step as it starts, splits and finishes (the progress strip reads it).
  onProgress?: (progress: StepProgress) => void;
}

export function runQuestion(question: AnalysisQuestion, options: RunOptions = {}): Promise<PipelineResult> {
  const { endpoint = executeSparql, signal, onProgress = () => {} } = options;
  return executePipeline(planPipeline(question), question, onProgress, signal, endpoint);
}
