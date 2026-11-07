// Query sweep: runs every question shape the editor can build against the live
// endpoints, through the real engine, and writes one CSV row per request sent.
//
// This is the tool behind docs/QUERY-SWEEP.md. Re-run it after any change to the
// query engine and diff the output against the newest sweep with chunking off
// (docs/query-sweep/README.md lists them): no shape may regress from working to
// failing.
//
//   npx tsx engine/scripts/query-sweep.mts M1 init   # first phase truncates the CSV
//   npx tsx engine/scripts/query-sweep.mts M2        # subsequent phases append
//
// Phases: M1 near(1) all 25 entity pairs | M2 downstream all pairs
//         M3 upstream all pairs | M4 near-hop distance | M5 dashboard queries
//         M6 six states | M7 no region | M8 filters | M9 county scopes
//         MD flow-distance bounds
//
// M4 sweeps the `near` relationship's hop distance (miles). MD sweeps the
// hydrology relationship's flow-distance bound (km), which is a different
// control and was swept by nothing until MD existed.
//
// QUERY_SWEEP_CHUNKING picks how the engine runs:
//
//   off (default)  each query sent once, whole: no retry, no splitting, no 300s
//                  step limit, and a run stops at its first error. This measures
//                  the query shapes themselves, and is the baseline.
//   on             what the app does: retry, split refused queries, 300s per
//                  step. The rows then also show the probes and slices it added.
//
// Both write the same columns, so an off and an on sweep of one commit diff
// line by line. Request-size batches (1,000 IRIs a request) apply either way.
// Each request is capped at 60s (engine/endpoint.ts).
//
// Nearly all of the time is M2 and M3: the downstream and upstream sweeps are
// 50 of the 124 shapes and about two thirds of the wall time. M1, M7 and M9
// together finish in under four minutes.
//
// Run phases one at a time and sequentially. Running them in parallel distorts
// timings and provokes failures that are artefacts of your own load. If you run
// this while a GitHub workflow is querying, you will measure the contention.
//
// Results are cache-sensitive: the engine answers the same query 10-20x faster
// when warm, so run a sweep twice (cold, then warm) before trusting a number.

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { planPipeline, type PipelineStep } from '../planner';
import { executePipeline, type PipelineResult } from '../executor';
import { executeSparql, recordingEndpoint, type RequestRecord } from '../endpoint';
import { sweepRows } from './sweepRows';
import { normalise } from '../question';
import { buildEntityCountQuery, buildFusedHydrologyQuery } from '../templates/fusedQueries';
import { PREBUILT_QUERIES } from '../constants/prebuiltQueries';
import type { AnalysisQuestion, EntityType } from '../types/query';

// The old QUERY_SWEEP_MODE (raw | engine) is gone: both now run the engine.
if (process.env.QUERY_SWEEP_MODE) {
  console.error('QUERY_SWEEP_MODE is gone. Set QUERY_SWEEP_CHUNKING=off (was raw) or on (was engine).');
  process.exit(1);
}
const CHUNKING = process.env.QUERY_SWEEP_CHUNKING ?? 'off';
if (CHUNKING !== 'off' && CHUNKING !== 'on') {
  console.error(`QUERY_SWEEP_CHUNKING must be off or on, not ${CHUNKING}.`);
  process.exit(1);
}
const MODE = `chunking-${CHUNKING}`;

// Stamp every row with when it ran and which commit it ran against. A snapshot
// is only useful later if you can tell what code produced it — the 2026-09-14
// sweep was briefly ambiguous for exactly this reason.
const RUN_AT = new Date().toISOString().slice(0, 16);
const COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();
// One file per sweep, named for the day it ran and the mode it ran in. The name
// is the metadata: `ls docs/query-sweep/` answers "when was this last run", and
// comparing two sweeps is `diff` of two paths. An earlier layout used
// `query-sweep/2026-09-14-engine.csv`, which named a moment rather than a date and went
// stale the week after it was written.
const DIR = 'docs/query-sweep';
// Date, mode and commit. The commit is in the name for two reasons: two sweeps
// on the same day would otherwise collide (which happened the first time this
// layout was used), and every phase of one sweep derives the same path without
// needing a state file to remember which sweep is in progress. Commit mid-sweep
// and the remaining phases land in a new file — which is the honest outcome,
// since the code changed underneath them.
const OUT = process.env.QUERY_SWEEP_OUT ?? `${DIR}/${RUN_AT.slice(0, 10)}-${MODE}-${COMMIT}.csv`;

// Regenerate the index and stop. Cheap, runs no queries.
if (process.argv[2] === '--index') {
  writeIndex();
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });

