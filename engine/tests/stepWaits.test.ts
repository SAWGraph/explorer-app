// What each planned step waits for (engine/planner.ts, `after`). The executor
// starts a step as soon as everything it waits for is done, so this is the
// whole schedule of a run: get it wrong and a step reads IRIs that are not
// there yet (an empty VALUES list, a silently empty layer), or decoration
// holds up the answer again.
//
// Inputs are the full shape space on purpose: which step returns block A flips
// for upstream, and stream lines are planned only for traces without streams.
//
// No network: planPipeline only builds steps.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { planPipeline, type PipelineStep, type PipelineStepType } from '../planner';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../types/query';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];

const question = (a: EntityType, rel: SpatialRelationship['type'], c: EntityType, withRegion: boolean): AnalysisQuestion =>
  ({
    blockA: withRegion ? { type: a, region: { stateCode: '23' } } : { type: a },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}) },
    blockC: { type: c },
  }) as AnalysisQuestion;

// Every step a step waits for, directly or through the steps it waits for.
const waitsFor = (steps: PipelineStep[], type: PipelineStepType): Set<PipelineStepType> => {
  const seen = new Set<PipelineStepType>();
  const visit = (t: PipelineStepType) => {
    for (const before of steps.find((s) => s.type === t)?.after ?? []) {
      if (!seen.has(before)) {
        seen.add(before);
        visit(before);
      }
    }
  };
  visit(type);
  return seen;
};

it('every step waits only for what it reads, and decoration holds up nothing', () => {
  let plans = 0;
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of RELATIONSHIPS) {
        for (const withRegion of [true, false]) {
          const steps = planPipeline(question(a, rel, c, withRegion));
          const where = `${a} ${rel} ${c}${withRegion ? ' [ME]' : ''}`;
          const planned = steps.map((s) => s.type);
          plans++;

          steps.forEach((step, i) => {
            // Only steps planned before it: no waiting on a step that is never
            // planned, and no two steps waiting on each other.
            for (const before of step.after) {
              assert.ok(planned.slice(0, i).includes(before), `${step.type} waits for ${before}, not planned before it: ${where}`);
            }
            // Decoration is optional: a main step that waited for it would wait
            // for something the answer does not need.
            if (!step.optional) {
              for (const before of waitsFor(steps, step.type)) {
                assert.ok(!steps.find((s) => s.type === before)?.optional, `${step.type} waits for decoration ${before}: ${where}`);
              }
            }
          });

          // Details load the IRIs their side's discovery found.
          const all = (type: PipelineStepType) => waitsFor(steps, type);
          assert.ok(all('HYDRATE_TARGET_BY_IRI').has('FIND_TARGET_IRIS'), `target details before target found: ${where}`);
          assert.ok(all('HYDRATE_ANCHOR_BY_IRI').has('FIND_ANCHOR_IRIS'), `anchor details before anchors found: ${where}`);

          // Stream lines trace from the anchors and stop at the targets.
          const flowlines = steps.find((s) => s.type === 'GET_FLOWLINE_GEOMETRIES');
          if (flowlines) {
            assert.deepEqual([...flowlines.after].sort(), ['FIND_ANCHOR_IRIS', 'FIND_TARGET_IRIS'], where);
          }

          // Boundaries need only the state, so they start with the run.
          const boundaries = steps.find((s) => s.type === 'GET_REGION_BOUNDARIES');
          if (boundaries) assert.deepEqual(boundaries.after, [], where);
          assert.equal(Boolean(boundaries), withRegion, `boundaries planned iff a region is set: ${where}`);

          // Both sides are counted first, together, and discovery waits for
          // both: a side counted at 0 ends the run before any discovery query.
          for (const count of ['COUNT_TARGET', 'COUNT_ANCHOR'] as const) {
            assert.deepEqual(steps.find((s) => s.type === count)?.after, [], `${count} starts with the run: ${where}`);
            assert.ok(all('FIND_TARGET_IRIS').has(count), `discovery before ${count}: ${where}`);
          }

          // Without counts (countSides: false) discovery starts the run.
          const uncounted = planPipeline(question(a, rel, c, withRegion), { countSides: false });
          assert.ok(!uncounted.some((s) => s.type.startsWith('COUNT_')), `counted with countSides off: ${where}`);
          assert.deepEqual(uncounted.find((s) => s.type === 'FIND_TARGET_IRIS')?.after, [], where);
        }
      }
    }
  }
  assert.equal(plans, ENTITY_TYPES.length * ENTITY_TYPES.length * RELATIONSHIPS.length * 2);
});
