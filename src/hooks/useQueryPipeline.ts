import { useCallback } from 'react';
import { useQueryStore } from '../store/queryStore';
import type { PipelineResult } from '../engine/executor';
import { planPipeline } from '../engine/planner';
import { executePipeline } from '../engine/executor';
import { fetchCachedResult } from '../api/resultCacheClient';

export function useQueryPipeline() {
  const {
    question,
    isRunning,
    stepProgress,
    pipelineResult,
    setIsRunning,
    addStepProgress,
    clearProgress,
    setPipelineResult,
    setResultProvenance,
  } = useQueryStore();

  const runPipeline = useCallback(async (options: { skipCache?: boolean } = {}) => {
    clearProgress();
    setIsRunning(true);

    try {
      // A cached answer to this exact question skips the pipeline entirely.
      // Only trusted writers populate the cache (the publisher and the
      // warm-cache script), and a miss or any error falls through to running
      // locally, so this can only make a run faster.
      const cached = options.skipCache ? null : await fetchCachedResult(question);
      if (cached) {
        setPipelineResult(cached.result);
        setResultProvenance({ computedAt: cached.computedAt, partial: cached.partial });
        return cached.result;
      }
      setResultProvenance(null);

      const steps = planPipeline(question);
      const result = await executePipeline(steps, question, addStepProgress);
      setPipelineResult(result);
      return result;
    } catch (err) {
      const result: PipelineResult = {
        status: 'error',
        failedAtStep: -1,
        message: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err : new Error(String(err)),
      };
      setPipelineResult(result);
      return result;
    } finally {
      setIsRunning(false);
    }
  }, [
    question,
    clearProgress,
    setIsRunning,
    addStepProgress,
    setPipelineResult,
    setResultProvenance,
  ]);

  return { runPipeline, isRunning, stepProgress, pipelineResult };
}
