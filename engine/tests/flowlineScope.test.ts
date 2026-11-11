// The supporting flowline layer must be bounded at BOTH ends.
//
// buildFusedFlowlineQuery traces a transitive closure out of the anchor cells.
// Left one-sided it runs to the end of the network, so an anchor near a
// drainage divide drags in the neighbouring basin: "facilities upstream from
// PFOS samples in York County, ME" drew 122 segments of the Merrimack and 21
// of the Winnipesaukee, in a basin no York sample drains from. Nothing looked
// broken -- the map just had extra rivers on it, and they were real rivers.
//
// The fix intersects that closure with the set of flowlines that actually
// reach the resolved targets. This asserts the intersection is present in
// every shape that draws the layer, bounded and unbounded, so a future edit to
// either branch cannot drop it silently.
//
// Inputs are the full shape space rather than tests/questions/ on purpose: the
// point is that no hydrology shape escapes the rule.
//
// No network: the pipeline steps only build query strings.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../types/query';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const HYDROLOGY: SpatialRelationship['type'][] = ['downstream', 'upstream'];
// Unbounded, and one bounded value to cover the aggregate branch.
const DISTANCES: (number | undefined)[] = [undefined, 25];

const context = (): PipelineContext => ({
  question: {} as AnalysisQuestion,
  targetIris: ['https://example.org/t1', 'https://example.org/t2'],
  anchorIris: ['https://example.org/a1', 'https://example.org/a2'],
  results: {},
});

it('every hydrology shape that draws flowlines bounds the layer at both ends', () => {
  let drawn = 0;
  for (const blockA of ENTITY_TYPES) {
    for (const blockC of ENTITY_TYPES) {
      for (const rel of HYDROLOGY) {
        for (const maxDistanceKm of DISTANCES) {
          const question: AnalysisQuestion = {
            blockA: { type: blockA },
            relationship: { type: rel, maxDistanceKm },
            blockC: { type: blockC },
          };
          const step = planPipeline(question).find((s) => s.type === 'GET_FLOWLINE_GEOMETRIES');
          // Skipped when a side is streams: those flowlines are the answer set.
          if (!step) {
            assert.ok(
              blockA === 'streams' || blockC === 'streams',
              `${blockA} ${rel} ${blockC}: no flowline step, but neither side is streams`,
            );
            continue;
          }
          drawn++;
          const sparql = step.buildQuery(context());
          const where = `${blockA} ${rel} ${blockC} ${maxDistanceKm ?? 'unbounded'}`;

          // The target IRIs have to reach the query, or the closure is one-sided.
          assert.ok(
            sparql.includes('https://example.org/t1'),
            `${where}: flowline query does not bind the resolved targets`,
          );
          // Both ends present: a closure out of the anchor cells, and a closure
          // into the targets, joined on ?flowline.
          assert.ok(
            sparql.includes('?_flTarget spatial:connectedTo ?s2celltarget'),
            `${where}: missing the target reach clause`,
          );
          assert.match(
            sparql,
            /\?flowline hyf:downstreamFlowPathTC \?_flTarget|\?_flTarget hyf:downstreamFlowPathTC \?flowline/,
            `${where}: target reach clause does not close on ?flowline`,
          );
          // The reach clause must be a bare TC. hyf:downstreamFlowPathTC is
          // already reflexive, so `TC?` is the same relation spelled more
          // expensively: measured at 0 extra flowlines and +8s.
          // Bare `includes`, not one spelling of the clause, so a reach clause
          // written either way round is still caught. (There used to be an
          // upstream spelling; orientation now lives in engine/question.ts and
          // every reach is written the downstream way.)
          assert.ok(
            !sparql.includes('downstreamFlowPathTC?'),
            `${where}: reflexive target reach, measured to add nothing`,
          );
        }
      }
    }
  }
  // 5 x 5 non-stream pairs x 2 directions x 2 distances. Fewer means shapes
  // stopped drawing the layer, and the loop above would pass by doing nothing.
  assert.equal(drawn, 100);
});
