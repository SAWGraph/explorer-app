// A region on a wells block must check the well, not just its S2 cell. A cell
// that straddles the county line otherwise lets in wells from the far side
// (35 of 2,264 on David's Hancock County question). Regions on other blocks
// keep the cell check only: water bodies have no region links in the graph.
import { describe, expect, it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import { buildEntityProbeQuery } from '../templates/fusedQueries';
import type { AnalysisQuestion, EntityBlock } from '../types/query';

const HANCOCK = { stateCode: '23', countyCodes: ['23009'] };
const wells = (region?: EntityBlock['region']): EntityBlock => ({ type: 'wells', region });
const waterBodies = (region?: EntityBlock['region']): EntityBlock => ({ type: 'waterBodies', region });

const ctx = (question: AnalysisQuestion): PipelineContext => ({
  question,
  targetIris: [],
  anchorIris: [],
  results: {},
});

// Every query the plan sends, keyed by step type.
function queries(blockA: EntityBlock, blockC: EntityBlock, hops = 0): Record<string, string> {
  const question: AnalysisQuestion = { blockA, relationship: { type: 'near', hops }, blockC };
  return Object.fromEntries(planPipeline(question).map((s) => [s.type, s.buildQuery(ctx(question))]));
}

const IN_HANCOCK = /\?_subdivision(\w) kwg-ont:administrativePartOf\+ kwgr:administrativeRegion\.USA\.23009 \.\s+\?well\1 spatial:connectedTo \?_subdivision\1 \./;

describe('region on wells', () => {
  it('checks the well itself in discovery and in well hydration', () => {
    const q = queries(wells(HANCOCK), waterBodies());
    for (const step of ['FIND_TARGET_IRIS', 'FIND_ANCHOR_IRIS', 'HYDRATE_TARGET_BY_IRI']) {
      expect(q[step], step).toMatch(IN_HANCOCK);
    }
  });

  it('checks the well last in well hydration, where it costs nothing', () => {
    // Inside the body this query took 23s instead of 8s on Maine wells.
    const q = queries(wells(HANCOCK), waterBodies()).HYDRATE_TARGET_BY_IRI;
    expect(q.match(/administrativePartOf\+/g)).toHaveLength(1);
    expect(q.indexOf('administrativePartOf+')).toBeGreaterThan(q.lastIndexOf('OPTIONAL'));
  });

  it('keeps the cell check too, since it narrows the search first', () => {
    const q = queries(wells(HANCOCK), waterBodies());
    expect(q.FIND_TARGET_IRIS).toContain('?s2target spatial:connectedTo kwgr:administrativeRegion.USA.23009 .');
  });

  it('checks the well when both blocks carry the region', () => {
    expect(queries(wells(HANCOCK), waterBodies(HANCOCK)).FIND_TARGET_IRIS).toMatch(IN_HANCOCK);
  });

  it('lists several counties as VALUES on the well side', () => {
    const q = queries(wells({ stateCode: '23', countyCodes: ['23009', '23027'] }), waterBodies());
    expect(q.FIND_TARGET_IRIS).toContain(
      'VALUES ?_wellRegionC { kwgr:administrativeRegion.USA.23009 kwgr:administrativeRegion.USA.23027 }',
    );
    expect(q.FIND_TARGET_IRIS).toContain('?_subdivisionC kwg-ont:administrativePartOf+ ?_wellRegionC .');
  });

  it('checks a state region through the same roll-up', () => {
    expect(queries(wells({ stateCode: '23' }), waterBodies()).FIND_TARGET_IRIS).toContain(
      '?_subdivisionC kwg-ont:administrativePartOf+ kwgr:administrativeRegion.USA.23 .',
    );
  });

  it('applies the same check to the chunking probe, so slices match discovery', () => {
    expect(buildEntityProbeQuery(wells(), ['23009'], 10)).toMatch(IN_HANCOCK);
  });
});

// Upstream and downstream build the well binding along other paths: the target
// can lead the body, and a bounded trace wraps its seed in a subquery. The
// hydration check has to land at the top level whichever path ran.
describe('region on wells in a trace', () => {
  const facilities: EntityBlock = { type: 'facilities' };
  const trace = (
    type: 'downstream' | 'upstream',
    maxDistanceKm?: number,
  ): Record<string, string> => {
    const question: AnalysisQuestion = {
      blockA: wells(HANCOCK),
      relationship: { type, ...(maxDistanceKm ? { maxDistanceKm } : {}) },
      blockC: facilities,
    };
    return Object.fromEntries(planPipeline(question).map((s) => [s.type, s.buildQuery(ctx(question))]));
  };
  // Wells are block A: the target of a downstream question, the anchor of an upstream one.
  const cases = [
    ['downstream', undefined, 'HYDRATE_TARGET_BY_IRI'],
    ['downstream', 30, 'HYDRATE_TARGET_BY_IRI'],
    ['upstream', undefined, 'HYDRATE_ANCHOR_BY_IRI'],
    ['upstream', 30, 'HYDRATE_ANCHOR_BY_IRI'],
  ] as const;

  for (const [type, km, hydrate] of cases) {
    const label = `${type}${km ? `, ${km} km` : ''}`;
    it(`${label}: checks the well in both discovery steps`, () => {
      const q = trace(type, km);
      expect(q.FIND_TARGET_IRIS).toMatch(IN_HANCOCK);
      expect(q.FIND_ANCHOR_IRIS).toMatch(IN_HANCOCK);
    });

    it(`${label}: checks the well once, after the OPTIONALs, in well hydration`, () => {
      const q = trace(type, km)[hydrate];
      expect(q.match(/administrativePartOf\+/g)).toHaveLength(1);
      const at = q.indexOf('administrativePartOf+');
      expect(at).toBeGreaterThan(q.lastIndexOf('OPTIONAL'));
      // Top level: every brace opened before the check is closed again, apart
      // from the WHERE block itself.
      const before = q.slice(q.indexOf('WHERE {'), at);
      expect(before.split('{').length - before.split('}').length).toBe(1);
    });
  }
});

describe('no region on wells', () => {
  it('leaves the wells unchecked when only the water bodies carry the region', () => {
    const q = queries(wells(), waterBodies(HANCOCK), 1);
    expect(q.FIND_TARGET_IRIS).not.toContain('administrativePartOf');
    expect(q.HYDRATE_TARGET_BY_IRI).not.toContain('administrativePartOf');
  });

  it('adds nothing for a region on another entity type', () => {
    expect(buildEntityProbeQuery(waterBodies(), ['23009'], 10)).not.toContain('administrativePartOf');
  });
});
