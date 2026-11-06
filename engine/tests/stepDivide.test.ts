// Splitting a refused step only helps if each slice asks for less.
//
// The wells details step re-derives the well set server-side and ignores the
// scope it is given, but it kept the by-IRI `divide`. Each refusal halved the
// IRI list into slices that all built the byte-identical query, which was
// refused again and halved again until the 300s step budget ran out: issue
// #82's wells step spent 533s that way before failing. Nothing on the map
// shows it; the run is just slow and then fails.
//
// The rule, for every question shape: a step that can be divided builds a
// different query for every slice it divides into. A step whose query cannot
// see the scope must not be divisible at all.
//
// No network: discovery is given a scope to halve (halving needs no probe),
// and by-IRI steps divide the IRI lists in the context.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import type { SparqlRunner } from '../sparqlClient';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../types/query';

// Dividing must not need the graph here; a probe would fail the test.
const noNetwork: SparqlRunner = async (endpoint) => {
  throw new Error(`unexpected request to ${endpoint}`);
};

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
// 'within' is in the type union but is never selectable and never planned for.
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];

const question = (a: EntityType, rel: SpatialRelationship['type'], c: EntityType): AnalysisQuestion =>
  ({
    blockA: { type: a, region: { stateCode: '23' } },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}) },
    blockC: { type: c, region: { stateCode: '23' } },
  }) as AnalysisQuestion;

it('every divisible step builds a different query for each slice', async () => {
  let shapes = 0;
  let divisions = 0;
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of RELATIONSHIPS) {
        shapes++;
        const q = question(a, rel, c);
        const ctx: PipelineContext = {
          question: q,
          targetIris: ['http://example.org/t/1', 'http://example.org/t/2'],
          anchorIris: ['http://example.org/a/1', 'http://example.org/a/2'],
          results: {},
        };
        for (const step of planPipeline(q)) {
          if (!step.divide) continue;
          const where = `${a} ${rel} ${c}, ${step.type}`;
          // Discovery with no scope would probe the graph to pick an axis, so
          // give it a slice to halve instead.
          const scope = step.type.startsWith('FIND_')
            ? { label: 'slice', anchorIris: ctx.anchorIris }
            : undefined;
          const slices = await step.divide(ctx, scope, noNetwork);
          if (!slices) continue;
          divisions++;
          const whole = step.buildQuery(ctx, scope);
          const queries = slices.map((s) => step.buildQuery(ctx, s));
          assert.equal(new Set(queries).size, slices.length, `slices build identical queries: ${where}`);
          assert.ok(!queries.includes(whole), `a slice re-sends the undivided query: ${where}`);
        }
      }
    }
  }
  assert.equal(shapes, 108);
  // Every shape has two discovery steps and at least one by-IRI step to divide.
  assert.ok(divisions >= 108 * 3, `only ${divisions} divisions checked`);
});
