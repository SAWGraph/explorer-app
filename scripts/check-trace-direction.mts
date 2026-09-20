// Self-check for the direction of every hydrology trace the planner can build
// (src/engine/planner.ts, src/engine/templates/fusedQueries.ts).
//
//   npx tsx scripts/check-trace-direction.mts
//
// The templates trace one way only: the target comes out `direction` of the
// anchor, seeded from the anchor's S2 cells. The planner puts the anchor on the
// upstream side of the question — block C for "A downstream from C", block A
// for "A upstream from C" — so every trace it builds must run *downstream from
// the seed*. Pairing anchor=blockA with direction='upstream', which the planner
// did until 2026-09-16, answered the mirror question for all 36 upstream
// shapes, and nothing in the app looked wrong enough to catch it: both layers
// still rendered, still near the right rivers.
//
// Three builders trace, and a question can use all three at once (discovery,
// the supporting flowline layer, and well hydration, which re-derives the trace
// server-side instead of hydrating by IRI). They have to agree, so this checks
// the SPARQL they emit rather than the direction flag they were handed.
//
// No network: the pipeline steps only build query strings.
import assert from 'node:assert/strict';
import { planPipeline, type PipelineContext } from '../src/engine/planner';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../src/types/query';

const ENTITY_TYPES: EntityType[] = [
  'samples',
  'facilities',
  'waterBodies',
  'wells',
  'aquifers',
  'streams',
];
const HYDROLOGY: SpatialRelationship['type'][] = ['downstream', 'upstream'];

// Every way the templates write the transitive closure. The chain variable that
// comes *first* is the upstream one, so the seed has to be on the left.
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

// `?_flEnd hyf:downstreamFlowPathTC ?_flMid` used to sit in REVERSED. It cannot
// any more: a bounded block seeded from the target writes that exact triple
// while tracing perfectly correctly, because it walks outward from the target
// instead of from the anchor. One string is now correct or reversed depending
// on which side seeds, so the queries that name both ends are checked by
// reachability instead, which is what the string was standing in for.
//
// Both predicates carry direction, and `?a <pred> ?b` always means a flows into
// b: hyf:downstreamFlowPathTC is the closure, hyf:downstreamFlowPath? is one
// segment. Subject-first triples only, which is every trace in the discovery
// and well queries; the flowline layer writes one of its closures in a
// predicate-object list and keeps the string check above.
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

const context = (): PipelineContext => ({
  question: {} as AnalysisQuestion,
  // The flowline step traces from the anchors discovery resolved; give it two
  // so its query is built rather than skipped.
  targetIris: ['https://example.org/t1', 'https://example.org/t2'],
  anchorIris: ['https://example.org/a1', 'https://example.org/a2'],
  results: {},
});

let checks = 0;
let combinations = 0;

for (const a of ENTITY_TYPES) {
  for (const c of ENTITY_TYPES) {
    for (const rel of HYDROLOGY) {
      for (const maxDistanceKm of [undefined, 30]) {
        const question: AnalysisQuestion = {
          blockA: { type: a, region: { stateCode: '23' } },
          relationship: { type: rel, ...(maxDistanceKm ? { maxDistanceKm } : {}) },
          blockC: { type: c },
        };
        const where = `${a} ${rel} ${c}${maxDistanceKm ? ` (${maxDistanceKm}km)` : ''}`;
        combinations++;

        let traced = 0;
        for (const step of planPipeline(question)) {
          const sparql = step.buildQuery(context());
          if (!sparql.includes('downstreamFlowPathTC')) continue;
          traced++;

          if (sparql.includes('?upstream_flowline') && sparql.includes('?ds_flowline')) {
            // The anchor's flowline has to reach the target's, whichever end
            // the bounded block seeds from. This is the property the whole
            // direction rule exists to protect: pairing anchor=blockA with
            // direction='upstream' reverses the chain and fails here.
            assert.ok(
              flowsInto(sparql, '?upstream_flowline', '?ds_flowline'),
              `${step.type} has no directed path from the anchor's flowline to the target's: ${where}`,
            );
            checks++;
          } else {
            for (const pattern of REVERSED) {
              assert.ok(
                !sparql.includes(pattern),
                `${step.type} traces upstream from the seed ("${pattern}"): ${where}`,
              );
              checks++;
            }
            assert.ok(
              FORWARD.some((pattern) => sparql.includes(pattern)),
              `${step.type} has no recognisable trace pattern: ${where}`,
            );
            checks++;
          }
        }

        // A hydrology question that traced nowhere would pass the loop above
        // by doing nothing at all.
        assert.ok(traced > 0, `no step traced: ${where}`);
        checks++;
      }
    }
  }
}

// And the relationship the user picked must still reach the templates intact:
// 'near' never traces.
for (const a of ENTITY_TYPES) {
  for (const c of ENTITY_TYPES) {
    const question: AnalysisQuestion = {
      blockA: { type: a, region: { stateCode: '23' } },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: c },
    };
    combinations++;
    for (const step of planPipeline(question)) {
      assert.ok(
        !step.buildQuery(context()).includes('downstreamFlowPathTC'),
        `near question traces flow paths: ${a} near ${c} (${step.type})`,
      );
      checks++;
    }
  }
}

console.log(`trace direction: ${combinations} combinations, ${checks} checks passed`);
