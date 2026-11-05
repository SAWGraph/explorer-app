// A filtered samples block joins one row per matching measurement, not one per
// sample point. Carried into the spatial join, 407 points in Kennebec +
// Androscoggin became 20,826 rows and "samples ≥ 4 ng/L near wells" did not
// finish in 90s; collapsed to one row per point first, it answered in under
// 3s with the same 407 points (issue #82).
//
// So every fused query must reduce a filtered samples side to
// `SELECT DISTINCT ?sp ?cell` before it meets the other side, with the region
// inside the subquery. Only sample hydration (by IRI) reads measurements.
import { expect, it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import type { AnalysisQuestion, EntityBlock } from '../types/query';

const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const PENOBSCOT_KNOX = { stateCode: '23', countyCodes: ['23019', '23013'] };
const YORK = { stateCode: '23', countyCodes: ['23031'] };
const ge4 = (region?: EntityBlock['region']): EntityBlock => ({
  type: 'samples',
  ...(region ? { region } : {}),
  sampleFilters: { minConcentration: 4 },
});
const pfos = (region?: EntityBlock['region']): EntityBlock => ({
  type: 'samples',
  ...(region ? { region } : {}),
  sampleFilters: { substances: [PFOS] },
});

// Every place a samples side can sit: near and both traces, as block A and as
// block C, anchor-first and target-first order, bounded and unbounded.
const QUESTIONS: [string, AnalysisQuestion][] = [
  ['#82 samples near wells', { blockA: ge4(PENOBSCOT_KNOX), relationship: { type: 'near', hops: 2 }, blockC: { type: 'wells', region: PENOBSCOT_KNOX } }],
  ['wells near samples', { blockA: { type: 'wells', region: PENOBSCOT_KNOX }, relationship: { type: 'near', hops: 2 }, blockC: ge4(PENOBSCOT_KNOX) }],
  ['samples, no region, near wells', { blockA: ge4(), relationship: { type: 'near', hops: 2 }, blockC: { type: 'wells', region: YORK } }],
  ['samples downstream of facilities', { blockA: pfos(YORK), relationship: { type: 'downstream' }, blockC: { type: 'facilities', region: YORK } }],
  ['facilities downstream of samples', { blockA: { type: 'facilities', region: YORK }, relationship: { type: 'downstream', maxDistanceKm: 30 }, blockC: pfos(YORK) }],
  ['facilities upstream from samples, target first', { blockA: { type: 'facilities' }, relationship: { type: 'upstream', maxDistanceKm: 30 }, blockC: pfos(YORK) }],
  ['samples upstream from facilities', { blockA: ge4(YORK), relationship: { type: 'upstream' }, blockC: { type: 'facilities', region: YORK } }],
  ['wells downstream of samples', { blockA: { type: 'wells', region: YORK }, relationship: { type: 'downstream' }, blockC: ge4(YORK) }],
];

const context = (question: AnalysisQuestion): PipelineContext => ({
  question,
  targetIris: ['http://example.org/target/1', 'http://example.org/target/2'],
  anchorIris: ['http://example.org/anchor/1', 'http://example.org/anchor/2'],
  results: {},
});

// The `{ SELECT DISTINCT ?sp… WHERE { … } }` subqueries in a query, found by
// brace matching from each opening `{`.
function distinctSampleBlocks(query: string): string[] {
  const out: string[] = [];
  const re = /\{\s*SELECT DISTINCT \?sp[AC] \?s2\w+ WHERE \{/g;
  for (let m = re.exec(query); m; m = re.exec(query)) {
    let depth = 0;
    for (let i = m.index; i < query.length; i++) {
      if (query[i] === '{') depth++;
      if (query[i] === '}' && --depth === 0) {
        out.push(query.slice(m.index, i + 1));
        break;
      }
    }
  }
  return out;
}

it.each(QUESTIONS)('%s: measurements never reach the spatial join', (_name, question) => {
  // The block hydrated by IRI is the one that legitimately reads measurements.
  const samplesSide =
    (question.relationship.type === 'upstream' ? question.blockC : question.blockA).type === 'samples'
      ? 'HYDRATE_TARGET_BY_IRI'
      : 'HYDRATE_ANCHOR_BY_IRI';
  const ctx = context(question);
  for (const step of planPipeline(question)) {
    if (step.type === samplesSide) continue;
    const query = step.buildQuery(ctx);
    const wraps = distinctSampleBlocks(query);
    let outside = query;
    for (const w of wraps) outside = outside.replace(w, '');
    expect(outside, step.type).not.toContain('coso:observedAtSamplePoint');
    // The filter itself lives inside: dropping it would also pass the line above.
    // Only the discovery steps and the wells step re-derive the join.
    if (step.type.startsWith('FIND_') || query.includes('?wellWKT')) {
      expect(wraps.join('\n'), step.type).toContain('coso:observedAtSamplePoint');
    }
    // A region left outside the subquery would make it list every matching
    // sample in the graph. It has to be the samples side's own region, read off
    // the cell variable the subquery projects.
    const samples = question.blockA.type === 'samples' ? question.blockA : question.blockC;
    for (const w of wraps) {
      const cell = w.match(/SELECT DISTINCT \?sp[AC] (\?s2\w+)/)![1];
      const ownRegion = new RegExp(`\\${cell} spatial:connectedTo (kwgr:administrativeRegion|\\?_region)`);
      expect(ownRegion.test(w), `${step.type}: region inside`).toBe(Boolean(samples.region));
    }
  }
});

// A chunk pin on the samples side goes inside the collapsed subquery and never
// outside it. A bounded trace legitimately carries it twice, once in each copy
// of the seed, and both copies are collapsed.
it.each(QUESTIONS)('%s: a samples chunk pin sits only inside the subquery', (_name, question) => {
  const pin = 'http://example.org/sample/pinned';
  const ctx = context(question);
  const samplesIsTarget =
    (question.relationship.type === 'upstream' ? question.blockC : question.blockA).type === 'samples';
  const scope = samplesIsTarget ? { label: 'x', targetIris: [pin] } : { label: 'x', anchorIris: [pin] };
  for (const step of planPipeline(question).filter((s) => s.type.startsWith('FIND_'))) {
    const query = step.buildQuery(ctx, scope);
    const wraps = distinctSampleBlocks(query).join('\n');
    expect(query.split(pin).length - 1, step.type).toBe(wraps.split(pin).length - 1);
    expect(wraps, step.type).toContain(pin);
  }
});

// Discovery must count only sample points the map can draw. buildSamplesByIri
// keeps a point only if it has a location and a result naming a chemical, and
// a filter that matched an aggregate row such as SUM_PFOA_PFOS drew wells
// around a point the map never showed (#82).
it.each(QUESTIONS)('%s: discovery counts only drawable sample points', (_name, question) => {
  const ctx = context(question);
  for (const step of planPipeline(question).filter((s) => s.type.startsWith('FIND_'))) {
    for (const w of distinctSampleBlocks(step.buildQuery(ctx))) {
      expect(w, `${step.type}: location`).toMatch(/\?sp[AC] geo:hasGeometry/);
      expect(w, `${step.type}: the filtered result names a chemical`).toMatch(/\?observation[AC] coso:observedAtSamplePoint \?sp[AC] ;\s*coso:ofDSSToxSubstance/);
    }
  }
});

it('an unfiltered samples side is held to the location rule', () => {
  const question: AnalysisQuestion = { blockA: { type: 'samples', region: PENOBSCOT_KNOX }, relationship: { type: 'near', hops: 2 }, blockC: { type: 'wells', region: PENOBSCOT_KNOX } };
  const [w] = distinctSampleBlocks(planPipeline(question)[0].buildQuery(context(question)));
  expect(w).toMatch(/\?spC geo:hasGeometry/);
});
