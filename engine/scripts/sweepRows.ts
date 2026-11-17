import type { RequestRecord } from '../endpoint';
import type { SentQuery } from '../executor';
import type { PipelineStep } from '../planner';

// One row of a query sweep: one request the engine sent.
export interface SweepRow {
  // The plan step's type (FIND_TARGET_IRIS, ...), or PROBE for a request the
  // slicing made to decide how to split (entity probes, county lookups).
  step: string;
  // The batch or slice the request carried ("batch 2", "York County, Maine"),
  // empty when it carried the whole step.
  slice: string;
  endpoint: string;
  status: number;
  ms: number;
  rows: number;
  requestBytes: number;
  kind: string;
  message: string;
  cached: boolean;
}

// Joins what the endpoint recorded (every request, in the order they finished)
// with the run's own list of the queries its steps sent (which step, which
// slice). A recorded request no step claims is one the slicing made.
export function sweepRows(steps: PipelineStep[], queries: SentQuery[] | undefined, records: RequestRecord[]): SweepRow[] {
  const unclaimed = [...(queries ?? [])];
  return records.map((record) => {
    const i = unclaimed.findIndex((q) => q.query === record.query);
    const sent = i > -1 ? unclaimed.splice(i, 1)[0] : undefined;
    return {
      step: sent ? (steps[sent.step]?.type ?? `step ${sent.step}`) : 'PROBE',
      slice: sent?.scope ?? '',
      endpoint: record.endpoint,
      status: record.status,
      ms: record.ms,
      rows: record.rows,
      requestBytes: record.requestBytes,
      kind: record.kind,
      message: record.message,
      cached: record.cached,
    };
  });
}
