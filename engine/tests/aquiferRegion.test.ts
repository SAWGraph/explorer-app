// A region on an aquifers block has to hold for the aquifer itself, not only
// for the S2 cell it sits in (#144). A cell that crosses the county line
// touches the county, so every aquifer in it used to pass: 16 extra of 197 in
// Hancock, 15 of 25 in Sagadahoc. The same leak #96 fixed for wells
// (wellRegion.test.ts).
//
//   npm test                      # query text only, no network
//   LIVE_SPARQL=1 npx vitest run engine/tests/aquiferRegion.test.ts   # also federation
import { describe, expect, it } from 'vitest';
import {
  buildEntityCountQuery,
  buildEntityProbeQuery,
  buildFusedHydrologyQuery,
  buildFusedNearQuery,
} from '../templates/fusedQueries';
import { executeSparql } from '../endpoint';
import type { EntityBlock } from '../types/query';

const HANCOCK = ['23009'];
const SAGADAHOC = ['23023'];
const aquifers: EntityBlock = { type: 'aquifers' };
const samples: EntityBlock = { type: 'samples' };
const facilities: EntityBlock = { type: 'facilities' };

const flat = (q: string) => q.replace(/\s+/g, ' ');
const aquiferInRegion = (aquiferVar: string) =>
  new RegExp(`${aquiferVar.replace('?', '\\?')} spatial:connectedTo (\\?\\w+) \\. \\1 kwg-ont:administrativePartOf\\+ `);
const checksAquifer = (q: string, aquiferVar: string) => aquiferInRegion(aquiferVar).test(flat(q));

describe('a region on aquifers checks the aquifer', () => {
  it('on block A, near', () => {
    const q = buildFusedNearQuery({ anchor: aquifers, target: samples, anchorRegion: HANCOCK, hops: 0, project: 'anchor' });
    expect(checksAquifer(q, '?aquiferA')).toBe(true);
  });

  it('on block C, near', () => {
    const q = buildFusedNearQuery({ anchor: samples, target: aquifers, targetRegion: HANCOCK, hops: 0, project: 'target' });
    expect(checksAquifer(q, '?aquiferC')).toBe(true);
  });

  it('on several counties and on a state', () => {
    for (const region of [['23005', '23031'], ['23']]) {
      const q = buildFusedNearQuery({ anchor: samples, target: aquifers, targetRegion: region, hops: 0, project: 'target' });
      expect(checksAquifer(q, '?aquiferC')).toBe(true);
    }
  });

  // A trace always runs downstream from the anchor (engine/question.ts), so
  // aquifers are the target in "aquifers downstream of facilities" and the
  // anchor in "samples downstream of aquifers".
  for (const maxDistanceKm of [undefined, 10]) {
    const bounded = maxDistanceKm ? ', bounded' : '';
    it(`a trace, aquifers as the target${bounded}`, () => {
      const q = buildFusedHydrologyQuery({
        anchor: facilities, target: aquifers, targetRegion: HANCOCK, maxDistanceKm, project: 'target',
      });
      expect(checksAquifer(q, '?aquiferC')).toBe(true);
    });
    it(`a trace, aquifers as the anchor${bounded}`, () => {
      const q = buildFusedHydrologyQuery({
        anchor: aquifers, target: samples, anchorRegion: HANCOCK, maxDistanceKm, project: 'anchor',
      });
      expect(checksAquifer(q, '?aquiferA')).toBe(true);
    });
  }

  it('in the side count and the chunk probe, so they match discovery', () => {
    expect(checksAquifer(buildEntityCountQuery(aquifers, HANCOCK), '?aquiferP')).toBe(true);
    expect(checksAquifer(buildEntityProbeQuery(aquifers, HANCOCK, 100), '?aquiferP')).toBe(true);
  });

  it('only when that aquifers side has a region', () => {
    expect(flat(buildEntityCountQuery(aquifers, undefined))).not.toContain('administrativePartOf');
    const q = buildFusedNearQuery({ anchor: samples, target: aquifers, anchorRegion: HANCOCK, hops: 0, project: 'target' });
    expect(flat(q)).not.toContain('administrativePartOf');
  });
});

// Side counts measured on federation on 2026-11-10. They move if the graph is
// reloaded. Across all 118 Maine and Illinois counties the cell check let in
// 635 of 10,432 county and aquifer pairs, and the subdivision link dropped no
// aquifer the cell check kept.
describe.skipIf(!process.env.LIVE_SPARQL)('on federation', () => {
  const count = async (q: string) => Number((await executeSparql('federation', q))[0]?.count ?? 0);

  it('Hancock drops the 16 aquifers whose subdivisions are all in other counties', async () => {
    expect(await count(buildEntityCountQuery(aquifers, HANCOCK))).toBe(181);
  }, 60_000);

  it('Sagadahoc drops 15 of 25', async () => {
    expect(await count(buildEntityCountQuery(aquifers, SAGADAHOC))).toBe(10);
  }, 60_000);

  it('keeps an aquifer that only overlaps the county', async () => {
    // Hancock's aquifers linked by sfOverlaps alone (no sfWithin) still count.
    const overlapOnly = flat(buildEntityCountQuery(aquifers, HANCOCK)).replace(
      /\}\s*$/,
      `FILTER NOT EXISTS { ?aquiferP kwg-ont:sfWithin ?_w . ?_w kwg-ont:administrativePartOf+ kwgr:administrativeRegion.USA.23009 . } }`,
    );
    expect(await count(overlapOnly)).toBeGreaterThan(0);
  }, 60_000);
});
