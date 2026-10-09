// What the planner builds for every question shape the editor allows: which way
// the hydrology traces run, how far the flowline layer reaches, and what the
// pipeline steps are called. No network: planPipeline only builds query strings.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { planPipeline, type PipelineContext } from './planner';
import { entityTypeLabel } from '../utils/questionGenerator';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../types/query';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const HYDROLOGY: SpatialRelationship['type'][] = ['downstream', 'upstream'];
// The three RelationshipSelector offers. 'within' is in the type union but is
// never selectable and never planned for.
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];

const context = (): PipelineContext => ({
  question: {} as AnalysisQuestion,
  // The flowline step traces from the anchors discovery resolved; give it two
  // so its query is built rather than skipped.
  targetIris: ['https://example.org/t1', 'https://example.org/t2'],
  anchorIris: ['https://example.org/a1', 'https://example.org/a2'],
  results: {},
});

// The templates trace one way only: the target comes out `direction` of the
// anchor, seeded from the anchor's S2 cells. The planner puts the anchor on the
// upstream side of the question (block C for "A downstream from C", block A for
// "A upstream from C"), so every trace it builds must run *downstream from the
// seed*. Pairing anchor=blockA with direction='upstream', which the planner did
// until 2026-09-16, answered the mirror question for all 36 upstream shapes,
// and nothing in the app looked wrong enough to catch it: both layers still
// rendered, still near the right rivers.
//
// Three builders trace, and a question can use all three at once (discovery,
// the supporting flowline layer, and well hydration, which re-derives the trace
// server-side instead of hydrating by IRI). They have to agree, so this checks
// the SPARQL they emit rather than the direction flag they were handed.
describe('trace direction', () => {
  // Every way the templates write the transitive closure. The chain variable
  // that comes *first* is the upstream one, so the seed has to be on the left.
  const FORWARD = [
    '?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline', // discovery, unbounded
    '?upstream_flowline hyf:downstreamFlowPathTC ?_flMid', // discovery, bounded
    '?_flSeed hyf:downstreamFlowPathTC ?_flMid', // flowline layer, bounded
    'hyf:downstreamFlowPathTC ?flowline', // flowline layer, unbounded
  ];
  const REVERSED = [
    '?ds_flowline hyf:downstreamFlowPathTC ?upstream_flowline',
    '?flowline hyf:downstreamFlowPathTC ?downstream_flowline',
  ];

  // `?_flEnd hyf:downstreamFlowPathTC ?_flMid` used to sit in REVERSED. It
  // cannot any more: a bounded block seeded from the target writes that exact
  // triple while tracing perfectly correctly, because it walks outward from the
  // target instead of from the anchor. One string is now correct or reversed
  // depending on which side seeds, so the queries that name both ends are
  // checked by reachability instead, which is what the string was standing in
  // for.
  //
  // Both predicates carry direction, and `?a <pred> ?b` always means a flows
  // into b: hyf:downstreamFlowPathTC is the closure, hyf:downstreamFlowPath? is
  // one segment. Subject-first triples only, which is every trace in the
  // discovery and well queries; the flowline layer writes one of its closures
  // in a predicate-object list and keeps the string check above.
  const FLOW_EDGE = /(\?\w+)\s+hyf:downstreamFlowPath(?:TC)?\??\s+(\?\w+)/g;

  function flowsInto(sparql: string, from: string, to: string): boolean {
    const edges = new Map<string, Set<string>>();
    for (const [, a, b] of sparql.matchAll(FLOW_EDGE)) {
      if (!edges.has(a)) edges.set(a, new Set());
      edges.get(a)!.add(b);
    }
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const v = queue.shift()!;
      if (v === to) return true;
      for (const n of edges.get(v) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return false;
  }

  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of HYDROLOGY) {
        for (const maxDistanceKm of [undefined, 30]) {
          const where = `${a} ${rel} ${c}${maxDistanceKm ? ` (${maxDistanceKm}km)` : ''}`;
          test(where, () => {
            const question: AnalysisQuestion = {
              blockA: { type: a, region: { stateCode: '23' } },
              relationship: { type: rel, ...(maxDistanceKm ? { maxDistanceKm } : {}) },
              blockC: { type: c },
            };
            let traced = 0;
            for (const step of planPipeline(question)) {
              const sparql = step.buildQuery(context());
              if (!sparql.includes('downstreamFlowPathTC')) continue;
              traced++;

              if (sparql.includes('?upstream_flowline') && sparql.includes('?ds_flowline')) {
                // The anchor's flowline has to reach the target's, whichever
                // end the bounded block seeds from. This is the property the
                // whole direction rule exists to protect: pairing anchor=blockA
                // with direction='upstream' reverses the chain and fails here.
                assert.ok(
                  flowsInto(sparql, '?upstream_flowline', '?ds_flowline'),
                  `${step.type} has no directed path from the anchor's flowline to the target's: ${where}`,
                );
              } else {
                for (const pattern of REVERSED) {
                  assert.ok(!sparql.includes(pattern), `${step.type} traces upstream from the seed ("${pattern}"): ${where}`);
                }
                assert.ok(
                  FORWARD.some((pattern) => sparql.includes(pattern)),
                  `${step.type} has no recognisable trace pattern: ${where}`,
                );
              }
            }
            // A hydrology question that traced nowhere would pass the loop
            // above by doing nothing at all.
            assert.ok(traced > 0, `no step traced: ${where}`);
          });
        }
      }
    }
  }

  // And the relationship the user picked must still reach the templates
  // intact: 'near' never traces.
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      test(`${a} near ${c} never traces`, () => {
        const question: AnalysisQuestion = {
          blockA: { type: a, region: { stateCode: '23' } },
          relationship: { type: 'near', hops: 1 },
          blockC: { type: c },
        };
        for (const step of planPipeline(question)) {
          assert.ok(
            !step.buildQuery(context()).includes('downstreamFlowPathTC'),
            `near question traces flow paths: ${a} near ${c} (${step.type})`,
          );
        }
      });
    }
  }
});

