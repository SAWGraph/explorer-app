import { useQueryStore } from '../../store/queryStore';
import { useQueryPipeline } from '../../hooks/useQueryPipeline';

function formatComputedAt(iso: string | null): string {
  if (!iso) return 'earlier';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'earlier';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `on ${date.toLocaleDateString()}`;
}

// Says plainly when a map is showing a stored answer rather than a fresh one.
// This tool's output ends up in reports, so a cached result must never be
// mistaken for a live one — and re-running must always be one click away.
export function CachedResultNotice() {
  const provenance = useQueryStore((s) => s.resultProvenance);
  const isRunning = useQueryStore((s) => s.isRunning);
  const { runPipeline } = useQueryPipeline();

  if (!provenance || isRunning) return null;

  return (
    <div className='cached-result-notice'>
      <span>
        Showing saved results, computed {formatComputedAt(provenance.computedAt)}
        {provenance.partial && ' (incomplete)'}.
      </span>
      <button type='button' onClick={() => void runPipeline({ skipCache: true })}>
        Re-run live
      </button>
    </div>
  );
}
