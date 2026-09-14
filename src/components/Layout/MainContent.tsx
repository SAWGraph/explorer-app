import { useEffect } from 'react';
import { ResultsMap } from '../Map/ResultsMap';
import { PipelineProgressStrip } from '../Pipeline/PipelineProgressStrip';
import { PartialResultsNotice } from '../Pipeline/PartialResultsNotice';
import { useQueryStore } from '../../store/queryStore';
import { useMapLayers } from '../../hooks/useMapLayers';
import { useQueryPipeline } from '../../hooks/useQueryPipeline';

export function MainContent() {
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const pendingAutoRun = useQueryStore((s) => s.pendingAutoRun);
  const clearPendingAutoRun = useQueryStore((s) => s.clearPendingAutoRun);
  const layers = useMapLayers(pipelineResult);
  const { runPipeline, isRunning } = useQueryPipeline();

  // Auto-run pipeline when navigating from Dashboard
  useEffect(() => {
    if (pendingAutoRun && !isRunning) {
      clearPendingAutoRun();
      runPipeline();
    }
  }, [pendingAutoRun, isRunning, clearPendingAutoRun, runPipeline]);

  return (
    <main className='app-main'>
      <div className='map-container'>
        <ResultsMap layers={layers} />
        <PartialResultsNotice />
        <PipelineProgressStrip />
      </div>
    </main>
  );
}
