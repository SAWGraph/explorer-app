// Questions that have broken before. Each one is the question as it was asked
// when the bug was found, with `source` pointing at the write-up, so a change
// that moves one of these is a change to something that has already gone wrong
// once.
import type { NamedQuestion } from './representative';

export interface CriticalQuestion extends NamedQuestion {
  source: string;
}

const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const YORK = { stateCode: '23', countyCodes: ['23031'] };
const CUMBERLAND = { stateCode: '23', countyCodes: ['23005'] };
const YORK_AND_CUMBERLAND = { stateCode: '23', countyCodes: ['23031', '23005'] };

export const CRITICAL: CriticalQuestion[] = [
  // Reported by Torsten. Every upstream question returned the relation read
  // backwards: "facilities upstream of stream" gave streams upstream of
  // facilities.
  {
    name: 'facilities upstream from streams',
    source: 'docs/DEBUGGING.md 2026-09-16: "Upstream from" answered the mirror question',
    question: {
      blockA: { type: 'facilities', region: { stateCode: '23' } },
      relationship: { type: 'upstream' },
      blockC: { type: 'streams' },
    },
  },
  // Block A left empty. The query was written anchor side first, so it started
  // from every facility in the graph: 500 out-of-memory, in both county slices.
  {
    name: 'facilities upstream from PFOS samples in York and Cumberland, facilities left empty',
    source: 'docs/DEBUGGING.md 2026-09-17: Two silent filters in the fused queries (join order)',
    question: {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream' },
      blockC: { type: 'samples', region: YORK_AND_CUMBERLAND, sampleFilters: { substances: [PFOS] } },
    },
  },
  // Substance only, non-detects ticked. The coso:measurementUnit join was
  // emitted anyway, and a non-detect has no unit, so every one was dropped.
  {
    name: 'facilities upstream from PFOS samples in Cumberland, non-detects included',
    source: 'docs/DEBUGGING.md 2026-09-17: Two silent filters in the fused queries (unit join)',
    question: {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream' },
      blockC: { type: 'samples', region: CUMBERLAND, sampleFilters: { substances: [PFOS], includeNondetects: true } },
    },
  },
  // Reported from outside the team. The flowline layer traced a one-sided
  // closure and drew the Merrimack, in another state and another watershed.
  {
    name: 'facilities upstream from PFOS samples in York, detections only',
    source: 'docs/DEBUGGING.md 2026-09-19: The stream layer drew rivers in a basin no sample drains from',
    question: {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream' },
      blockC: { type: 'samples', region: YORK, sampleFilters: { substances: [PFOS], includeNondetects: false } },
    },
  },
  // Same question with a flow bound. The bounded trace seeded from the open
  // block A and timed out in query planning for every bound.
  {
    name: 'facilities within 30km upstream from PFOS samples in York, facilities left empty',
    source: 'docs/DEBUGGING.md 2026-09-20: A distance bound failed whenever block A was left open',
    question: {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream', maxDistanceKm: 30 },
      blockC: { type: 'samples', region: YORK, sampleFilters: { substances: [PFOS], includeNondetects: false } },
    },
  },
  // An industry filter with no region made block A count as constrained, so it
  // seeded from every facility in that industry nationwide. The doc does not
  // name the code; 562212 (landfills) stands in for "one code".
  {
    name: 'facilities within 5km upstream from PFOS samples in York, industry filter, no region on facilities',
    source: 'docs/DEBUGGING.md 2026-09-20: Adding an industry filter broke a question that worked',
    question: {
      blockA: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
      relationship: { type: 'upstream', maxDistanceKm: 5 },
      blockC: { type: 'samples', region: YORK, sampleFilters: { substances: [PFOS], includeNondetects: false } },
    },
  },
];
