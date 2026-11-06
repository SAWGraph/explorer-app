import type { AnalysisQuestion } from './types/query';
import { executePipeline, type ExecuteOptions, type PipelineResult } from './executor';
import { planPipeline } from './planner';

// The one way to run a question. The app and the scripts call this instead of
// wiring the planner into the executor themselves, so a new stage lands in one
// place and every caller gets it. `countSides` (live counts before the run,
// default on) is the next option to arrive, in Phase 1 of the engine redesign.
//
// planPipeline and executePipeline stay exported for the two callers that need
// the plan itself: the golden SPARQL snapshot, and query-sweep, which runs the
// first N steps of a plan to time each step on its own.
// The executor's options (endpoint, signal, onProgress, chunkOnRefusal), and
// later the ones only a whole run has.
export type RunOptions = ExecuteOptions;

export function runQuestion(question: AnalysisQuestion, options: RunOptions = {}): Promise<PipelineResult> {
  return executePipeline(planPipeline(question), question, options);
}
