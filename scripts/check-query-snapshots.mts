// Golden-file snapshot of the SPARQL the planner generates, for every shape.
//
//   npx tsx scripts/check-query-snapshots.mts            # verify
//   npx tsx scripts/check-query-snapshots.mts --update   # re-record
//
// Why this exists: near and downstream/upstream share one query builder
// (buildFusedWhereBody in src/engine/templates/fusedQueries.ts takes a `mode`
// and differs only in the middle hop). Everything else -- entity binding,
// region clauses, IRI pinning, sample-observation joins -- is common. So a fix
// aimed at a trace bug silently rewrites the `near` queries too, and the only
// thing that noticed until now was a live sweep taking ~30 minutes.
//
// This records the generated SPARQL for every shape and fails on any diff. The
// diff is the point: an intentional change shows exactly which other shapes
// moved with it, then you --update. No network, runs in about a second.
//
// The grid has four axes, and every one of them earned its place by hiding a
// bug that the others could not see:
//
//   entity pair (36)      one builder serves all of them, so a fix aimed at
//                         one pair rewrites the rest
//   relationship (3)      near and the two hydrology directions share
//                         buildFusedWhereBody
//   region placement (2)  which block carries the region decides which side is
//                         "constrained", which decides the join order. An
//                         earlier version of this grid put the region on block
//                         A always; for an upstream question that makes the
//                         anchor the constrained side, so the target-first
//                         order was never recorded, and neither was the
//                         question that broke in the app (block A wide open,
//                         block C scoped to a county).
//   flow-distance bound   the bounded trace is a different query, not a
//   (2, hydrology only)   filtered one: it seeds an aggregate. With one bounded
//                         variant in the grid, the fix that moved every bounded
//                         shape showed up here as a single moved line.
//
// 6 x 6 x 3 x 2 = 216 unbounded, plus 6 x 6 x 2 x 2 = 144 bounded, plus the
// variants below that reach clauses the grid does not vary.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planPipeline, type PipelineContext } from '../src/engine/planner';
import { PREFIXES } from '../src/constants/prefixes';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../src/types/query';

const SNAPSHOT = new URL('./__snapshots__/query-shapes.txt', import.meta.url);

const ENTITY_TYPES: EntityType[] = [
  'samples',
  'facilities',
  'waterBodies',
  'wells',
  'aquifers',
  'streams',
];
// 'within' is in the type union but RelationshipSelector never offers it.
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];
const HYDROLOGY: SpatialRelationship['type'][] = ['downstream', 'upstream'];
// Which block carries the region. See the header: this is the axis that decides
// the join order, and it is not symmetric between the two relationship
// directions, because the planner maps block A to the anchor for an upstream
// question and to the target for a downstream one.
const REGION_ON = ['A', 'C'] as const;

// Fixed IRIs so pinValues output is deterministic. Two entries: enough to show
// the VALUES clause and its ordering, short enough to stay readable.
const context = (question: AnalysisQuestion): PipelineContext => ({
  question,
  targetIris: ['http://example.org/target/1', 'http://example.org/target/2'],
  anchorIris: ['http://example.org/anchor/1', 'http://example.org/anchor/2'],
  results: {},
});

// Collapse whitespace: indentation churn is not a behaviour change and would
// bury the diffs that are.
//
// The shared PREFIX preamble is stripped for the same reason, plus one of its
// own: it is byte-identical in every query and was 66% of this file, so it made
// the snapshot three times the size it needs to be and pushed the part that
// varies off the side of every diff. It is recorded once, on its own, so a
// change to the prefix list still shows up as exactly one moved entry instead
// of moving all 360.
const collapse = (q: string) => q.replace(/\s+/g, ' ').trim();
const PREFIX_BLOCK = collapse(PREFIXES);
const normalise = (q: string) => collapse(q).replace(PREFIX_BLOCK, '').trim();

// Query bodies are written once each, in a table at the end, and referenced by
// hash from the shapes above. 375 shapes reference 2,078 step queries but only
// 603 distinct ones — the region-boundary query alone is identical in 373 of
// them — so inlining every body made the file 2.6x larger and turned a one-line
// change to a shared query into 373 lines of diff.
const bodies = new Map<string, string>();
const BODIES_MARKER = '# ---- query bodies, one line per distinct query ----';

