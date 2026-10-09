// The distance-bounded downstream trace, run end to end through the real
// planner and executor against the live endpoints.
//
//   npm run test:live
//
// Reference values come from UC1_CQ2c (New Hampshire, NAICS 488119 airports,
// 30 km): the notebook returns 162 flowlines, but only because it requires
// schema1:address on facilities, a predicate 13 of 144 NH airport facilities
// have. Without that accidental filter its answer is 1,547 flowlines, and ours
// is a superset of exactly that set (we also expand to neighbouring S2 cells
// and add the "+1" segment past the cutoff).
//
// Skipped unless LIVE=1. Was scripts/flow-distance-check.mjs.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { planPipeline } from './planner';
import { executePipeline } from './executor';
import type { AnalysisQuestion } from '../types/query';

// "What streams are within 30 km downstream of 488119 (Airports) facilities in
// New Hampshire?", the notebook's question in the app's model.
const question: AnalysisQuestion = {
  blockA: { type: 'streams' },
  relationship: { type: 'downstream', maxDistanceKm: 30 },
  blockC: { type: 'facilities', region: { stateCode: '33' }, facilityFilters: { industryCodes: ['488119'] } },
};

describe.skipIf(!process.env.LIVE)('flow-distance bound, NH airports within 30 km', () => {
  test('bounded trace is a superset of the notebook, a subset of the unbounded trace, and drawable', { timeout: 600_000 }, async () => {
    const steps = planPipeline(question);
    // The answer set *is* the flowlines, so the supporting stream layer is skipped.
    assert.ok(!steps.some((s) => s.type === 'GET_FLOWLINE_GEOMETRIES'), 'expected no supporting flowline step');

    const bounded = await executePipeline(steps, question, () => {});
    assert.equal(bounded.status, 'success', JSON.stringify(bounded));
    if (bounded.status !== 'success') return;
    // Optional steps (the region outline) may drop out; the trace may not.
    const optional = new Set(steps.filter((s) => s.optional).map((s) => s.description));
    assert.deepEqual(bounded.partial?.filter((p) => !optional.has(p.step)) ?? [], [], 'part of the bounded answer is missing');
    const streams = new Set(bounded.data.FIND_TARGET_IRIS.map((r) => r.iri)).size;
    assert.ok(streams > 1547, `expected a superset of the notebook's 1547, got ${streams}`);

    // Every hydrated stream carries geometry the map can draw.
    const hydrated = bounded.data.HYDRATE_TARGET_BY_IRI ?? [];
    assert.ok(hydrated.length > 0, 'no hydrated streams');
    assert.ok(hydrated.every((r) => r.flowlineWKT?.startsWith('LINESTRING')), 'hydrated streams missing LINESTRING geometry');

    // The bound has to actually bind: unbounded, this trace runs further.
    // Observed 2026-08: 2784 bounded (2757 within the cutoff + 27 fringe) vs
    // 3490 unbounded.
    const open = { ...question, relationship: { type: 'downstream' as const } };
    const unbounded = await executePipeline(planPipeline(open).slice(0, 1), open, () => {});
    assert.equal(unbounded.status, 'success');
    if (unbounded.status !== 'success') return;
    const unboundedStreams = new Set(unbounded.data.FIND_TARGET_IRIS.map((r) => r.iri)).size;
    assert.ok(unboundedStreams > streams, `bound had no effect: ${streams} bounded vs ${unboundedStreams} unbounded`);
  });
});
