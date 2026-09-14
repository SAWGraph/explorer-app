import type { SparqlRow } from '../types/sparql';
import type { PartialFailure, PipelineSuccess } from './executor';

// The shape a cached result takes over the wire and in Postgres.
//
// Only successes are cached. An error is nearly always transient endpoint load
// (see docs/QUERY-MATRIX.md Part 4), so freezing one would turn a bad minute
// into a bad month, and an empty result is cheap to recompute.
export interface WireResult {
  status: 'success';
  data: Record<string, SparqlRow[]>;
  partial?: PartialFailure[];
  computedAt: string;
}

// The only keys useMapLayers reads (useMapLayers.ts:41-44). Everything else in
// `data` is pipeline bookkeeping — the intermediate IRI lists, which for a
// statewide well query ran to 22.6MB on their own and are never rendered.
const RENDERED_KEYS = [
  'FIND_TARGET_ENTITIES',
  'GET_ANCHOR_DETAILS',
  'GET_REGION_BOUNDARIES',
  'GET_FLOWLINE_GEOMETRIES',
] as const;

export function toWire(result: PipelineSuccess, computedAt = new Date().toISOString()): WireResult {
  const data: Record<string, SparqlRow[]> = {};
  for (const key of RENDERED_KEYS) {
    if (result.data[key]?.length) data[key] = result.data[key];
  }
  return {
    status: 'success',
    data,
    ...(result.partial?.length ? { partial: result.partial } : {}),
    computedAt,
  };
}

export function fromWire(wire: WireResult): PipelineSuccess {
  return {
    status: 'success',
    data: wire.data,
    ...(wire.partial?.length ? { partial: wire.partial } : {}),
  };
}

export function isWireResult(value: unknown): value is WireResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WireResult>;
  return candidate.status === 'success' && typeof candidate.data === 'object' && candidate.data !== null;
}
