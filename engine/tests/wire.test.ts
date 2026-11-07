import { describe, expect, it } from 'vitest';
import { fromWire, isWireResult, toWire } from '../wire';
import type { PipelineSuccess } from '../executor';
import type { AnalysisQuestion } from '../types/query';

const SAMPLE = { sp: 'http://ex.org/sp/1', spWKT: 'POINT(-69 45)' };
const FACILITY = { facility: 'http://ex.org/fac/1', facWKT: 'POINT(-69 45)' };
const COUNTY = { region: 'http://ex.org/r/23005', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' };
const REACH = { flowline: 'http://ex.org/fl/1', flowlineWKT: 'LINESTRING(0 0, 1 1)' };
const near: AnalysisQuestion = { blockA: { type: 'samples' }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities' } };
const upstream: AnalysisQuestion = { ...near, relationship: { type: 'upstream' } };

describe('wire', () => {
  it('keeps the SPARQL that produced a result through the cache round trip', () => {
    const result: PipelineSuccess = {
      status: 'success',
      blockA: [SAMPLE],
      blockC: [],
      decoration: { boundaries: [], streamLines: [] },
      queries: [
        { step: 0, description: 'Finding samples', endpoint: 'federation', query: 'SELECT * {}' },
        { step: 3, description: 'Loading details', endpoint: 'federation', scope: 'batch 1', query: 'SELECT ?x {}', error: 'timeout' },
      ],
    };
    const wire = JSON.parse(JSON.stringify(toWire(result)));
    expect(isWireResult(wire)).toBe(true);
    expect(fromWire(wire, near).queries).toEqual(result.queries);
  });

  it('keeps the blocks, the decoration and the counts through the round trip', () => {
    const result: PipelineSuccess = {
      status: 'success',
      blockA: [SAMPLE],
      blockC: [FACILITY],
      decoration: { boundaries: [COUNTY], streamLines: [REACH] },
      counts: { A: 1, C: 1 },
    };
    expect(fromWire(JSON.parse(JSON.stringify(toWire(result))), near)).toEqual(result);
  });
});

// Results stored before results came by block (WIRE_VERSION w2) are keyed by
// pipeline step. Cached questions get new keys with the bump, but a published
// view's result is stored under its publish id and is read as it was saved.
describe('a result stored by step', () => {
  const byStep = {
    status: 'success',
    data: { FIND_TARGET_ENTITIES: [SAMPLE], GET_ANCHOR_DETAILS: [FACILITY], GET_REGION_BOUNDARIES: [COUNTY], GET_FLOWLINE_GEOMETRIES: [REACH] },
    computedAt: '2026-10-01T00:00:00.000Z',
  };

  it('is still read', () => {
    expect(isWireResult(byStep)).toBe(true);
  });

  it('puts the target under block A for near and downstream', () => {
    const result = fromWire(byStep as never, near);
    expect(result.blockA).toEqual([SAMPLE]);
    expect(result.blockC).toEqual([FACILITY]);
    expect(result.decoration).toEqual({ boundaries: [COUNTY], streamLines: [REACH] });
  });

  it('puts the target under block C for upstream', () => {
    const result = fromWire(byStep as never, upstream);
    expect(result.blockA).toEqual([FACILITY]);
    expect(result.blockC).toEqual([SAMPLE]);
  });
});