// The supporting flowline layer must be bounded at BOTH ends.
//
// buildFusedFlowlineQuery traces a transitive closure out of the anchor cells.
// Left one-sided it runs to the end of the network, so an anchor near a
// drainage divide drags in the neighbouring basin: "facilities upstream from
// PFOS samples in York County, ME" drew 122 segments of the Merrimack and 21 of
// the Winnipesaukee, in a basin no York sample drains from. Nothing looked
// broken; the map just had extra rivers on it, and they were real rivers.
//
// The fix intersects that closure with the set of flowlines that actually reach
// the resolved targets. This asserts the intersection is present in every
// shape that draws the layer, bounded and unbounded, so a future edit to either
// branch cannot drop it silently.
describe('flowline scope', () => {
  // Unbounded, and one bounded value to cover the aggregate branch.
  const DISTANCES: (number | undefined)[] = [undefined, 25];

  for (const blockA of ENTITY_TYPES) {
    for (const blockC of ENTITY_TYPES) {
      for (const rel of HYDROLOGY) {
        for (const maxDistanceKm of DISTANCES) {
          const where = `${blockA} ${rel} ${blockC} ${maxDistanceKm ?? 'unbounded'}`;
          test(where, () => {
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
              return;
            }
            const sparql = step.buildQuery(context());

            // The target IRIs have to reach the query, or the closure is one-sided.
            assert.ok(sparql.includes('https://example.org/t1'), `${where}: flowline query does not bind the resolved targets`);
            // Both ends present: a closure out of the anchor cells, and a
            // closure into the targets, joined on ?flowline.
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
            // Bare `includes`, not the downstream spelling: the form is
            // `?flowline TC? ?_flTarget` downstream and `?_flTarget TC?
            // ?flowline` upstream, and matching only the first left the
            // upstream shape unguarded by a check whose whole point is the
            // `TC?` regression.
            assert.ok(!sparql.includes('downstreamFlowPathTC?'), `${where}: reflexive target reach, measured to add nothing`);
          });
        }
      }
    }
  }
});

// The user-facing step labels.
//
// The dashboard exercises 4 of the 108 entity x entity x relationship shapes
// the editor can build, and never exercises `upstream` at all. That matters
// here because the planner's anchor/target mapping flips for `upstream`: the
// step that returns block A is FIND_TARGET_IRIS for near and downstream, and
// FIND_ANCHOR_IRIS for upstream. A label keyed off the target/anchor role
// instead of off the block the step returns comes out swapped for a third of
// the question space, and nothing in the app would catch it.
describe('step labels', () => {
  const question = (a: EntityType, rel: SpatialRelationship['type'], c: EntityType, withRegion = true): AnalysisQuestion =>
    ({
      blockA: withRegion ? { type: a, region: { stateCode: '23' } } : { type: a },
      relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}) },
      blockC: { type: c },
    }) as AnalysisQuestion;

  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of RELATIONSHIPS) {
        const where = `${a} ${rel} ${c}`;
        test(where, () => {
          const steps = planPipeline(question(a, rel, c));
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

          // The step that returns block A carries the block-A phrasing. This is
          // the assertion that catches the upstream flip: "with ... them" marks
          // the step that returns block C.
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
              assert.ok(!/\b(target|anchor)\b/.test(step.description), `planner jargon in "${step.description}": ${where}`);
            }
          }

          // Step set, per the conditions in buildFusedSteps. Pinned so a label
          // change is never mistaken for a step change.
          const types = steps.map((s) => s.type);
          const wantsFlowlines = rel !== 'near' && a !== 'streams' && c !== 'streams';
          assert.equal(types.includes('GET_FLOWLINE_GEOMETRIES'), wantsFlowlines, `flowline step presence wrong: ${where}`);
          assert.ok(types.includes('GET_REGION_BOUNDARIES'), `region step missing: ${where}`);
          assert.equal(steps.length, wantsFlowlines ? 6 : 5, `step count wrong: ${where}`);

          // Without a region the boundary step goes away, and 4 is the floor.
          const noRegion = planPipeline(question(a, rel, c, false));
          assert.ok(!noRegion.some((s) => s.type === 'GET_REGION_BOUNDARIES'), `region step present without a region: ${where}`);
          assert.equal(noRegion.length, wantsFlowlines ? 5 : 4, `step count wrong, no region: ${where}`);
        });
      }
    }
  }

  // The reported question, spelled out. planner.ts maps downstream to
  // anchor=blockC, so FIND_TARGET_IRIS is the step that returns the samples.
  test('the reported question, downstream', () => {
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
  });

  // Same question upstream: the labels must swap steps, not swap words.
  test('the reported question, upstream', () => {
    const up = planPipeline({
      blockA: { type: 'samples', region: { stateCode: '18' } },
      relationship: { type: 'upstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion);
    assert.equal(up.find((s) => s.type === 'FIND_ANCHOR_IRIS')!.description, 'Finding samples upstream from facilities');
    assert.equal(up.find((s) => s.type === 'FIND_TARGET_IRIS')!.description, 'Finding facilities with samples upstream from them');
  });
});