function record(name: string, question: AnalysisQuestion): string[] {
  const lines = [`## ${name}`];
  const ctx = context(question);
  for (const step of planPipeline(question)) {
    const query = normalise(step.buildQuery(ctx));
    assert.ok(query.length > 0, `empty query: ${name} / ${step.type}`);
    const hash = createHash('sha256').update(query).digest('hex').slice(0, 12);
    bodies.set(hash, query);
    lines.push(`${step.type} [${step.endpoint}] ${hash}`);
  }
  return lines;
}

const shape = (
  a: EntityType,
  rel: SpatialRelationship['type'],
  c: EntityType,
  relExtra: Partial<SpatialRelationship> = {},
  regionOn: (typeof REGION_ON)[number] = 'A',
): AnalysisQuestion => {
  const region = { region: { stateCode: '23' } };
  return {
    blockA: { type: a, ...(regionOn === 'A' ? region : {}) },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}), ...relExtra },
    blockC: { type: c, ...(regionOn === 'C' ? region : {}) },
  } as AnalysisQuestion;
};

const out: string[] = [
  '# Generated by scripts/check-query-snapshots.mts -- do not hand-edit.',
  '# Re-record with: npm run check-query-snapshots -- --update',
  '',
];

// 0. The prefix preamble, recorded once because normalise() strips it.
out.push(
  '## PREFIXES',
  `SHARED [all] ${createHash('sha256').update(PREFIX_BLOCK).digest('hex').slice(0, 12)}`,
  `  ${PREFIX_BLOCK}`,
);

// 1. Every entity pair x relationship x region placement: 6 x 6 x 3 x 2 = 216.
for (const a of ENTITY_TYPES) {
  for (const c of ENTITY_TYPES) {
    for (const rel of RELATIONSHIPS) {
      for (const on of REGION_ON) {
        out.push(...record(`${a} ${rel} ${c} [ME on ${on}]`, shape(a, rel, c, {}, on)));
      }
    }
  }
}

// 2. The hydrology pairs again with a flow-distance bound: 6 x 6 x 2 x 2 = 144.
// `near` has no flow bound; its distance axis is hops, covered in the variants.
for (const a of ENTITY_TYPES) {
  for (const c of ENTITY_TYPES) {
    for (const rel of HYDROLOGY) {
      for (const on of REGION_ON) {
        out.push(
          ...record(`${a} ${rel}(30km) ${c} [ME on ${on}]`, shape(a, rel, c, { maxDistanceKm: 30 }, on)),
        );
      }
    }
  }
}

// 3. The variants that reach clauses the grid above does not vary: hop counts,
// the per-type filter blocks, and the exact questions that have broken in the
// app. A change to any of these is the class of change that crosses
// relationship boundaries.
const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const YORK = { stateCode: '23', countyCodes: ['23031'] };
const variants: Array<[string, AnalysisQuestion]> = [
  ['near hops=0', shape('samples', 'near', 'facilities', { hops: 0 })],
  ['near hops=2', shape('samples', 'near', 'facilities', { hops: 2 })],
  ['near hops=4', shape('samples', 'near', 'facilities', { hops: 4 })],
  ['downstream maxDistanceKm=10', shape('samples', 'downstream', 'facilities', { maxDistanceKm: 10 })],
  ['upstream maxDistanceKm=10', shape('samples', 'upstream', 'facilities', { maxDistanceKm: 10 })],
  // The question behind #55 and #57, in the two states it is asked in. Block A
  // carries nothing at all, which is what makes it the expensive shape: the
  // trace has to be seeded from block C or it starts from every facility in
  // the graph. Recorded bounded and unbounded because those are two different
  // queries, not one query with a filter.
  [
    'PI question: facilities upstream from PFOS samples in York, detections only',
    {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream' },
      blockC: {
        type: 'samples',
        region: YORK,
        sampleFilters: { substances: [PFOS], includeNondetects: false },
      },
    } as AnalysisQuestion,
  ],
  [
    'PI question, bounded to 30km of flow',
    {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream', maxDistanceKm: 30 },
      blockC: {
        type: 'samples',
        region: YORK,
        sampleFilters: { substances: [PFOS], includeNondetects: false },
      },
    } as AnalysisQuestion,
  ],
  // The two sample-filter shapes that decide whether the observation chain is
  // joined at all. Substance-only is the common case and is what the
  // coso:measurementUnit join silently filtered; non-detects-off is the only
  // filter that adds the result clauses without adding the unit join.
  [
    'samples substance filter only',
    {
      blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { substances: [PFOS] } },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion,
  ],
  [
    'samples include-nondetects off only',
    {
      blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { includeNondetects: false } },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion,
  ],
  [
    'no region either side',
    {
      blockA: { type: 'samples' },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion,
  ],
  [
    'county-scoped both sides',
    {
      blockA: { type: 'samples', region: { stateCode: '23', countyCodes: ['23019'] } },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities', region: { stateCode: '23', countyCodes: ['23005', '23019'] } },
    } as AnalysisQuestion,
  ],
  [
    'sample filters',
    {
      blockA: {
        type: 'samples',
        region: { stateCode: '23' },
        sampleFilters: {
          substances: ['http://sawgraph.spatialai.org/v1/pfas#PFHpA'],
          materialTypes: ['http://sawgraph.spatialai.org/v1/me-egad-data#Groundwater'],
          minConcentration: 4,
          maxConcentration: 100,
          unit: 'ng/L',
          includeNondetects: false,
        },
      },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
    } as AnalysisQuestion,
  ],
  [
    'facility + water body + well + aquifer filters',
    {
      blockA: { type: 'wells', region: { stateCode: '23' }, wellFilters: { wellCategories: ['meUse||http://example.org/use/Domestic'] } },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'aquifers', aquiferFilters: { aquiferTypes: ['bedrock'] } },
    } as AnalysisQuestion,
  ],
  [
    'stream ftype filter as target',
    {
      blockA: { type: 'samples', region: { stateCode: '23' } },
      relationship: { type: 'downstream' },
      blockC: { type: 'streams', streamFilters: { ftypes: ['460'] } },
    } as AnalysisQuestion,
  ],
];
for (const [name, question] of variants) out.push(...record(`VARIANT: ${name}`, question));

