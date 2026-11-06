import type { AnalysisQuestion } from './types/query';
import { executePipeline, type ExecuteOptions, type PipelineResult } from './executor';
import { planPipeline, type PlanOptions } from './planner';

// The one way to run a question. The app and the scripts call this instead of
// wiring the planner into the executor themselves, so a new stage lands in one
// place and every caller gets it.
//
// planPipeline and executePipeline stay exported for the two callers that need
// the plan itself: the golden SPARQL snapshot, and query-sweep, which runs the
// discovery steps of a plan to time each step on its own.
// The executor's options (endpoint, signal, onProgress, chunkOnRefusal) and the
// planner's (countSides: count both sides before discovery, default on).
export type RunOptions = ExecuteOptions & PlanOptions;

export function runQuestion(question: AnalysisQuestion, options: RunOptions = {}): Promise<PipelineResult> {
  const { countSides, ...execute } = options;
  return executePipeline(planPipeline(question, { countSides }), question, execute);
}
