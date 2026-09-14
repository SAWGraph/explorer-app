// Query-matrix harness: runs every question shape the editor can build against
// the live endpoints and writes one CSV row per query.
//
// This is the tool behind docs/QUERY-MATRIX.md. Re-run it after any change to
// the query engine and diff the output against docs/query-matrix.csv — no shape
// may regress from working to failing.
//
//   npx tsx scripts/query-matrix.mts M1 init   # first phase truncates the CSV
//   npx tsx scripts/query-matrix.mts M2        # subsequent phases append
//
// Phases: M1 near(1) all 25 entity pairs | M2 downstream all pairs
//         M3 upstream all pairs | M4 distance sweep | M5 dashboard queries
//         M6 six states | M7 no region | M8 filters | M9 county scopes
//
// How long it takes depends entirely on MODE, and the difference is large:
//
//   raw    ~156 step-queries, ~37 min   (measured 2026-09-14)
//   engine  124 full pipelines, ~95 min (measured 2026-09-14 at 144 min, but
//           48 of those were two requests that hung for 1918s and 959s before
//           sparqlClient gained its 60s cap — those shapes now fail fast)
//
// Nearly all of it is M2 and M3: the downstream and upstream sweeps are 50 of
// the 124 queries and about two thirds of the wall time. M1, M7 and M9 together
// finish in under four minutes.
//
// Run phases one at a time and sequentially — running them in parallel distorts
// timings and provokes failures that are artefacts of your own load. If you run
// this while a GitHub workflow is querying, you will measure the contention.
// Each query is capped at 45s client-side per request.
//
// Results are cache-sensitive: the engine answers the same query 10-20x faster
// when warm, so run a sweep twice (cold, then warm) before trusting a number.

import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';
import { ENDPOINTS } from '../src/constants/endpoints';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import type { AnalysisQuestion, EntityType } from '../src/types/query';

// 'raw' posts each step's SPARQL directly — measures the endpoint, not us, and
// is how the pre-Phase-2 baseline was recorded. 'engine' runs the real pipeline
// so splitting, merging, partial results and the step budget are all exercised;
// that is the mode to use for an after-the-change sweep.
const MODE = (process.env.QUERY_MATRIX_MODE ?? 'raw') as 'raw' | 'engine';

// Stamp every row with when it ran and which commit it ran against. A snapshot
// is only useful later if you can tell what code produced it — the 2026-09-14
// sweep was briefly ambiguous for exactly this reason.
const RUN_AT = new Date().toISOString().slice(0, 16);
const COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();
// Default output is the *baseline* file, which is committed history — an `init`
// run truncates whatever it points at, so writing there needs to be deliberate.
const OUT = process.env.QUERY_MATRIX_OUT ?? 'docs/query-matrix.csv';
if (process.argv[3] === 'init' && OUT === 'docs/query-matrix.csv' && !process.env.QUERY_MATRIX_OVERWRITE_BASELINE) {
  console.error(
    'Refusing to truncate the committed baseline docs/query-matrix.csv.\n' +
      'Set QUERY_MATRIX_OUT=docs/query-matrix-after.csv (or another path) for a new sweep,\n' +
      'or QUERY_MATRIX_OVERWRITE_BASELINE=1 if you really mean to replace the baseline.',
  );
  process.exit(1);
}
if (process.argv[3] === 'init') {
  writeFileSync(
    OUT,
    MODE === 'engine'
      ? 'runAt,commit,matrix,label,blockA,rel,hops,blockC,region,filters,step,endpoint,status,ms,rows,bytes,errorClass,errorMsg,chunksFailed,chunksSkipped,chunksMax\n'
      : 'runAt,commit,matrix,label,blockA,rel,hops,blockC,region,filters,step,endpoint,status,ms,rows,bytes,errorClass,errorMsg\n',
  );
}

