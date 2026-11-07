// How a block reads in the question sentence once it has more picks than are
// listed by name (more than LIST_THRESHOLD). The count used to go in front of
// the noun, which said the noun twice: "4 stream types streams", "4 industries
// facilities". The count now follows the noun: "streams of 4 types",
// "facilities in 4 industries".
//
// No network: describe() only builds words.
import { describe, expect, it } from 'vitest';
import { entityFor } from '../entities';
import { LIST_THRESHOLD } from '../entities/wording';
import { STREAM_FTYPES, WATER_BODY_FTYPES } from '../constants/featureTypes';
import type { EntityBlock } from '../types/query';

const many = LIST_THRESHOLD + 1;
const pick = <T>(items: T[]): T[] => items.slice(0, many);

const BLOCKS: [string, EntityBlock, string][] = [
  ['streams', { type: 'streams', streamFilters: { ftypes: pick(STREAM_FTYPES).map((o) => o.value) } }, `streams of ${many} types`],
  // Only 3 water types exist today; a fourth (a new FTYPE) would read the same way.
  ['water bodies', { type: 'waterBodies', waterBodyFilters: { ftypes: [...WATER_BODY_FTYPES.map((o) => o.value), 'Estuary'].slice(0, many) } }, `surface water bodies of ${many} types`],
  ['wells', { type: 'wells', wellFilters: { wellCategories: ['meUse||a', 'meUse||b', 'meUse||c', 'meUse||d'].slice(0, many) } }, `wells of ${many} types`],
  ['facilities', { type: 'facilities', facilityFilters: { industryCodes: ['11', '21', '22', '23'].slice(0, many) } }, `facilities in ${many} industries`],
];

describe('a block with more picks than are named', () => {
  it.each(BLOCKS)('%s puts the count after the noun', (_name, block, expected) => {
    expect(entityFor(block.type).describe(block)).toBe(expected);
  });
});

describe('a block with few picks', () => {
  it('still names them in front of the noun', () => {
    const block: EntityBlock = { type: 'streams', streamFilters: { ftypes: [STREAM_FTYPES[0].value] } };
    expect(entityFor('streams').describe(block)).toBe(`${STREAM_FTYPES[0].label} streams`);
  });
});
