// Reads QLever's own account of a run (Accept: application/qlever-results+json)
// and says how much of it came from the result cache. Used by the start-side
// test (start-side-test.mts), which keeps only cold runs: issue #136.
//
// Every node of runtimeInformation.query_execution_tree has a cache_status.
// A node read from the cache reports cached_not_pinned or cached_pinned, its
// own total_time is near 0, and original_total_time is what computing it took
// the first time: the time the cache saved. Its children are not run again
// (the tree shows their stored info), so only the topmost cached node of each
// branch counts, or a saving would be added twice.

export interface PlanNode {
  cache_status?: string;
  original_total_time?: number;
  children?: PlanNode[];
}

// Milliseconds the cache saved: the stored time of every topmost cached node.
export function cacheSavedMs(node: PlanNode | undefined): number {
  if (!node) return 0;
  if (node.cache_status?.startsWith('cached')) return node.original_total_time ?? 0;
  return (node.children ?? []).reduce((sum, c) => sum + cacheSavedMs(c), 0);
}

// A warm run: the cache saved more than 10% of the run's time (#136). Strictly
// cold (no cached node at all) is not reachable on the shared server, where the
// small base scans are nearly always cached.
export const WARM_SHARE = 0.1;
export function isWarm(savedMs: number, totalMs: number): boolean {
  return savedMs > WARM_SHARE * totalMs;
}

// QLever writes times as strings like "991ms".
export function parseMs(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const m = value.match(/^([\d.]+)\s*ms$/);
  return m ? Number(m[1]) : null;
}