// Every distinct query body, sorted by hash so the table has a stable order and
// a new query lands as one added line rather than reshuffling the file.
out.push('', BODIES_MARKER);
for (const [hash, query] of [...bodies].sort(([a], [b]) => a.localeCompare(b))) {
  out.push(`${hash} ${query}`);
}

const next = out.join('\n') + '\n';
const update = process.argv.includes('--update');

if (update || !existsSync(SNAPSHOT)) {
  writeFileSync(SNAPSHOT, next);
  console.log(`${update ? 'Re-recorded' : 'Recorded'} ${out.filter((l) => l.startsWith('## ')).length} shapes.`);
  process.exit(0);
}

const prev = readFileSync(SNAPSHOT, 'utf8');
if (prev === next) {
  console.log(`OK: ${out.filter((l) => l.startsWith('## ')).length} shapes match the snapshot.`);
  process.exit(0);
}

// Report which shapes moved, grouped by relationship, so a "downstream fix"
// that also moved 36 near shapes says so in the first line of output.
// Shapes only: the body table at the end is keyed by content hash, so any
// change to a query already moves the hash of every shape that references it.
// Reporting the table as well would add a line of noise to every diff.
const headings = (text: string) => {
  const map = new Map<string, string>();
  let current = '';
  for (const line of text.split('\n')) {
    if (line === BODIES_MARKER) break;
    if (line.startsWith('## ')) current = line.slice(3);
    else if (current) map.set(current, (map.get(current) ?? '') + line + '\n');
  }
  return map;
};
const before = headings(prev);
const after = headings(next);
const moved = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
const gone = [...before.keys()].filter((k) => !after.has(k));

// Bucket by every axis of the grid, not just the relationship: a change that
// moves only the bounded shapes, or only the ones scoped on block C, is saying
// something quite different from one that moves a whole relationship, and the
// first line of output should be enough to tell them apart.
const count = (names: string[], re: RegExp) => names.filter((n) => re.test(n)).length;
console.error(`Generated SPARQL changed for ${moved.length} shape(s)${gone.length ? `, ${gone.length} removed` : ''}:`);
console.error(
  `  near ${count(moved, / near /)}   downstream ${count(moved, / downstream[( ]/)}   upstream ${count(moved, / upstream[( ]/)}` +
    `   bounded ${count(moved, /\(30km\)/)}   region on A ${count(moved, /\[ME on A\]/)}   region on C ${count(moved, /\[ME on C\]/)}` +
    `   variants ${count(moved, /^VARIANT/)}`,
);
for (const name of moved.slice(0, 40)) console.error(`  - ${name}`);
if (moved.length > 40) console.error(`  ... and ${moved.length - 40} more`);
console.error('\nIf every one of those is intended, re-record:');
console.error('  npm run check-query-snapshots -- --update');
process.exit(1);
