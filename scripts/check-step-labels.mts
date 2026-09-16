// Self-check for the user-facing pipeline step labels (src/engine/planner.ts).
//
//   npx tsx scripts/check-step-labels.mts
//
// The dashboard exercises 4 of the 108 entity x entity x relationship shapes
// the editor can build, and never exercises `upstream` at all. That matters
// here because the planner's anchor/target mapping flips for `upstream`: the
// step that returns block A is FIND_TARGET_IRIS for near and downstream, and
// FIND_ANCHOR_IRIS for upstream. A label keyed off the target/anchor role
// instead of off the block the step returns comes out swapped for a third of
// the question space, and nothing in the app would catch it.
//
// No network: planPipeline only builds query strings.
import assert from 'node:assert/strict';
import { planPipeline } from '../src/engine/planner';
import { entityTypeLabel } from '../src/utils/questionGenerator';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../src/types/query';

const ENTITY_TYPES: EntityType[] = [
  'samples',
  'facilities',
  'waterBodies',
  'wells',
  'aquifers',
  'streams',
];
// The three RelationshipSelector offers. 'within' is in the type union but is
// never selectable and never planned for.
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];

const question = (
  a: EntityType,
  rel: SpatialRelationship['type'],
  c: EntityType,
  withRegion = true,
): AnalysisQuestion =>
  ({
    blockA: withRegion ? { type: a, region: { stateCode: '23' } } : { type: a },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}) },
    blockC: { type: c },
  }) as AnalysisQuestion;

let checks = 0;
let combinations = 0;

for (const a of ENTITY_TYPES) {
  for (const c of ENTITY_TYPES) {
    for (const rel of RELATIONSHIPS) {
      const where = `${a} ${rel} ${c}`;
      const steps = planPipeline(question(a, rel, c));
      combinations++;

      const labels = steps.map((s) => s.description);

      // Nothing unlabelled, and no raw camelCase type name leaking through.
      for (const label of labels) {
        assert.ok(label.trim().length > 0, `empty description: ${where}`);
        for (const type of ENTITY_TYPES) {
          if (type !== entityTypeLabel(type)) {
            assert.ok(!label.includes(type), `raw type name "${type}" in "${label}": ${where}`);
          }
        }
      }

      // Both discovery labels name both blocks.
      const aLabel = entityTypeLabel(a);
      const cLabel = entityTypeLabel(c);
      const target = steps.find((s) => s.type === 'FIND_TARGET_IRIS')!;
      const anchor = steps.find((s) => s.type === 'FIND_ANCHOR_IRIS')!;
      for (const step of [target, anchor]) {
        assert.ok(
          step.description.includes(aLabel) && step.description.includes(cLabel),
          `discovery label names only one block: "${step.description}" (${where})`,
        );
      }

      // The step that returns block A carries the block-A phrasing. This is the
      // assertion that catches the upstream flip: "with ... them" marks the
      // step that returns block C.
      const returnsBlockA = rel === 'upstream' ? anchor : target;
      const returnsBlockC = rel === 'upstream' ? target : anchor;
      assert.ok(
        !returnsBlockA.description.includes(' with '),
        `step returning block A got the block C phrasing: "${returnsBlockA.description}" (${where})`,
      );
      assert.ok(
        returnsBlockC.description.includes(' with '),
        `step returning block C got the block A phrasing: "${returnsBlockC.description}" (${where})`,
      );

      // Hydrate labels name their own entity type and drop the planner jargon.
      for (const step of steps) {
        if (step.type === 'HYDRATE_TARGET_BY_IRI' || step.type === 'HYDRATE_ANCHOR_BY_IRI') {
          assert.ok(
            !/\b(target|anchor)\b/.test(step.description),
            `planner jargon in "${step.description}": ${where}`,
          );
        }
      }

      // Step set, per the conditions in buildFusedSteps. Pinned so a label
      // change is never mistaken for a step change.
      const types = steps.map((s) => s.type);
      const wantsFlowlines = rel !== 'near' && a !== 'streams' && c !== 'streams';
      assert.equal(
        types.includes('GET_FLOWLINE_GEOMETRIES'),
        wantsFlowlines,
        `flowline step presence wrong: ${where}`,
      );
      assert.ok(types.includes('GET_REGION_BOUNDARIES'), `region step missing: ${where}`);
      assert.equal(steps.length, wantsFlowlines ? 6 : 5, `step count wrong: ${where}`);

      // Without a region the boundary step goes away, and 4 is the floor.
      const noRegion = planPipeline(question(a, rel, c, false));
      assert.ok(
        !noRegion.some((s) => s.type === 'GET_REGION_BOUNDARIES'),
        `region step present without a region: ${where}`,
      );
      assert.equal(noRegion.length, wantsFlowlines ? 5 : 4, `step count wrong, no region: ${where}`);

      checks += 6;
    }
  }
}

// The reported question, spelled out. planner.ts maps downstream to
// anchor=blockC, so FIND_TARGET_IRIS is the step that returns the samples.
const reported = planPipeline({
  blockA: { type: 'samples', region: { stateCode: '18' } },
  relationship: { type: 'downstream' },
  blockC: { type: 'facilities', facilityFilters: { industryCodes: ['488119', '481111'] } },
} as AnalysisQuestion);
assert.deepEqual(
  reported.map((s) => s.description),
  [
    'Finding samples downstream of facilities',
    'Finding facilities with samples downstream of them',
    'Loading downstream stream geometries',
    'Loading details for samples',
    'Loading details for facilities',
    'Loading region boundaries',
  ],
);
checks++;

// Same question upstream: the labels must swap steps, not swap words.
const up = planPipeline({
  blockA: { type: 'samples', region: { stateCode: '18' } },
  relationship: { type: 'upstream' },
  blockC: { type: 'facilities' },
} as AnalysisQuestion);
assert.equal(
  up.find((s) => s.type === 'FIND_ANCHOR_IRIS')!.description,
  'Finding samples upstream from facilities',
);
assert.equal(
  up.find((s) => s.type === 'FIND_TARGET_IRIS')!.description,
  'Finding facilities with samples upstream from them',
);
checks += 2;

// One sample of the table, for the eyeball pass that assertions cannot do.
if (process.argv.includes('--print')) {
  for (const rel of RELATIONSHIPS) {
    for (const [a, c] of [
      ['samples', 'facilities'],
      ['waterBodies', 'facilities'],
      ['facilities', 'facilities'],
      ['streams', 'wells'],
    ] as [EntityType, EntityType][]) {
      console.log(`\n${a} ${rel} ${c}`);
      for (const [i, s] of planPipeline(question(a, rel, c)).entries()) {
        console.log(`  Step ${i + 1}: ${s.description}`);
      }
    }
  }
}

console.log(
  `step labels: ${combinations} combinations, ${checks} checks passed (--print to see the labels)`,
);
