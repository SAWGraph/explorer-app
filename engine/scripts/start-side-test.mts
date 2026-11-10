// The start-side test (map #133, "Run the spaced start-side test", #137).
//
// One round: the 14 tied shapes of #135, each queried from both start sides,
// 28 queries. Method from #136:
//
//  - Each query asks for application/qlever-results+json, so QLever reports
//    per plan node whether it came from the cache. A run whose topmost cached
//    nodes saved more than 10% of its time is a warm run: kept in the CSV,
//    flagged, and left out of the comparison. Never rerun.
//  - For each shape the smaller side's query runs first (ties: the anchor,
//    today's start side), the other straight after. Any cache advantage then
//    goes to the larger side.
//  - Time is QLever's total, planning included; planning and saved time are
//    recorded too, with the client's wall time.
//  - Chunking off: each query sent once, whole, capped at 60s like the engine.
//  - Rounds at least 12 hours apart. Nothing here clears the cache.
//
//   npx tsx engine/scripts/start-side-test.mts 1     # round 1, 2 or 3
//
// Writes docs/query-sweep/start-side/<date>-r<round>-<commit>.csv (a subfolder,
// so the sweep index does not read it) and appends one line per round to
// rounds.md there: when, the commit, federation's cache before and after, and
// the jobs that were querying the graph from GitHub Actions at the start.

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { ENDPOINTS } from '../constants/endpoints';
import { classifySparqlFailure, extractSparqlDetail } from '../errors';
import { normalise } from '../question';
import { buildEntityCountQuery, buildFusedHydrologyQuery, buildFusedNearQuery } from '../templates/fusedQueries';
import type { AnalysisQuestion, EntityType } from '../types/query';
import { cacheSavedMs, isWarm, parseMs, type PlanNode } from './coldRun';

const round = Number(process.argv[2]);
if (![1, 2, 3].includes(round)) {
  console.error('Usage: npx tsx engine/scripts/start-side-test.mts <round 1|2|3>');
  process.exit(1);
}

