// Checks the distance-bounded downstream trace against the live SPARQL
// endpoints, using the same planner the app runs.
//
// Reference values come from UC1_CQ2c (New Hampshire, NAICS 488119 airports,
// 30 km): the notebook returns 162 flowlines, but only because it requires
// schema1:address on facilities — a predicate 13 of 144 NH airport facilities
// have. Without that accidental filter its answer is 1,547 flowlines, and ours
// is a superset of exactly that set (we also expand to neighbouring S2 cells
// and add the "+1" segment past the cutoff).
//
// Run: node scripts/flow-distance-check.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/engine/planner.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const { planPipeline } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const ENDPOINTS = {
  sawgraph: 'https://frink.apps.renci.org/sawgraph/sparql',
  spatialkg: 'https://frink.apps.renci.org/spatialkg/sparql',
  hydrologykg: 'https://frink.apps.renci.org/hydrologykg/sparql',
  federation: 'https://frink.apps.renci.org/federation/sparql',
};

async function run(endpoint, query) {
  const res = await fetch(ENDPOINTS[endpoint], {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/sparql-query',
    },
    body: query,
  });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.results.bindings.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])),
  );
}

// "What streams are within 30 km downstream of 488119 (Airports) facilities
// in New Hampshire?" — the notebook's question, expressed in the app's model.
const question = {
  blockA: { type: 'streams' },
  relationship: { type: 'downstream', maxDistanceKm: 30 },
  blockC: {
    type: 'facilities',
    region: { stateCode: '33' },
    facilityFilters: { industryCodes: ['488119'] },
  },
};

const steps = planPipeline(question);
const stepTypes = steps.map((s) => s.type);

// The answer set *is* the flowlines, so the supporting stream layer is skipped.
assert.ok(
  !stepTypes.includes('GET_FLOWLINE_GEOMETRIES'),
  `expected no supporting flowline step, got ${stepTypes.join(', ')}`,
);

const ctx = { question, targetIris: [], anchorIris: [], results: {} };
for (const step of steps) {
  const rows = await run(step.endpoint, step.buildQuery(ctx));
  ctx.results[step.type] = rows;
  if (step.type === 'FIND_TARGET_IRIS') ctx.targetIris = [...new Set(rows.map((r) => r.iri))];
  if (step.type === 'FIND_ANCHOR_IRIS') ctx.anchorIris = [...new Set(rows.map((r) => r.iri))];
  console.log(`${step.type}: ${rows.length} rows`);
}

const streams = ctx.targetIris.length;
const facilities = ctx.anchorIris.length;
console.log(`\n${streams} streams within 30 km downstream of ${facilities} NH airport facilities`);

// The "+1" fringe must land past the cutoff, so some flowlines carry a
// distance above the threshold — that is the point of it.
const overThreshold = (ctx.results['GET_FLOWLINE_GEOMETRIES'] ?? [])
  .concat(ctx.results['HYDRATE_TARGET_BY_IRI'] ?? [])
  .filter((r) => r.path_length !== undefined && Number(r.path_length) >= 30);
console.log(`${overThreshold.length} flowlines past the 30 km cutoff (the "+1" fringe)`);

// The bound has to actually bind: unbounded, this trace runs to the coast.
const unbounded = planPipeline({ ...question, relationship: { type: 'downstream' } });
const unboundedRows = await run(unbounded[0].endpoint, unbounded[0].buildQuery(ctx));
const unboundedStreams = new Set(unboundedRows.map((r) => r.iri)).size;
console.log(`${unboundedStreams} streams with no distance bound`);

assert.ok(streams > 1547, `expected a superset of the notebook's 1547, got ${streams}`);
// The bound must actually exclude flowlines the unbounded trace reaches.
// Observed 2026-08: 2784 bounded (2757 within the cutoff + 27 fringe) vs 3490
// unbounded — downstreamFlowPathTC in this KG does not reach as far as the
// coast, so the gap is smaller than the notebook's parameters suggest.
assert.ok(
  unboundedStreams > streams,
  `bound had no effect: ${streams} bounded vs ${unboundedStreams} unbounded`,
);

// Every hydrated stream carries geometry the map can draw.
const hydrated = ctx.results['HYDRATE_TARGET_BY_IRI'] ?? [];
assert.ok(hydrated.length > 0, 'no hydrated streams');
assert.ok(
  hydrated.every((r) => r.flowlineWKT?.startsWith('LINESTRING')),
  'hydrated streams missing LINESTRING geometry',
);

console.log('\nOK');
