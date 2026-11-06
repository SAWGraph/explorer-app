import { useCallback } from 'react';
import { useQueryStore } from '../store/queryStore';
import type { PipelineResult } from '../../engine/executor';
import { runQuestion } from '../../engine/run';
import { fetchCachedResult } from '../api/resultCacheClient';

// Split a query the endpoint refuses into smaller ones (default on). Set
// VITE_CHUNK_ON_REFUSAL=false at build time, e.g. in the Railway development
// environment, to see refusals as errors instead. Read here because the engine
// is headless and takes it as a run option; read per run so a test can set it.
function chunkOnRefusal(): boolean {
  return String(import.meta.env.VITE_CHUNK_ON_REFUSAL ?? '').trim().toLowerCase() !== 'false';
}

export function useQueryPipeline() {
  const {
    question,
    isRunning,
    stepProgress,
    pipelineResult,
    startRun,
    endRun,
    addStepProgress,
    clearProgress,
    setPipelineResult,
    setResultProvenance,
  } = useQueryStore();

  // Resolves to null when the run is cancelled: the previous result stays on
  // the map, untouched, and there is nothing new to show.
  const runPipeline = useCallback(async (
    options: { skipCache?: boolean } = {},
  ): Promise<PipelineResult | null> => {
    const signal = startRun();

    try {
      // A cached answer to this exact question skips the pipeline entirely.
      // Only trusted writers populate the cache (the publisher and the
      // warm-cache script), and a miss or any error falls through to running
      // locally, so this can only make a run faster.
      const cached = options.skipCache ? null : await fetchCachedResult(question, signal);
      signal.throwIfAborted();
      if (cached) {
        setPipelineResult(cached.result);
        setResultProvenance({ computedAt: cached.computedAt, partial: cached.partial });
        return cached.result;
      }

      const result = await runQuestion(question, { onProgress: addStepProgress, signal, chunkOnRefusal: chunkOnRefusal() });
      setPipelineResult(result);
      setResultProvenance(null);
      return result;
    } catch (err) {
      if (signal.aborted) {
        clearProgress();
        return null;
      }
      const result: PipelineResult = {
        status: 'error',
        failedAtStep: -1,
        message: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err : new Error(String(err)),
      };
      setPipelineResult(result);
      return result;
    } finally {
      endRun();
    }
  }, [
    question,
    clearProgress,
    startRun,
    endRun,
    addStepProgress,
    setPipelineResult,
    setResultProvenance,
  ]);

  return { runPipeline, isRunning, stepProgress, pipelineResult };
}
