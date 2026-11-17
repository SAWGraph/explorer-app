// How a refused discovery query is split (engine/slicing.ts, chooseAxis), once
// the run has counted both sides. The counts only skip probes that cannot
// help: a side counted over 200 would fill the 201-probe, and a side counted
// over 5,000 would fill the bulk one. Which side is split, and in what order,
// stays as it was (anchor first); changing that is for a sweep to decide.
//
// No network: a fake endpoint answers.
import { describe, expect, it } from 'vitest';
import { chooseAxis } from '../slicing';
import type { EntityBlock } from '../types/query';
import { fakeEndpoint, iriRows, projected } from './support/fakeEndpoint';

const LANDFILLS: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } };
const CUMBERLAND_SAMPLES: EntityBlock = { type: 'samples', region: { stateCode: '23', countyCodes: ['23005'] } };
const samples = (n: number) => iriRows(Array.from({ length: n }, (_, i) => `http://ex.org/sp/${i}`));

const axis = (counts?: { anchor?: number; target?: number }) => {
  const fake = fakeEndpoint(({ query }) => (projected(query) === 'spP' ? samples(60) : iriRows(Array.from({ length: 6000 }, (_, i) => `http://ex.org/f/${i}`))));
  const slices = chooseAxis({
    anchorBlock: LANDFILLS,
    targetBlock: CUMBERLAND_SAMPLES,
    targetRegion: ['23005'],
    endpoint: 'federation',
    sparql: fake.run,
    counts,
  });
  return { fake, slices };
};

describe('splitting a refused question, with both sides counted', () => {
  it('goes straight to the bulk list of a side counted at 5,000 or fewer', async () => {
    const { fake, slices } = axis({ anchor: 6000, target: 4000 });

    expect((await slices)?.map((s) => s.label)).toEqual(['samples batch 1', 'samples batch 2', 'samples batch 3']);
    // One request: no 201-probes (both sides counted over 200), no bulk list
    // of the landfills (counted over 5,000).
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].query).toContain('LIMIT 5001');
  });

  it('probes as before when the counts are missing', async () => {
    const { fake, slices } = axis();
    await slices;
    // Both 201-probes go out first.
    expect(fake.calls.slice(0, 2).every((c) => c.query.includes('LIMIT 201'))).toBe(true);
  });
});
