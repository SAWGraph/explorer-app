// A facilities side (#145). Two rules:
//
// 1. A region holds for the facility itself, not only for the S2 cell it sits
//    in. A cell that crosses the county line touches both counties, so the cell
//    check let in facilities from the next county: Cook 41,150 to 40,299,
//    Cumberland 2,203 to 2,166 (2026-11-16). The same leak #96 fixed for wells
//    and #144 for aquifers. A facility often links to its county and not to a
//    subdivision, so the check takes any region that is or rolls up to the
//    selected one (`administrativePartOf*`), not the wells check (`+`).
// 2. With no industry filter, a facility with no NAICS code is still a
//    facility. About three of every four facilities have none (Cumberland:
//    603 with a code of 2,203).
//
//   npm test                      # query text only, no network
//   LIVE_SPARQL=1 npx vitest run engine/tests/facilityRegion.test.ts   # also federation
import { describe, expect, it } from 'vitest';
import {
  buildEntityCountQuery,
  buildEntityProbeQuery,
  buildFusedHydrologyQuery,
  buildFusedNearQuery,
} from '../templates/fusedQueries';
import { planPipeline } from '../planner';
import { entityFor } from '../entities';
import { executeSparql } from '../endpoint';
import type { AnalysisQuestion, EntityBlock } from '../types/query';

const CUMBERLAND = ['23005'];
const COOK = ['17031'];
const facilities: EntityBlock = { type: 'facilities' };
const landfills: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } };
const samples: EntityBlock = { type: 'samples' };

const flat = (q: string) => q.replace(/\s+/g, ' ');
const facilityInRegion = (facilityVar: string) =>
  new RegExp(`${facilityVar.replace('?', '\\?')} spatial:connectedTo (\\?\\w+) \\. \\1 kwg-ont:administrativePartOf\\* `);
const checksFacility = (q: string, facilityVar: string) => facilityInRegion(facilityVar).test(flat(q));

