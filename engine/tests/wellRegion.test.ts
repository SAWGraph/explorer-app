// A region on a wells block has to hold for the well itself, not only for the
// S2 cell it sits in (#96). A cell that crosses the county line touches the
// county, so every well in it used to pass.
//
//   npm test                      # query text only, no network
//   LIVE_SPARQL=1 npx vitest run engine/tests/wellRegion.test.ts   # also federation
import { describe, expect, it } from 'vitest';
import {
  buildEntityProbeQuery,
  buildFusedHydrologyQuery,
  buildFusedNearQuery,
  buildFusedWellQuery,
} from '../templates/fusedQueries';
import { executeSparql } from '../sparqlClient';
import type { EntityBlock } from '../types/query';

const HANCOCK = ['23009'];
const wells: EntityBlock = { type: 'wells' };
const waterBodies: EntityBlock = { type: 'waterBodies' };
const facilities: EntityBlock = { type: 'facilities' };

const flat = (q: string) => q.replace(/\s+/g, ' ');
const wellInRegion = (wellVar: string) =>
  new RegExp(`${wellVar.replace('?', '\\?')} spatial:connectedTo (\\?\\w+) \\. \\1 kwg-ont:administrativePartOf\\+ `);
const checksWell = (q: string, wellVar: string) => wellInRegion(wellVar).test(flat(q));

const near = (anchorRegion: string[] | undefined, targetRegion: string[] | undefined, hops = 0) =>
  buildFusedNearQuery({ anchor: waterBodies, target: wells, anchorRegion, targetRegion, hops, project: 'target' });

describe('a region on wells checks the well', () => {
  it('on block C, near', () => {
    expect(checksWell(near(undefined, HANCOCK), '?wellC')).toBe(true);
  });

  it('on block A, near', () => {
    const q = buildFusedNearQuery({ anchor: wells, target: waterBodies, anchorRegion: HANCOCK, hops: 1, project: 'anchor' });
    expect(checksWell(q, '?wellA')).toBe(true);
  });

  it('on several counties and on a state', () => {
    expect(checksWell(near(undefined, ['23031', '23005', '23001']), '?wellC')).toBe(true);
    expect(checksWell(near(undefined, ['23']), '?wellC')).toBe(true);
  });

  for (const direction of ['downstream', 'upstream'] as const) {
    for (const maxDistanceKm of [undefined, 10]) {
      it(`${direction}${maxDistanceKm ? ', bounded' : ''}`, () => {
        const q = buildFusedHydrologyQuery({
          anchor: facilities, target: wells, targetRegion: HANCOCK, direction, maxDistanceKm, project: 'target',
        });
        expect(checksWell(q, '?wellC')).toBe(true);
      });
    }
  }

  it('in the chunk probe, so slices match discovery', () => {
    expect(checksWell(buildEntityProbeQuery(wells, HANCOCK, 100), '?wellP')).toBe(true);
  });

  it('in well hydration', () => {
    const q = buildFusedWellQuery({
      anchor: waterBodies, target: wells, targetRegion: HANCOCK,
      relationship: { type: 'near', hops: 0 }, direction: 'downstream', wellSide: 'target',
    });
    expect(checksWell(q, '?wellC')).toBe(true);
  });

  it('only when that wells side has a region', () => {
    expect(checksWell(near(undefined, undefined), '?wellC')).toBe(false);
    expect(flat(near(HANCOCK, undefined))).not.toContain('administrativePartOf');
  });

  it('leaves other block types on the cell check', () => {
    const q = buildFusedNearQuery({ anchor: facilities, target: waterBodies, anchorRegion: HANCOCK, targetRegion: HANCOCK, hops: 1, project: 'target' });
    expect(flat(q)).not.toContain('administrativePartOf');
  });
});

// Counts measured on federation on 2026-11-05 for "wells near water bodies in
// Hancock County, ME" at 0 cells away. They move if the graph is reloaded.
describe.skipIf(!process.env.LIVE_SPARQL)('Hancock on federation', () => {
  const count = async (q: string) => (await executeSparql('federation', q)).length;

  it('region on water bodies only keeps the cell answer', async () => {
    expect(await count(near(HANCOCK, undefined))).toBe(2264);
  }, 60_000);

  it('region on wells drops the 35 wells outside the county', async () => {
    expect(await count(near(undefined, HANCOCK))).toBe(2229);
  }, 60_000);

  it('region on both matches region on wells', async () => {
    expect(await count(near(HANCOCK, HANCOCK))).toBe(2229);
  }, 60_000);

  it('returns no well without a Hancock subdivision link', async () => {
    const outsiders = flat(near(undefined, HANCOCK)).replace(
      /SELECT DISTINCT \(\?wellC AS \?iri\) WHERE \{(.*)\}\s*$/,
      `SELECT DISTINCT (?wellC AS ?iri) WHERE { { SELECT DISTINCT ?wellC WHERE {$1} }
        FILTER NOT EXISTS { ?cs kwg-ont:administrativePartOf+ kwgr:administrativeRegion.USA.23009 . ?wellC spatial:connectedTo ?cs . } }`,
    );
    expect(outsiders).not.toBe(flat(near(undefined, HANCOCK)));
    expect(await count(outsiders)).toBe(0);
  }, 60_000);
});
