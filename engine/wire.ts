import type { SparqlRow } from './types/sparql';
import type { AnalysisQuestion } from './types/query';
import type { Decoration, PartialFailure, PipelineSuccess, SentQuery, SideCounts } from './executor';
import { normalise } from './question';

// The shape a cached result takes over the wire and in Postgres.
//
// Only successes are cached. An error is nearly always transient endpoint load
// (see docs/QUERY-SWEEP.md Part 4), so freezing one would turn a bad minute
// into a bad month, and an empty result is cheap to recompute.
//
// By block since WIRE_VERSION w3 (cacheKey.ts): block A's rows, block C's rows
// and the decoration. The intermediate IRI lists never leave the executor; for a
// statewide well query they ran to 22.6MB on their own and are never drawn.
export interface WireResult {
  status: 'success';
  blockA: SparqlRow[];
  blockC: SparqlRow[];
  decoration: Decoration;
  partial?: PartialFailure[];
  // The SPARQL that produced this result, for the "See Full SPARQL" modal.
  queries?: SentQuery[];
  counts?: SideCounts;
  computedAt: string;
}

// A result stored before w3, keyed by pipeline step. Cached questions moved to
// new keys with the bump, but a published view's result is stored under its
// publish id and is read back as it was saved.
interface StoredByStep {
  status: 'success';
  data: Record<string, SparqlRow[] | undefined>;
  partial?: PartialFailure[];
  queries?: SentQuery[];
  computedAt?: string;
}

export function toWire(result: PipelineSuccess, computedAt = new Date().toISOString()): WireResult {
  return {
    status: 'success',
    blockA: result.blockA,
    blockC: result.blockC,
    decoration: result.decoration,
    ...(result.partial?.length ? { partial: result.partial } : {}),
    ...(result.queries?.length ? { queries: result.queries } : {}),
    ...(result.counts ? { counts: result.counts } : {}),
    computedAt,
  };
}

// `question` places a result stored by step: which block the target was flips
// for upstream (engine/question.ts).
export function fromWire(wire: WireResult | StoredByStep, question: AnalysisQuestion): PipelineSuccess {
  const extras = {
    ...(wire.partial?.length ? { partial: wire.partial } : {}),
    ...(wire.queries?.length ? { queries: wire.queries } : {}),
  };
  if ('data' in wire) {
    const target = wire.data.FIND_TARGET_ENTITIES ?? [];
    const anchor = wire.data.GET_ANCHOR_DETAILS ?? [];
    const targetIsA = normalise(question).targetIs === 'A';
    return {
      status: 'success',
      blockA: targetIsA ? target : anchor,
      blockC: targetIsA ? anchor : target,
      decoration: {
        boundaries: wire.data.GET_REGION_BOUNDARIES ?? [],
        streamLines: wire.data.GET_FLOWLINE_GEOMETRIES ?? [],
      },
      ...extras,
    };
  }
  return {
    status: 'success',
    blockA: wire.blockA,
    blockC: wire.blockC,
    decoration: wire.decoration,
    ...extras,
    ...(wire.counts ? { counts: wire.counts } : {}),
  };
}

export function isWireResult(value: unknown): value is WireResult | StoredByStep {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WireResult & StoredByStep>;
  if (candidate.status !== 'success') return false;
  if (Array.isArray(candidate.blockA) && Array.isArray(candidate.blockC) && typeof candidate.decoration === 'object') return true;
  return typeof candidate.data === 'object' && candidate.data !== null;
}