const classify = (status: number, ex: string): string => {
  if (status === 200) return 'ok';
  if (status === 413) return 'payload-too-large';
  if (/Tried to allocate/.test(ex)) return 'engine-oom';
  if (/Operation timed out/.test(ex)) return 'timeout-30s';
  if (/Sort operation was canceled/.test(ex)) return 'timeout-sort-estimate';
  if (/Waited for a result from another thread/.test(ex)) return 'sibling-failure';
  if (status === 0) return 'client-timeout-45s';
  return `other-${status}`;
};

const csv = (s: unknown) => `"${String(s).replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 180)}"`;

// Runs through the real engine. For phases that measured only the discovery
// step in the baseline, the step list is truncated to that step so the two
// sweeps compare like with like — discovery is where almost every failure was.
async function runViaEngine(
  matrix: string,
  label: string,
  q: AnalysisQuestion,
  meta: Record<string, unknown>,
  stepIdx: number | 'all',
) {
  const all = planPipeline(q);
  const steps = stepIdx === 'all' ? all : all.slice(0, (stepIdx as number) + 1);
  let chunksMax = 0;
  const t0 = Date.now();
  const result = await executePipeline(steps, q, (p) => {
    if ((p.chunksTotal ?? 0) > chunksMax) chunksMax = p.chunksTotal ?? 0;
  });
  const ms = Date.now() - t0;

  const rows =
    result.status === 'success'
      ? Object.values(result.data).reduce((n, r) => Math.max(n, r.length), 0)
      : 0;
  const chunksFailed =
    result.status === 'success' ? (result.partial ?? []).reduce((n, p) => n + p.failed.length, 0) : 0;
  const chunksSkipped =
    result.status === 'success' ? (result.partial ?? []).reduce((n, p) => n + p.skipped.length, 0) : 0;
  const errorClass =
    result.status === 'success'
      ? chunksFailed + chunksSkipped > 0
        ? 'ok-partial'
        : 'ok'
      : result.status === 'empty'
        ? 'empty'
        : 'failed';
  const detail =
    result.status === 'error' ? result.error.message : result.status === 'empty' ? result.message : '';

  appendFileSync(
    OUT,
    [RUN_AT, COMMIT, matrix, csv(label), meta.blockA, meta.rel, meta.hops, meta.blockC, meta.region, csv(meta.filters),
     stepIdx === 'all' ? 'PIPELINE' : steps[steps.length - 1].type, 'engine',
     result.status, ms, rows, 0, errorClass, csv(detail), chunksFailed, chunksSkipped, chunksMax].join(',') + '\n',
  );
  console.log(
    `${matrix} ${label.padEnd(44).slice(0, 44)} ${result.status.padEnd(8)} ${String(ms).padStart(7)}ms rows=${String(rows).padStart(5)} chunks=${chunksMax} partial=${partialSlices}`,
  );
}

