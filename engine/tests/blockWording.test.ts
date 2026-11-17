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
  ['streams', { type: 'streams', streamFilters: { ftypes: pick(STREAM_FTYPES).map((o) => o.value) } }, `streams and flowlines of ${many} types`],
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
    expect(entityFor('streams').describe(block)).toBe(`${STREAM_FTYPES[0].label} streams and flowlines`);
  });
});

// With no industry filter the map shows every facility, coded or not; picking
// every industry ("Select all") shows only facilities with a code. The two
// read differently, so the question says which (#145).
describe('facilities and their industry filter', () => {
  const ROOTS = ['11', '21', '22', '23', '31', '32', '33', '42', '44', '45', '48', '49', '51', '52', '53', '54', '55', '56', '61', '62', '71', '72', '81', '92'];
  const totals = { industries: ROOTS.length };

  it('reads as bare facilities with no filter', () => {
    expect(entityFor('facilities').describe({ type: 'facilities' }, totals)).toBe('facilities');
  });

  it('reads as facilities with an industry code when every industry is picked', () => {
    const block: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ROOTS } };
    expect(entityFor('facilities').describe(block, totals)).toBe('facilities with an industry code');
  });
});

// The unfiltered noun matches the Type menu entry, "Ground Water (Aquifers)"
// (#164). One kind picked keeps its word in front of the noun.
describe('aquifers and their kind filter', () => {
  it('reads as ground water aquifers with no filter', () => {
    expect(entityFor('aquifers').describe({ type: 'aquifers' })).toBe('ground water aquifers');
  });

  it('puts one picked kind in front of the noun', () => {
    const block: EntityBlock = { type: 'aquifers', aquiferFilters: { aquiferTypes: ['bedrock'] } };
    expect(entityFor('aquifers').describe(block)).toBe('bedrock ground water aquifers');
  });
});
