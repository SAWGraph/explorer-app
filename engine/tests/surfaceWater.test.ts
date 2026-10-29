// Surface Water is one menu entry for two engine types. The Feature Type tree
// emits codes; these two functions turn them into the block's type and ftypes
// and back. If they drift, a user can tick lakes and get streams, or a whole
// parent starts sending a VALUES filter that today's unfiltered query does not.
import { describe, expect, it } from 'vitest';
import { fromSurfaceWaterCodes, toSurfaceWaterCodes } from '../constants/featureTypes';

const WB = '__group:waterBodies';
const ST = '__group:streams';

describe('fromSurfaceWaterCodes', () => {
  it('falls back to Surface Water Bodies when nothing is ticked', () => {
    expect(fromSurfaceWaterCodes([], 'streams')).toEqual({ type: 'waterBodies', ftypes: [] });
  });

  it('stores a ticked parent as no filter', () => {
    expect(fromSurfaceWaterCodes([ST], 'waterBodies')).toEqual({ type: 'streams', ftypes: [] });
  });

  it('treats every tickable child ticked as the parent', () => {
    expect(fromSurfaceWaterCodes(['LakePond', 'SwampMarsh', 'Reservoir'], 'waterBodies')).toEqual({
      type: 'waterBodies',
      ftypes: [],
    });
  });

  it('keeps a partial selection as ftypes', () => {
    expect(fromSurfaceWaterCodes(['StreamRiver', 'CanalDitch'], 'streams')).toEqual({
      type: 'streams',
      ftypes: ['StreamRiver', 'CanalDitch'],
    });
  });

  it('switches parent and clears the other group', () => {
    expect(fromSurfaceWaterCodes([WB, 'StreamRiver'], 'waterBodies')).toEqual({
      type: 'streams',
      ftypes: ['StreamRiver'],
    });
    expect(fromSurfaceWaterCodes(['StreamRiver', 'LakePond'], 'streams')).toEqual({
      type: 'waterBodies',
      ftypes: ['LakePond'],
    });
  });
});

describe('toSurfaceWaterCodes', () => {
  it('shows a block saved with every child as the ticked parent', () => {
    expect(toSurfaceWaterCodes('waterBodies', ['LakePond', 'SwampMarsh', 'Reservoir'])).toEqual([WB]);
  });
});

describe('saved blocks round-trip', () => {
  const cases = [
    { type: 'waterBodies', ftypes: [], codes: [WB] },
    { type: 'waterBodies', ftypes: ['LakePond'], codes: ['LakePond'] },
    { type: 'streams', ftypes: [], codes: [ST] },
    { type: 'streams', ftypes: ['StreamRiver'], codes: ['StreamRiver'] },
  ] as const;

  for (const c of cases) {
    it(`${c.type} ${JSON.stringify(c.ftypes)}`, () => {
      const codes = toSurfaceWaterCodes(c.type, [...c.ftypes]);
      expect(codes).toEqual(c.codes);
      expect(fromSurfaceWaterCodes(codes, c.type)).toEqual({ type: c.type, ftypes: c.ftypes });
    });
  }
});