async function run(matrix: string, label: string, q: AnalysisQuestion, meta: Record<string, unknown>, stepIdx: number | 'all') {
  if (MODE === 'engine') return runViaEngine(matrix, label, q, meta, stepIdx);
  const steps = planPipeline(q);
  const ctx: any = { question: q, targetIris: [], anchorIris: [], results: {} };
  const idxs = stepIdx === 'all' ? steps.map((_, i) => i) : [stepIdx];
  for (const i of idxs) {
    if (i >= steps.length) break;
    const step = steps[i];
    let body: string;
    try { body = step.buildQuery(ctx); } catch (e: any) { 
      appendFileSync(OUT, [RUN_AT, COMMIT, matrix, csv(label), meta.blockA, meta.rel, meta.hops, meta.blockC, meta.region, csv(meta.filters), step.type, step.endpoint, 'BUILD_FAIL', 0, 0, 0, 'build-error', csv(e.message)].join(',') + '\n');
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45000);
    const t0 = Date.now();
    let status = 0, ex = '', rows: any[] = [], bytes = 0;
    try {
      const r = await fetch(ENDPOINTS[step.endpoint], {
        method: 'POST', signal: ac.signal,
        headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
        body,
      });
      status = r.status;
      const t = await r.text();
      bytes = t.length;
      try { const j = JSON.parse(t); ex = j.exception ?? ''; rows = j.results?.bindings ?? []; } catch { ex = 'unparseable-json'; }
    } catch (e: any) { ex = e.name === 'AbortError' ? 'client abort at 45s' : e.message; }
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const cls = classify(status, ex);
    appendFileSync(OUT, [RUN_AT, COMMIT, matrix, csv(label), meta.blockA, meta.rel, meta.hops, meta.blockC, meta.region, csv(meta.filters), step.type, step.endpoint, status, ms, rows.length, bytes, cls, csv(ex)].join(',') + '\n');
    console.log(`${matrix} ${label.padEnd(44).slice(0,44)} ${step.type.padEnd(24)} ${String(status).padStart(3)} ${String(ms).padStart(6)}ms rows=${String(rows.length).padStart(5)} ${cls}`);
    // thread context for full-pipeline runs
    if (status === 200) {
      ctx.results[step.type] = rows.map((b: any) => Object.fromEntries(Object.entries(b).map(([k, v]: any) => [k, v.value])));
      if (step.type === 'FIND_TARGET_IRIS') ctx.targetIris = [...new Set(ctx.results[step.type].map((r: any) => r.iri).filter(Boolean))];
      if (step.type === 'FIND_ANCHOR_IRIS') ctx.anchorIris = [...new Set(ctx.results[step.type].map((r: any) => r.iri).filter(Boolean))];
      if (step.type === 'HYDRATE_TARGET_BY_IRI') ctx.results['FIND_TARGET_ENTITIES'] = ctx.results[step.type];
      if (stepIdx === 'all' && (step.type === 'FIND_TARGET_IRIS') && ctx.targetIris.length === 0) return; // early exit like executor
    } else if (stepIdx === 'all') return; // pipeline aborts on failure
  }
}

const TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers'];
const mk = (a: EntityType, rel: 'near'|'downstream'|'upstream', c: EntityType, hops: number|undefined, state: string|undefined, counties?: string[]): AnalysisQuestion => ({
  blockA: { type: a, ...(state ? { region: { stateCode: state, ...(counties ? { countyCodes: counties } : {}) } } : {}) },
  relationship: { type: rel, ...(hops !== undefined ? { hops } : {}) },
  blockC: { type: c },
} as AnalysisQuestion);

const phase = process.argv[2];

if (phase === 'M1') for (const a of TYPES) for (const c of TYPES)
  await run('M1', `${a} near(1) ${c} [ME]`, mk(a, 'near', c, 1, '23'), { blockA: a, rel: 'near', hops: 1, blockC: c, region: 'ME', filters: 'none' }, 0);

if (phase === 'M2') for (const a of TYPES) for (const c of TYPES)
  await run('M2', `${a} downstream ${c} [ME]`, mk(a, 'downstream', c, undefined, '23'), { blockA: a, rel: 'downstream', hops: '', blockC: c, region: 'ME', filters: 'none' }, 0);

if (phase === 'M3') for (const a of TYPES) for (const c of TYPES)
  await run('M3', `${a} upstream ${c} [ME]`, mk(a, 'upstream', c, undefined, '23'), { blockA: a, rel: 'upstream', hops: '', blockC: c, region: 'ME', filters: 'none' }, 0);

if (phase === 'M4') for (const h of [0, 2, 3, 4]) for (const [a, c] of [['samples','facilities'],['samples','wells'],['wells','facilities'],['waterBodies','facilities'],['samples','waterBodies']] as [EntityType,EntityType][])
  await run('M4', `${a} near(${h}) ${c} [ME]`, mk(a, 'near', c, h, '23'), { blockA: a, rel: 'near', hops: h, blockC: c, region: 'ME', filters: 'none' }, 0);

