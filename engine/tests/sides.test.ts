// How narrow a side is (engine/sides.ts): the rank that picks which side a
// trace starts from. A higher rank leads; ties keep the anchor first.
import { describe, expect, it } from 'vitest';
import { leadSide, sideRank } from '../sides';
import type { EntityBlock } from '../types/query';

const LANDFILLS: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } };
const ALL_FACILITIES: EntityBlock = { type: 'facilities' };
const PFOS_SAMPLES: EntityBlock = { type: 'samples', sampleFilters: { substances: ['http://w3id.org/DSSTox/v1/DTXSID3031864'] } };
const DEFAULT_SAMPLES: EntityBlock = { type: 'samples', sampleFilters: { includeNondetects: true } };

describe('the rank of a side', () => {
  it.each([
    ['pinned to IRIs, whatever else is set', ALL_FACILITIES, ['23'], ['http://x/f/1'], 3],
    ['a region', ALL_FACILITIES, ['23005'], undefined, 2],
    ['a region beats a filter', LANDFILLS, ['23'], undefined, 2],
    ['a filter only (selective in kind, unbounded in extent)', LANDFILLS, undefined, undefined, 1],
    ['a substance filter only', PFOS_SAMPLES, undefined, undefined, 1],
    ['nothing set', ALL_FACILITIES, undefined, undefined, 0],
    ['the default non-detect tick is not a filter', DEFAULT_SAMPLES, undefined, undefined, 0],
    ['an empty pin list is not a pin', ALL_FACILITIES, undefined, [], 0],
  ] as const)('%s', (_name, block, region, pins, rank) => {
    expect(sideRank({ block, region: region as string[] | undefined, pins: pins as string[] | undefined })).toBe(rank);
  });
});

describe('which side leads', () => {
  it('the narrower side', () => {
    expect(leadSide({ block: LANDFILLS }, { block: PFOS_SAMPLES, region: ['23'] })).toBe('target');
    expect(leadSide({ block: LANDFILLS, region: ['23'] }, { block: PFOS_SAMPLES })).toBe('anchor');
  });

  it('the anchor on a tie', () => {
    expect(leadSide({ block: LANDFILLS, region: ['23'] }, { block: PFOS_SAMPLES, region: ['23005'] })).toBe('anchor');
    expect(leadSide({ block: ALL_FACILITIES }, { block: DEFAULT_SAMPLES })).toBe('anchor');
  });
});
