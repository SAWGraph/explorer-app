// The wells-details step re-derives the whole join, which yields one row per
// well and every entity it is near. Attaching the well columns to that fan-out
// made "samples near wells in Penobscot and Knox" ask for 3.2 GB and fail
// (issue #82). The join must collapse to one row per well and cell first, and
// the columns attach outside it.
import { expect, it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import type { AnalysisQuestion } from '../types/query';

const PK = { stateCode: '23', countyCodes: ['23019', '23013'] };
const QUESTIONS: [string, AnalysisQuestion][] = [
  ['samples near wells', { blockA: { type: 'samples', region: PK }, relationship: { type: 'near', hops: 2 }, blockC: { type: 'wells', region: PK } }],
  ['wells near facilities', { blockA: { type: 'wells', region: PK }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities', region: PK } }],
  ['wells downstream of facilities', { blockA: { type: 'wells', region: PK }, relationship: { type: 'downstream' }, blockC: { type: 'facilities', region: PK } }],
  ['facilities upstream from wells', { blockA: { type: 'facilities', region: PK }, relationship: { type: 'upstream', maxDistanceKm: 30 }, blockC: { type: 'wells', region: PK } }],
];

it.each(QUESTIONS)('%s: the join collapses to one row per well before columns attach', (_name, question) => {
  const ctx: PipelineContext = { question, targetIris: [], anchorIris: [], results: {} };
  const query = planPipeline(question)
    .map((s) => s.buildQuery(ctx))
    .find((q) => q.includes('?wellWKT'))!;
  const open = query.match(/\{\s*SELECT DISTINCT (\?well[AC]) \?s2(anchor|target) WHERE \{/);
  expect(open, 'collapsed well subquery').not.toBeNull();
  // Everything spatial sits inside the subquery; the geometry sits after it.
  const inner = query.slice(open!.index!, query.indexOf(`${open![1]} geo:hasGeometry`));
  expect(inner).toMatch(/kwg-ont:sfTouches|hyf:downstreamFlowPathTC/);
  expect(query.indexOf(`${open![1]} geo:hasGeometry`)).toBeGreaterThan(open!.index!);
  expect(inner).not.toContain('geo:hasGeometry');
});
