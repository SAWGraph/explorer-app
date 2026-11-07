// @vitest-environment jsdom
//
// The map draws a result by block (engine/executor.ts PipelineSuccess): block
// A's rows, block C's rows and the decoration, whichever role each block played
// in the run. Before, it read step keys whose meaning flipped for upstream.
import { expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapLayers } from '../hooks/useMapLayers';
import type { PipelineSuccess } from '../../engine/executor';

const result: PipelineSuccess = {
  status: 'success',
  blockA: [{ sp: 'http://ex.org/sp/1', spWKT: 'POINT(-69 45)' }],
  blockC: [{ facility: 'http://ex.org/fac/1', facWKT: 'POINT(-69.1 45.1)', facilityName: 'Landfill' }],
  decoration: {
    boundaries: [{ region: 'http://ex.org/r/23005', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' }],
    streamLines: [{ flowline: 'http://ex.org/fl/1', flowlineWKT: 'LINESTRING(0 0, 1 1)' }],
  },
};

it('draws both blocks and the decoration', () => {
  const { result: layers } = renderHook(() => useMapLayers(result));
  expect(layers.current.samples.map((f) => f.id)).toEqual(['http://ex.org/sp/1']);
  expect(layers.current.facilities.map((f) => f.id)).toEqual(['http://ex.org/fac/1']);
  expect(layers.current.streams.map((f) => f.id)).toEqual(['http://ex.org/fl/1']);
  expect(layers.current.regionBoundaries).toHaveLength(1);
});