const URL_ = ENDPOINTS.federation;
const TIMEOUT_MS = 60_000;
const COMMIT = execSync('git rev-parse --short HEAD').toString().trim();
const STARTED = new Date();
const DIR = 'docs/query-sweep/start-side';
const OUT = `${DIR}/${STARTED.toISOString().slice(0, 10)}-r${round}-${COMMIT}.csv`;
if (existsSync(OUT)) {
  console.error(`${OUT} exists. A round is never rerun; pick the next round number.`);
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

// The test set (#135). Block A is the target, block C the anchor.
interface Shape {
  n: number;
  a: EntityType;
  rel: 'downstream' | 'near';
  c: EntityType;
  state?: string;
  km?: number;
  hops?: number;
}
const SHAPES: Shape[] = [
  { n: 1, a: 'facilities', rel: 'downstream', c: 'aquifers', state: '23', km: 30 },
  { n: 2, a: 'facilities', rel: 'downstream', c: 'waterBodies', state: '23', km: 30 },
  { n: 3, a: 'facilities', rel: 'downstream', c: 'wells', state: '23', km: 30 },
  { n: 4, a: 'waterBodies', rel: 'downstream', c: 'facilities', state: '23', km: 30 },
  { n: 5, a: 'waterBodies', rel: 'downstream', c: 'samples', state: '23', km: 30 },
  { n: 6, a: 'samples', rel: 'downstream', c: 'facilities', state: '23', km: 30 },
  { n: 7, a: 'wells', rel: 'downstream', c: 'samples' },
  { n: 8, a: 'waterBodies', rel: 'downstream', c: 'samples' },
  { n: 9, a: 'waterBodies', rel: 'downstream', c: 'facilities', state: '17', km: 30 },
  { n: 10, a: 'facilities', rel: 'downstream', c: 'waterBodies', state: '17', km: 30 },
  { n: 11, a: 'samples', rel: 'near', c: 'facilities', state: '23', hops: 1 },
  { n: 12, a: 'samples', rel: 'near', c: 'wells', state: '23', hops: 2 },
  { n: 13, a: 'wells', rel: 'near', c: 'facilities', state: '23', hops: 3 },
  { n: 14, a: 'waterBodies', rel: 'near', c: 'facilities', state: '23', hops: 4 },
];
const STATE_NAME: Record<string, string> = { '23': 'ME', '17': 'IL' };

const label = (s: Shape) => {
  const rel = s.rel === 'near' ? `near(${s.hops})` : `downstream${s.km ? `(${s.km}km)` : ''}`;
  return `${s.a} ${rel} ${s.c} [${s.state ? `${STATE_NAME[s.state]} both` : 'no region'}]`;
};

const question = (s: Shape): AnalysisQuestion => {
  const region = s.state ? { region: { stateCode: s.state } } : {};
  return {
    blockA: { type: s.a, ...region },
    relationship: { type: s.rel, ...(s.hops !== undefined ? { hops: s.hops } : {}), ...(s.km ? { maxDistanceKm: s.km } : {}) },
    blockC: { type: s.c, ...region },
  } as AnalysisQuestion;
};

interface Outcome {
  status: number;
  kind: string;
  clientMs: number;
  serverMs: number | null;
  planningMs: number | null;
  savedMs: number;
  rows: number | null;
  message: string;
}

async function send(query: string): Promise<Outcome> {
  const t0 = performance.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/qlever-results+json' },
      body: query,
      signal: abort.signal,
    });
    const text = await res.text();
    const clientMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { status: res.status, kind: classifySparqlFailure(res.status, text), clientMs, serverMs: null, planningMs: null, savedMs: 0, rows: null, message: extractSparqlDetail(text) };
    }
    const json = JSON.parse(text) as {
      resultSizeTotal?: number;
      resultsize?: number;
      time?: { total?: string };
      runtimeInformation?: { meta?: { time_query_planning?: number }; query_execution_tree?: PlanNode };
    };
    return {
      status: res.status,
      kind: 'ok',
      clientMs,
      serverMs: parseMs(json.time?.total),
      planningMs: json.runtimeInformation?.meta?.time_query_planning ?? null,
      savedMs: cacheSavedMs(json.runtimeInformation?.query_execution_tree),
      rows: json.resultSizeTotal ?? json.resultsize ?? null,
      message: '',
    };
  } catch (e) {
    const clientMs = Math.round(performance.now() - t0);
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { status: 0, kind: aborted ? 'timeout' : 'network', clientMs, serverMs: null, planningMs: null, savedMs: 0, rows: null, message: aborted ? `No response within ${TIMEOUT_MS / 1000}s` : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function count(query: string): Promise<number | null> {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
    body: query,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json()) as { results: { bindings: { count?: { value: string } }[] } };
  const v = json.results.bindings[0]?.count?.value;
  return v === undefined ? null : Number(v);
}

async function cacheStats(): Promise<string> {
  try {
    const res = await fetch(`${URL_}?cmd=cache-stats`, { signal: AbortSignal.timeout(20_000) });
    const s = (await res.json()) as Record<string, number>;
    return `${s['num-results-unpinned']} entries, ${(s['cache-size-unpinned'] / 1e9).toFixed(1)} GB`;
  } catch {
    return 'unread';
  }
}

// Jobs in this repo that query the graph (they share the sawgraph-endpoint
// concurrency group). Other users of apps.okn.us are invisible to us.
function otherJobs(): string {
  try {
    const out = execSync(
      `gh run list --limit 20 --json workflowName,status --jq '[.[] | select(.status != "completed") | select(.workflowName | test("sweep|Health|cache"; "i")) | .workflowName] | join("; ")'`,
    ).toString().trim();
    return out || 'none';
  } catch {
    return 'unknown (gh failed)';
  }
}

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 180)}"`;
writeFileSync(
  OUT,
  'runAt,commit,round,shape,label,rel,hops,km,region,anchorCount,targetCount,startSide,order,status,errorKind,serverMs,planningMs,savedMs,savedShare,warm,clientMs,rows,errorMsg\n',
);

