import { useState } from 'react';
import { useQueryStore } from '../../store/queryStore';

// Shown when some slices of a split query failed but the rest returned data.
// Silently showing an incomplete map would be worse than saying so.
export function PartialResultsNotice() {
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const [dismissed, setDismissed] = useState(false);

  if (pipelineResult?.status !== 'success' || !pipelineResult.partial?.length) return null;
  if (dismissed) return null;

  const missing = pipelineResult.partial.reduce((n, p) => n + p.scopes.length, 0);

  return (
    <div className='partial-results-notice'>
      <span>
        Showing incomplete results — {missing} {missing === 1 ? 'part' : 'parts'} of this
        question were too large for the knowledge graph to answer. Narrowing the area or
        adding a filter will give a complete answer.
      </span>
      <button type='button' onClick={() => setDismissed(true)} aria-label='Dismiss'>
        ×
      </button>
    </div>
  );
}