if (phase === 'M5') for (const p of PREBUILT_QUERIES)
  await run('M5', `PREBUILT: ${p.title}`, p.question, { blockA: p.question.blockA.type, rel: p.question.relationship.type, hops: p.question.relationship.hops ?? '', blockC: p.question.blockC.type, region: p.question.blockA.region?.countyCodes?.join('|') ?? p.question.blockA.region?.stateCode ?? 'none', filters: 'prebuilt' }, 'all');

if (phase === 'M6') for (const st of ['17','18','25','33','01','50'])
  await run('M6', `samples downstream facilities [${st}]`, mk('samples', 'downstream', 'facilities', undefined, st), { blockA: 'samples', rel: 'downstream', hops: '', blockC: 'facilities', region: st, filters: 'none' }, 0);

if (phase === 'M7') { // no region at all — the largest possible
  for (const [a, rel, c] of [['samples','near','facilities'],['samples','downstream','facilities'],['wells','near','facilities']] as [EntityType,any,EntityType][])
    await run('M7', `${a} ${rel} ${c} [NO REGION]`, mk(a, rel, c, rel === 'near' ? 1 : undefined, undefined), { blockA: a, rel, hops: rel==='near'?1:'', blockC: c, region: 'none', filters: 'none' }, 0);
}

if (phase === 'M8') {
  const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
  const GW = 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.GW';
  const cases: [string, AnalysisQuestion, string][] = [
    ['substance filter (PFOS)', { blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { substances: [PFOS] } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities' } } as any, 'substance'],
    ['material filter (GW)', { blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { materialTypes: [GW] } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities' } } as any, 'material'],
    ['concentration range 10-1000', { blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { minConcentration: 10, maxConcentration: 1000 } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities' } } as any, 'range'],
    ['exclude non-detects', { blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { includeNondetects: false } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities' } } as any, 'nondetect'],
    ['substance + downstream', { blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { substances: [PFOS] } }, relationship: { type: 'downstream' }, blockC: { type: 'facilities' } } as any, 'substance+ds'],
    ['NAICS 2-digit (whole sector 31)', { blockA: { type: 'samples', region: { stateCode: '23' } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'facilities', facilityFilters: { industryCodes: ['31'] } } } as any, 'naics-sector'],
    ['aquifer type filter', { blockA: { type: 'samples', region: { stateCode: '23' } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'aquifers', aquiferFilters: { aquiferTypes: ['surficial'] } } } as any, 'aquifer-type'],
    ['waterbody ftype filter', { blockA: { type: 'samples', region: { stateCode: '23' } }, relationship: { type: 'near', hops: 1 }, blockC: { type: 'waterBodies', waterBodyFilters: { ftypes: ['LakePond'] } } } as any, 'wb-ftype'],
  ];
  for (const [label, q, f] of cases)
    await run('M8', label, q, { blockA: q.blockA.type, rel: q.relationship.type, hops: q.relationship.hops ?? '', blockC: q.blockC.type, region: 'ME', filters: f }, 0);
}

if (phase === 'M9') { // county-scoped (smallest realistic) + multi-county
  for (const [label, counties] of [['1 county (Cumberland)', ['23005']], ['3 counties', ['23005','23019','23003']]] as [string, string[]][])
    await run('M9', `samples near(1) facilities [${label}]`, mk('samples', 'near', 'facilities', 1, '23', counties), { blockA: 'samples', rel: 'near', hops: 1, blockC: 'facilities', region: label, filters: 'none' }, 0);
  for (const [label, counties] of [['1 county (Cumberland)', ['23005']], ['3 counties', ['23005','23019','23003']]] as [string, string[]][])
    await run('M9', `samples downstream facilities [${label}]`, mk('samples', 'downstream', 'facilities', undefined, '23', counties), { blockA: 'samples', rel: 'downstream', hops: '', blockC: 'facilities', region: label, filters: 'none' }, 0);
}
