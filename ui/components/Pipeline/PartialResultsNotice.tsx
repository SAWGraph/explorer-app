import { useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { partialNotice } from '../../../engine/errors';

// Shown when some slices of a split query failed but the rest returned data.
// The wording, and when there is anything to say, come from engine/errors.ts.
export function PartialResultsNotice() {
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const question = useQueryStore((s) => s.question);
  const [dismissed, setDismissed] = useState(false);

  const notice = partialNotice(pipelineResult, question);
  if (!notice || dismissed) return null;

  return (
    <div className='partial-results-notice'>
      <span>{notice}</span>
      <button type='button' onClick={() => setDismissed(true)} aria-label='Dismiss'>
        ×
      </button>
    </div>
  );
}