describe('a region on facilities checks the facility', () => {
  it('on block C, near', () => {
    const q = buildFusedNearQuery({ anchor: samples, target: facilities, targetRegion: CUMBERLAND, hops: 0, project: 'target' });
    expect(checksFacility(q, '?facilityC')).toBe(true);
  });

  it('on block A, near', () => {
    const q = buildFusedNearQuery({ anchor: facilities, target: samples, anchorRegion: CUMBERLAND, hops: 0, project: 'anchor' });
    expect(checksFacility(q, '?facilityA')).toBe(true);
  });

  it('on several counties and on a state, with and without an industry filter', () => {
    for (const region of [['23005', '23031'], ['23']]) {
      for (const block of [facilities, landfills]) {
        const q = buildFusedNearQuery({ anchor: samples, target: block, targetRegion: region, hops: 0, project: 'target' });
        expect(checksFacility(q, '?facilityC')).toBe(true);
      }
    }
  });

  // A trace runs downstream from the anchor (engine/question.ts): facilities
  // are the anchor in "samples downstream of facilities" and the target in
  // "facilities upstream of samples".
  for (const maxDistanceKm of [undefined, 10]) {
    const bounded = maxDistanceKm ? ', bounded' : '';
    it(`a trace, facilities as the anchor${bounded}`, () => {
      const q = buildFusedHydrologyQuery({
        anchor: facilities, target: samples, anchorRegion: CUMBERLAND, maxDistanceKm, project: 'anchor',
      });
      expect(checksFacility(q, '?facilityA')).toBe(true);
    });
    it(`a trace, facilities as the target${bounded}`, () => {
      const q = buildFusedHydrologyQuery({
        anchor: samples, target: facilities, targetRegion: CUMBERLAND, maxDistanceKm, project: 'target',
      });
      expect(checksFacility(q, '?facilityC')).toBe(true);
    });
  }

  it('in the side count and the chunk probe, so they match discovery', () => {
    expect(checksFacility(buildEntityCountQuery(facilities, CUMBERLAND), '?facilityP')).toBe(true);
    expect(checksFacility(buildEntityProbeQuery(facilities, CUMBERLAND, 100), '?facilityP')).toBe(true);
  });

  // Most facilities link to both their subdivision and their county, so the
  // check matches a facility twice: Cook 80,145 rows for 40,299 facilities
  // (2026-11-16). The side is collapsed to one row per facility and cell before
  // the join (0.6s for Cook). A FILTER EXISTS form gave one row but took 7s on
  // every county, and #144 went from 9s to 34s carrying this kind of fan-out
  // into a join.
  it('collapses the side to one row per facility and cell, check inside', () => {
    const region = { stateCode: '23', countyCodes: CUMBERLAND };
    const questions: AnalysisQuestion[] = [];
    for (const block of [facilities, landfills]) {
      const side = { ...block, region };
      questions.push(
        { blockA: side, relationship: { type: 'near', hops: 1 }, blockC: samples },
        { blockA: samples, relationship: { type: 'near', hops: 1 }, blockC: side },
        { blockA: side, relationship: { type: 'downstream', maxDistanceKm: 10 }, blockC: samples },
        { blockA: side, relationship: { type: 'upstream' }, blockC: samples },
      );
    }
    let checked = 0;
    for (const question of questions) {
      for (const step of planPipeline(question, { countSides: false }).filter((s) => s.type.startsWith('FIND_'))) {
        const query = flat(step.buildQuery({ question, targetIris: [], anchorIris: [], results: {} }, undefined));
        const collapsed = /\{ SELECT DISTINCT (\?facility[AC]) \?s2\w+ WHERE \{ (.*?)\} \}/.exec(query);
        expect(collapsed, `${step.type}: facilities side not collapsed`).not.toBeNull();
        expect(checksFacility(collapsed![2], collapsed![1]), `${step.type}: check outside the subquery`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(questions.length * 2);
  });

  it('only when that facilities side has a region', () => {
    expect(flat(buildEntityCountQuery(facilities, undefined))).not.toContain('administrativePartOf');
    const q = buildFusedNearQuery({ anchor: facilities, target: samples, targetRegion: CUMBERLAND, hops: 0, project: 'target' });
    expect(checksFacility(q, '?facilityA')).toBe(false);
  });
});

describe('a facilities side with no industry filter', () => {
  it('finds facilities with no industry code, and only ones the map can draw', () => {
    const side = flat(buildEntityCountQuery(facilities, CUMBERLAND));
    expect(side).not.toContain('fio:ofIndustry');
    expect(side).toMatch(/\?facilityP a fio:Facility ; geo:hasGeometry \?\w+ \./);
  });

  it('is one row per facility and cell, so it is not collapsed when it has no region', () => {
    const question: AnalysisQuestion = { blockA: facilities, relationship: { type: 'near', hops: 1 }, blockC: samples };
    let checked = 0;
    for (const step of planPipeline(question, { countSides: false }).filter((s) => s.type.startsWith('FIND_'))) {
      const query = flat(step.buildQuery({ question, targetIris: [], anchorIris: [], results: {} }, undefined));
      expect(query, step.type).not.toMatch(/SELECT DISTINCT \?facility[AC] \?s2/);
      checked++;
    }
    expect(checked).toBe(2);
  });

  it('keeps the industry code requirement when a filter is set', () => {
    const side = flat(buildEntityCountQuery(landfills, CUMBERLAND));
    expect(side).toContain('?facilityP fio:ofIndustry ?industryCodeP . ?industryCodeP a naics:NAICS-IndustryCode .');
    expect(side).toContain('naics:NAICS-562212');
  });
});

describe('facility details', () => {
  const details = entityFor('facilities').details;
  if (details.kind !== 'by-iri') throw new Error('facilities load by IRI');
  const IRI = 'http://w3id.org/fio/v1/epa-frs-data#d.FRS-Facility.110000568840';

  it('load a facility with no industry code when there is no filter', () => {
    const q = flat(details.buildQuery([IRI], facilities));
    expect(q).toMatch(/OPTIONAL \{ \?facility fio:ofIndustry \?industryCode \. \?industryCode a naics:NAICS-IndustryCode ; rdfs:label \?industryName \. \}/);
    expect(q).toContain('?facility geo:hasGeometry/geo:asWKT ?facWKT ; rdfs:label ?facilityName .');
  });

  it('require a matching code when a filter is set', () => {
    const q = flat(details.buildQuery([IRI], landfills));
    expect(q).not.toContain('OPTIONAL');
    expect(q).toContain('?facility fio:ofIndustry ?industryCode');
    expect(q).toContain('naics:NAICS-562212');
  });
});

// Side counts measured on federation on 2026-11-16. They move if the graph is
// reloaded. Cell check only, every facility with a geometry: Cumberland 2,203,
// Cook 41,150. With a code only, before #145: Cumberland 676, Cook 7,208.
describe.skipIf(!process.env.LIVE_SPARQL)('on federation', () => {
  const count = async (q: string) => Number((await executeSparql('federation', q))[0]?.count ?? 0);

  it('Cumberland: every facility in the county, coded or not, by its own region link', async () => {
    expect(await count(buildEntityCountQuery(facilities, CUMBERLAND))).toBe(2166);
  }, 60_000);

  it('Cook: the same', async () => {
    expect(await count(buildEntityCountQuery(facilities, COOK))).toBe(40299);
  }, 60_000);

  it('details load a facility with no industry code', async () => {
    const details = entityFor('facilities').details;
    if (details.kind !== 'by-iri') throw new Error('facilities load by IRI');
    const rows = await executeSparql('federation', details.buildQuery(['http://w3id.org/fio/v1/epa-frs-data#d.FRS-Facility.110000568840'], facilities));
    expect(rows[0]?.facilityName).toBe('SEBAGO LAKE WATER TREATMENT FACILITY');
    expect(rows[0]?.industryCode).toBeUndefined();
  }, 60_000);
});
