import { useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { adviceForOversizedQuestion } from '../../engine/sparqlErrors';

// Shown when some slices of a split query failed but the rest returned data.
// Silently showing an incomplete map would be worse than saying so.
export function PartialResultsNotice() {
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const question = useQueryStore((s) => s.question);
  const [dismissed, setDismissed] = useState(false);

  if (pipelineResult?.status !== 'success' || !pipelineResult.partial?.length) return null;
  if (dismissed) return null;

  const failed = pipelineResult.partial.flatMap((p) => p.failed);
  const skipped = pipelineResult.partial.flatMap((p) => p.skipped);

  // These two need different advice: a failed slice will fail again unless the
  // question is narrowed, while a skipped one simply ran out of budget and
  // usually completes on a second run against a warmer cache.
  const reasons = [
    failed.length > 0 ? `${nameList(failed)} could not be answered` : null,
    skipped.length > 0 ? `${nameList(skipped)} not attempted before the time limit` : null,
  ].filter(Boolean);

  return (
    <div className='partial-results-notice'>
      <span>
        Showing incomplete results: {reasons.join(', ')}.{' '}
        {skipped.length > 0 && 'Running the question again picks up where this left off. '}
        {failed.length > 0 && adviceForOversizedQuestion(question)}
      </span>
      <button type='button' onClick={() => setDismissed(true)} aria-label='Dismiss'>
        ×
      </button>
    </div>
  );
}

// Slice labels are county names ("York County, Maine") or entity batches
// ("facilities batch 3"). Three is enough to be actionable; a list of twelve
// counties is a wall of text nobody reads.
function nameList(labels: string[]): string {
  if (labels.length > 3) return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
  return labels.join(', ');
}
