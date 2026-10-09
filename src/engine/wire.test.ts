import { describe, expect, it } from 'vitest';
import { fromWire, isWireResult, toWire } from './wire';
import type { PipelineSuccess } from './executor';

describe('wire', () => {
  it('keeps the SPARQL that produced a result through the cache round trip', () => {
    const result: PipelineSuccess = {
      status: 'success',
      data: { FIND_TARGET_ENTITIES: [{ iri: 'http://example.org/a' }] },
      queries: [
        { step: 0, description: 'Finding samples', endpoint: 'federation', query: 'SELECT * {}' },
        { step: 3, description: 'Loading details', endpoint: 'federation', scope: 'batch 1', query: 'SELECT ?x {}', error: 'timeout' },
      ],
    };
    const wire = JSON.parse(JSON.stringify(toWire(result)));
    expect(isWireResult(wire)).toBe(true);
    expect(fromWire(wire).queries).toEqual(result.queries);
  });

});