const cacheBefore = await cacheStats();
const jobs = otherJobs();
console.log(`Round ${round} on ${COMMIT}, federation cache ${cacheBefore}, other jobs: ${jobs}`);

const mismatches: string[] = [];
for (const s of SHAPES) {
  const q = question(s);
  const n = normalise(q);
  const anchorCount = await count(buildEntityCountQuery(n.anchor, n.anchorRegion));
  const targetCount = await count(buildEntityCountQuery(n.target, n.targetRegion));
  const targetFirst = anchorCount !== null && targetCount !== null && targetCount < anchorCount;
  const order = targetFirst ? (['target', 'anchor'] as const) : (['anchor', 'target'] as const);
  const rowsBy: Record<string, number | null> = {};
  for (const [i, lead] of order.entries()) {
    const sides = { anchor: n.anchor, target: n.target, anchorRegion: n.anchorRegion, targetRegion: n.targetRegion, project: 'target', lead } as const;
    const query =
      s.rel === 'near' ? buildFusedNearQuery({ ...sides, hops: s.hops ?? 1 }) : buildFusedHydrologyQuery({ ...sides, maxDistanceKm: s.km });
    const at = new Date().toISOString().slice(0, 19);
    const o = await send(query);
    const total = o.serverMs ?? o.clientMs;
    const share = o.kind === 'ok' && total > 0 ? o.savedMs / total : 0;
    const warm = o.kind === 'ok' && isWarm(o.savedMs, total);
    if (o.kind === 'ok') rowsBy[lead] = o.rows;
    appendFileSync(
      OUT,
      [at, COMMIT, round, s.n, csv(label(s)), s.rel, s.hops ?? '', s.km ?? '', s.state ? STATE_NAME[s.state] : 'none', anchorCount ?? '', targetCount ?? '', lead, i + 1, o.status, o.kind, o.serverMs ?? '', o.planningMs ?? '', o.savedMs, share.toFixed(3), warm, o.clientMs, o.rows ?? '', csv(o.message)].join(',') + '\n',
    );
    console.log(
      `${String(s.n).padStart(2)} ${label(s).padEnd(46)} ${lead.padEnd(6)} ${String(o.status).padStart(3)} ${o.kind.padEnd(14)} ${String(o.serverMs ?? '-').padStart(6)}ms plan=${String(o.planningMs ?? '-').padStart(5)} saved=${String(o.savedMs).padStart(6)} ${warm ? 'WARM' : 'cold'} rows=${o.rows ?? '-'}`,
    );
  }
  if (rowsBy.anchor != null && rowsBy.target != null && rowsBy.anchor !== rowsBy.target)
    mismatches.push(`${label(s)}: anchor-led ${rowsBy.anchor}, target-led ${rowsBy.target}`);
}

const cacheAfter = await cacheStats();
const ended = new Date();
const roundsFile = `${DIR}/rounds.md`;
if (!existsSync(roundsFile)) {
  writeFileSync(
    roundsFile,
    '# Start-side test rounds\n\nOne line per round of `engine/scripts/start-side-test.mts` (map #133, #137). "Other jobs" are this repo\'s GitHub Actions jobs that query the graph, read at the start; other users of apps.okn.us are not visible.\n\n| Round | Started (UTC) | Ended (UTC) | Commit | CSV | federation cache before | after | Other jobs | Row mismatches |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n',
  );
}
appendFileSync(
  roundsFile,
  `| ${round} | ${STARTED.toISOString().slice(0, 16)} | ${ended.toISOString().slice(0, 16)} | ${COMMIT} | [${OUT.split('/').pop()}](./${OUT.split('/').pop()}) | ${cacheBefore} | ${cacheAfter} | ${jobs} | ${mismatches.join('; ') || 'none'} |\n`,
);
console.log(`\nWrote ${OUT}. Cache after: ${cacheAfter}.`);
if (mismatches.length) console.log(`Row mismatches:\n  ${mismatches.join('\n  ')}`);