// `init` truncates. Every sweep file is committed history the moment it lands,
// so refuse to overwrite one that already has rows — including today's, if a
// sweep is already in progress and you meant to append the next phase.
if (process.argv[3] === 'init' && existsSync(OUT) && readFileSync(OUT, 'utf8').split('\n').length > 2 && !process.env.QUERY_SWEEP_OVERWRITE) {
  console.error(
    `Refusing to truncate ${OUT}, which already has rows.\n` +
      'Drop `init` to append the next phase of the same sweep,\n' +
      'or set QUERY_SWEEP_OVERWRITE=1 to start it over.',
  );
  process.exit(1);
}
if (process.argv[3] === 'init') {
  writeFileSync(
    OUT,
    'runAt,commit,phase,label,blockA,rel,hops,blockC,region,filters,step,slice,endpoint,status,ms,rows,requestBytes,errorKind,errorMsg\n',
  );
}

const csv = (s: unknown) => `"${String(s).replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 180)}"`;

// Runs one question, or one step of it, through the engine and writes a row
// for every request it sent. Most phases measure step 0 alone (discovery,
// where almost every failure is); M5 runs the whole question; MD measures
// steps 0 and 1 each on their own, since the two projections fail apart.
async function run(phase: string, label: string, q: AnalysisQuestion, meta: Record<string, unknown>, stepIdx: number | 'all', custom?: PipelineStep[]) {
  const prefix = [RUN_AT, COMMIT, phase, csv(label), meta.blockA, meta.rel, meta.hops, meta.blockC, meta.region, csv(meta.filters)];
  const records: RequestRecord[] = [];
  const endpoint = recordingEndpoint(executeSparql, (r) => records.push(r));
  let steps: PipelineStep[] = [];
  let result: PipelineResult;
  try {
    const plan = planPipeline(q);
    // Step 0 and 1 are the two discovery steps, picked by type: the plan opens
    // with the two side counts, which these phases do not measure.
    const discovery = plan.filter((s) => s.type === 'FIND_TARGET_IRIS' || s.type === 'FIND_ANCHOR_IRIS');
    steps = custom ?? (stepIdx === 'all' ? plan : [discovery[stepIdx]]);
    result = await executePipeline(steps, q, { endpoint, chunkOnRefusal: CHUNKING === 'on' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    appendFileSync(OUT, [...prefix, 'BUILD_FAIL', '', '', 0, 0, 0, 0, 'build-error', csv(message)].join(',') + '\n');
    console.log(`${phase} ${label.padEnd(44).slice(0, 44)} BUILD_FAIL ${message}`);
    return;
  }
  for (const r of sweepRows(steps, result.queries, records)) {
    appendFileSync(OUT, [...prefix, r.step, csv(r.slice), r.endpoint, r.status, r.ms, r.rows, r.requestBytes, r.kind, csv(r.message)].join(',') + '\n');
    console.log(
      `${phase} ${label.padEnd(44).slice(0, 44)} ${r.step.padEnd(24)} ${r.slice.padEnd(16).slice(0, 16)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(6)}ms rows=${String(r.rows).padStart(5)} ${r.kind}`,
    );
  }
}

const TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers'];
// `regionOn` picks which block carries the region, and defaults to 'A', which
// is what every phase written before MD assumed. That default is not neutral:
// for an upstream question the planner maps block A to the anchor, so a region
// on A always left the *anchor* as the constrained side, and the target-first
// join order — which only fires when the target is narrowed and the anchor is
// not — was unreachable from this harness. So was every bounded question that
// leaves block A wide open, which is the shape users actually build.
const mk = (
  a: EntityType,
  rel: 'near'|'downstream'|'upstream',
  c: EntityType,
  hops: number|undefined,
  state: string|undefined,
  counties?: string[],
  opts?: { km?: number; regionOn?: 'A' | 'C' },
): AnalysisQuestion => {
  const region = state ? { region: { stateCode: state, ...(counties ? { countyCodes: counties } : {}) } } : {};
  const onC = opts?.regionOn === 'C';
  return {
    blockA: { type: a, ...(onC ? {} : region) },
    relationship: {
      type: rel,
      ...(hops !== undefined ? { hops } : {}),
      ...(opts?.km !== undefined ? { maxDistanceKm: opts.km } : {}),
    },
    blockC: { type: c, ...(onC ? region : {}) },
  } as AnalysisQuestion;
};

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

if (phase === 'MD') { // flow-distance bounds, both narrowing directions
  // Four shapes, each run bounded and unbounded, with the region on block A and
  // on block C, and on both discovery steps. Every axis here is one the bounded
  // path can behave differently on, and none of them were covered before:
  //
  //  - region on A vs C decides which side is constrained, which decides the
  //    join order. Bounded queries currently keep the anchor-first order
  //    whatever the answer, which is the thing under test.
  //  - both steps, not just step 0 like M1-M4. The two projections share a
  //    WHERE clause but not a fate: on "facilities upstream from PFOS samples
  //    in York" at 30 km, the samples projection answered in 25s while the
  //    facilities projection ran out of memory at 32s. Measuring step 0 alone
  //    would have recorded that shape as working.
  //  - the unbounded twin of every bounded row, so "did the bound remove rows"
  //    is answerable from this file alone rather than by joining against M2/M3,
  //    which scope their regions differently.
  const SHAPES: [EntityType, 'upstream' | 'downstream', EntityType][] = [
    ['facilities', 'upstream', 'samples'],   // block A wide open: what fails in the app today
    ['facilities', 'upstream', 'streams'],   // the one bounded dashboard question's shape
    ['facilities', 'upstream', 'wells'],     // the known-expensive far end (W38 entry 12)
    ['samples', 'downstream', 'facilities'], // downstream, where A and C swap anchor/target
  ];
  for (const [a, rel, c] of SHAPES)
    for (const km of [undefined, 30])
      for (const regionOn of ['A', 'C'] as const)
        for (const step of [0, 1])
          await run(
            'MD',
            `${a} ${rel}${km ? `(${km}km)` : ''} ${c} [ME on ${regionOn}] step${step}`,
            mk(a, rel, c, undefined, '23', undefined, { km, regionOn }),
            { blockA: a, rel, hops: '', blockC: c, region: `ME on ${regionOn}`, filters: km ? `${km}km` : 'none' },
            step,
          );
}

if (phase === 'MS') {
  // Start side (engine redesign, decisions 8 and 9): when both sides of a trace
  // rank the same (both in Maine, or neither with a region), does starting
  // from the side with fewer entities answer faster? Each discovery query runs
  // led by the anchor (today) and by the target, and the counts go in the
  // filters column so the ratio can be read off. Downstream only: upstream
  // builds the same queries with A and C swapped. Target projection only.
  const MS_ONLY = process.env.QUERY_SWEEP_MS_ONLY
    ? new Set(readFileSync(process.env.QUERY_SWEEP_MS_ONLY, 'utf8').split('\n').filter(Boolean))
    : null;
  const counted = new Map<string, number | string>();
  const countOf = async (block: AnalysisQuestion['blockA'], region?: string[]) => {
    const key = JSON.stringify([block, region]);
    if (!counted.has(key)) {
      try {
        const rows = await executeSparql('federation', buildEntityCountQuery(block, region), { retry: false });
        counted.set(key, Number(rows[0]?.count));
      } catch (e) {
        counted.set(key, `count failed: ${e instanceof Error ? e.message.slice(0, 40) : e}`);
      }
    }
    return counted.get(key);
  };
  const CONFIGS: { name: string; state?: string; km?: number }[] = [
    { name: 'ME both', state: '23' },
    { name: 'ME both 30km', state: '23', km: 30 },
    { name: 'no region', state: undefined },
  ];
  for (const cfg of CONFIGS)
    for (const a of TYPES)
      for (const c of TYPES) {
        if (a === c) continue;
        const region = cfg.state ? { region: { stateCode: cfg.state } } : {};
        const q = {
          blockA: { type: a, ...region },
          relationship: { type: 'downstream', ...(cfg.km ? { maxDistanceKm: cfg.km } : {}) },
          blockC: { type: c, ...region },
        } as AnalysisQuestion;
        const n = normalise(q);
        const anchorCount = await countOf(n.anchor, n.anchorRegion);
        const targetCount = await countOf(n.target, n.targetRegion);
        // QUERY_SWEEP_MS_ORDER=target-first runs the target-led query first,
        // to tell the start side from QLever's cache (the second query of a
        // pair runs warm). QUERY_SWEEP_MS_ONLY names a file of shape labels to
        // re-run, one per line.
        const label = `${a} downstream${cfg.km ? `(${cfg.km}km)` : ''} ${c} [${cfg.name}]`;
        if (MS_ONLY && !MS_ONLY.has(label)) continue;
        const leads = process.env.QUERY_SWEEP_MS_ORDER === 'target-first' ? (['target', 'anchor'] as const) : (['anchor', 'target'] as const);
        for (const lead of leads) {
          const query = buildFusedHydrologyQuery({
            anchor: n.anchor,
            target: n.target,
            anchorRegion: n.anchorRegion,
            targetRegion: n.targetRegion,
            project: 'target',
            maxDistanceKm: cfg.km,
            lead,
          });
          const step: PipelineStep = {
            type: 'FIND_TARGET_IRIS',
            endpoint: 'federation',
            description: `lead ${lead}`,
            after: [],
            buildQuery: () => query,
          };
          await run(
            'MS',
            `${label} lead ${lead}`,
            q,
            { blockA: a, rel: 'downstream', hops: '', blockC: c, region: cfg.name, filters: `anchor=${anchorCount} target=${targetCount} lead=${lead}` },
            0,
            [step],
          );
        }
      }
}

// --- the index -------------------------------------------------------------
//
// One row per sweep: when, which commit, how many query shapes passed, and what
// moved since the previous sweep in the same mode. Regenerate with
// `npx tsx engine/scripts/query-sweep.mts --index` — it reads the CSVs, runs nothing.

interface Sweep {
  file: string;
  date: string;
  mode: string;
  commit: string;
  // Which phases (M1..M9, MD) the sweep ran. A 32-shape MD sweep and a full
  // 124-shape sweep look alike in every other column.
  phases: string[];
  // label -> worst status seen for that query. Raw mode writes one row per
  // step, so a query is only a pass if every one of its steps passed.
  byLabel: Map<string, string>;
}

function readSweeps(): Sweep[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.csv') && statSync(`${DIR}/${f}`).size > 0)
    // Order by when the sweep actually ran, not by filename. Two sweeps on the
    // same day sort wrongly by name — `-9128aa9.csv` precedes `.csv` — which
    // silently inverted the delta column: shapes the newer sweep had fixed were
    // reported as newly broken.
    .map((file) => ({ file, at: sweepStartedAt(file) }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ file }) => {
      const lines = readFileSync(`${DIR}/${file}`, 'utf8').split('\n').filter(Boolean);
      const header = lines[0].split(',');
      const iCommit = header.indexOf('commit');
      const iLabel = header.indexOf('label');
      const iStatus = header.indexOf('status');
      // Sweeps since chunking-off/on name these errorKind and phase; older ones
      // errorClass and matrix.
      const iClass = header.indexOf('errorKind') > -1 ? header.indexOf('errorKind') : header.indexOf('errorClass');
      const iMatrix = header.indexOf('phase') > -1 ? header.indexOf('phase') : header.indexOf('matrix');
      const byLabel = new Map<string, string>();
      const phases = new Set<string>();
      let commit = '';
      for (const line of lines.slice(1)) {
        const cols = line.split(',');
        if (iMatrix > -1 && cols[iMatrix]) phases.add(cols[iMatrix]);
        // Labels are quoted and contain no commas (csv() strips whitespace runs
        // and quotes), so a plain split is safe here.
        const label = (cols[iLabel] ?? '').replace(/"/g, '');
        // The two modes report outcome differently: `engine` writes the
        // pipeline status, `raw` writes the HTTP code and puts the verdict in
        // errorClass. Reading the wrong one scores a clean raw sweep as 7 of
        // 124 passing, which is how this was caught.
        const raw = cols[iStatus] ?? '';
        const status = /^\d+$/.test(raw) ? (cols[iClass] === 'ok' ? 'success' : 'error') : raw;
        if (iCommit > -1 && cols[iCommit]) commit = cols[iCommit];
        const worse = (a: string, b: string) => (a === 'error' || b === 'error' ? 'error' : a === 'empty' || b === 'empty' ? 'empty' : 'success');
        byLabel.set(label, byLabel.has(label) ? worse(byLabel.get(label)!, status) : status);
      }
      // `2026-09-14-engine-a119e16.csv` -> date, mode, commit. Older files have
      // no commit in the name; fall back to the column, then to admitting it.
      const m = file.match(/^(\d{4}-\d{2}-\d{2})-(.+?)(?:-([0-9a-f]{7,40}))?\.csv$/);
      return {
        file,
        date: m?.[1] ?? file,
        mode: m?.[2] ?? '?',
        commit: m?.[3] || commit || 'unrecorded',
        phases: [...phases],
        byLabel,
      };
    });
}

// When a sweep ran. The first row's runAt is authoritative; files written
// before that column existed fall back to their mtime.
function sweepStartedAt(file: string): string {
  const first = readFileSync(`${DIR}/${file}`, 'utf8').split('\n')[1] ?? '';
  const stamp = first.split(',')[0];
  return /^\d{4}-\d{2}-\d{2}T/.test(stamp) ? stamp : new Date(statSync(`${DIR}/${file}`).mtimeMs).toISOString();
}

function writeIndex(): void {
  const sweeps = readSweeps();
  const out = [
    '# Query sweeps',
    '',
    'Every run of `npm run query-sweep`, newest first. One CSV per sweep, named',
    'for the day it ran, so `ls` answers "when was this last run", and comparing',
    'two sweeps is a `diff` of two paths.',
    '',
    '```',
    'npx tsx engine/scripts/query-sweep.mts M1 init                          # start a sweep (chunking off)',
    'npx tsx engine/scripts/query-sweep.mts M2                               # each later phase',
    'QUERY_SWEEP_CHUNKING=on npx tsx engine/scripts/query-sweep.mts M1 init  # the same, as the app runs',
    'npx tsx engine/scripts/query-sweep.mts --index                          # rebuild this file',
    '```',
    '',
    'Both modes run the real engine and write one row per request. `chunking-off`',
    'sends each query once, whole, and is the baseline; `chunking-on` runs it as the',
    'app does (retry, splitting, 300s per step), so its extra rows are the probes and',
    'slices the rescue added. The two diff row for row. Older sweeps (`raw`,',
    '`engine`, and `raw-baseline`) used other formats and are kept as history.',
    '',
    'Phases: M1 near, M2 downstream, M3 upstream (all entity pairs), M4 near-hop',
    'distance, M5 dashboard questions, M6 six states, M7 no region, M8 filters,',
    'M9 county scopes, MD flow-distance bounds.',
    '',
    '| Sweep | Mode | Commit | Phases | Shapes | Pass | Fail | Since the previous sweep |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
  ];

  for (let i = sweeps.length - 1; i >= 0; i--) {
    const s = sweeps[i];
    const pass = [...s.byLabel.values()].filter((v) => v === 'success').length;
    const fail = [...s.byLabel.values()].filter((v) => v === 'error').length;
    const prev = sweeps.slice(0, i).reverse().find((p) => p.mode === s.mode);
    out.push(
      `| [\`${s.date}\`](./${s.file}) | ${s.mode} | \`${s.commit}\` | ${phaseRange(s.phases)} | ${s.byLabel.size} | ${pass} | ${fail} | ${delta(s, prev)} |`,
    );
  }

  // A sweep can be invalid for reasons no column can express — the endpoint was
  // under load, a phase ran away, the run spanned an outage. Drop a `<name>.note`
  // file beside the CSV and it shows up here, next to the numbers it qualifies,
  // rather than in a document nobody opens before trusting a figure.
  const noted = sweeps.filter((x) => existsSync(`${DIR}/${x.file}.note`)).reverse();
  if (noted.length) {
    out.push('', '## Notes', '');
    for (const x of noted) {
      out.push(`**[\`${x.file}\`](./${x.file})**: ${readFileSync(`${DIR}/${x.file}.note`, 'utf8').trim()}`, '');
    }
  }

  out.push('', `Generated ${new Date().toISOString().slice(0, 10)}.`, '');
  writeFileSync(`${DIR}/README.md`, out.join('\n'));
  console.log(`Wrote ${DIR}/README.md — ${sweeps.length} sweep(s).`);
}

// ['M1', 'M2', 'M3', 'M5', 'MD'] -> 'M1 to M3, M5, MD'.
function phaseRange(phases: string[]): string {
  const nums = phases.map((p) => /^M(\d+)$/.exec(p)?.[1]).filter((n): n is string => !!n).map(Number).sort((a, b) => a - b);
  const others = phases.filter((p) => !/^M\d+$/.test(p)).sort();
  const runs: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    runs.push(j - i >= 2 ? `M${nums[i]} to M${nums[j]}` : nums.slice(i, j + 1).map((n) => `M${n}`).join(', '));
    i = j;
  }
  return [...runs, ...others].join(', ') || '?';
}

function delta(now: Sweep, prev?: Sweep): string {
  if (!prev) return '_first sweep in this mode_';
  const fixed: string[] = [];
  const broke: string[] = [];
  for (const [label, status] of now.byLabel) {
    const was = prev.byLabel.get(label);
    if (was === undefined) continue;
    if (was === 'error' && status !== 'error') fixed.push(label);
    if (was !== 'error' && status === 'error') broke.push(label);
  }
  const added = [...now.byLabel.keys()].filter((l) => !prev.byLabel.has(l)).length;
  const bits = [
    broke.length ? `**${broke.length} broke** (${broke.slice(0, 2).join(', ')}${broke.length > 2 ? ', …' : ''})` : '',
    fixed.length ? `${fixed.length} fixed` : '',
    added ? `${added} new shape${added > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'no change';
}
