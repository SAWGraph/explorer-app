import { useState } from 'react';
import { useQueryStore } from '../../store/queryStore';

// Shown when some slices of a split query failed but the rest returned data.
// Silently showing an incomplete map would be worse than saying so.
export function PartialResultsNotice() {
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const [dismissed, setDismissed] = useState(false);

  if (pipelineResult?.status !== 'success' || !pipelineResult.partial?.length) return null;
  if (dismissed) return null;

  const failed = pipelineResult.partial.reduce((n, p) => n + p.failed.length, 0);
  const skipped = pipelineResult.partial.reduce((n, p) => n + p.skipped.length, 0);

  // These two need different advice: a failed slice will fail again unless the
  // question is narrowed, while a skipped one simply ran out of budget and
  // usually completes on a second run against a warmer cache.
  const reasons = [
    failed > 0 ? `${failed} too large to answer` : null,
    skipped > 0 ? `${skipped} not attempted before the time limit` : null,
  ].filter(Boolean);

  return (
    <div className='partial-results-notice'>
      <span>
        Showing incomplete results — {reasons.join(', ')}.{' '}
        {skipped > 0 && 'Running the question again picks up where this left off. '}
        {failed > 0 && 'For the parts that were too large, add a filter or region to the second block.'}
      </span>
      <button type='button' onClick={() => setDismissed(true)} aria-label='Dismiss'>
        ×
      </button>
    </div>
  );
}
