// Runs the dashboard questions and writes down what happened, so a regression
// has a date attached to it instead of being noticed weeks later.
//
//   npx tsx scripts/health-check.mts <ref-label> [--out docs/health/history.jsonl]
//   npx tsx scripts/health-check.mts --render-only   # rebuild STATUS.md, no queries
//
// Deliberately takes no token and writes nothing to the API. It is pure
// measurement: every run goes through the real pipeline against the live
// endpoints, never the result cache, because a cached answer would tell us
// about the cache rather than the graph.
//
// Exit codes: 0 fine, 1 the script itself broke, 2 a question that worked last
// time does not work now.
//
// Every failure is retried once. Measured while building this: three questions
// failed in the first run (3-13s each) and all three succeeded immediately
// afterwards at 22-52s. The endpoint is shared and gets busy, and a check that
// opens an issue on a single bad request would cry wolf until it was ignored.
import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';

// The keys useMapLayers renders (wire.ts RENDERED_KEYS). Counting anything else
// would flag drift in intermediate bookkeeping the user never sees.
const COUNTED = ['FIND_TARGET_ENTITIES', 'GET_ANCHOR_DETAILS', 'GET_REGION_BOUNDARIES', 'GET_FLOWLINE_GEOMETRIES'] as const;

interface HealthRecord {
  runAt: string;
  ref: string;
  commit: string;
  id: string;
  title: string;
  status: 'success' | 'empty' | 'error';
  ms: number;
  counts: Record<string, number>;
  partialFailed: string[];
  partialSkipped: string[];
  error: string | null;
  // 2 means the first try failed. Worth recording: a question that needs the
  // retry every week is degrading even while it still counts as working.
  attempts: number;
}

const renderOnly = process.argv.includes('--render-only');
const ref = renderOnly ? '' : process.argv[2];
const outArg = process.argv.indexOf('--out');
const HISTORY = outArg > -1 ? process.argv[outArg + 1] : 'docs/health/history.jsonl';
const STATUS = `${dirname(HISTORY)}/STATUS.md`;

if (!ref && !renderOnly) {
  console.error('Usage: health-check.mts <ref-label> [--out path] | --render-only');
  process.exit(1);
}

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

function readHistory(): HealthRecord[] {
  if (!existsSync(HISTORY)) return [];
  return readFileSync(HISTORY, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HealthRecord);
}

const history = readHistory();
// The run this one is compared against: the most recent for the same branch.
const previousRunAt = [...new Set(history.filter((r) => r.ref === ref).map((r) => r.runAt))].sort().pop();
const previous = new Map(history.filter((r) => r.ref === ref && r.runAt === previousRunAt).map((r) => [r.id, r]));

if (renderOnly) {
  writeFileSync(STATUS, renderStatus(history));
  console.log(`Rebuilt ${STATUS} from ${history.length} records.`);
  process.exit(0);
}

const runAt = new Date().toISOString();
const records: HealthRecord[] = [];

console.log(`Dashboard health — ${ref} @ ${commit}, ${PREBUILT_QUERIES.length} questions\n`);

for (const prebuilt of PREBUILT_QUERIES) {
  const started = Date.now();
  process.stdout.write(`  ${prebuilt.title.slice(0, 54).padEnd(56)}`);

  let record = await attempt(prebuilt, 1);
  if (record.status === 'error') {
    process.stdout.write('retrying… ');
    record = await attempt(prebuilt, 2);
  }
  record.ms = Date.now() - started;

  records.push(record);
  console.log(`${icon(record)} ${(record.ms / 1000).toFixed(0).padStart(4)}s  ${summarise(record, previous.get(record.id))}`);
}

mkdirSync(dirname(HISTORY), { recursive: true });
appendFileSync(HISTORY, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(STATUS, renderStatus([...history, ...records]));

// A question that worked last week and does not work now. Drift in row counts
// is not a regression: the knowledge graph reloads, and numbers move for
// legitimate reasons. Only a status going backwards is worth waking someone for.
// A question with no previous record cannot have regressed — a first run, or a
// newly added question, must not open an issue for something that was never
// seen working.
const regressions = records.filter((r) => {
  const was = previous.get(r.id);
  return r.status === 'error' && was !== undefined && was.status !== 'error';
});
const working = records.filter((r) => r.status !== 'error').length;

console.log(`\n${working} of ${records.length} working, ${(records.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0)}s total`);
console.log(`History: ${HISTORY}   Status page: ${STATUS}`);

if (regressions.length) {
  console.log(`\nREGRESSIONS (${regressions.length}):`);
  for (const r of regressions) {
    const was = previous.get(r.id);
    console.log(`  ${r.title}`);
    console.log(`    now: error — ${r.error}`);
    console.log(`    was: ${was!.status} in ${(was!.ms / 1000).toFixed(0)}s on ${was!.runAt.slice(0, 10)}`);
  }
  process.exit(2);
}

async function attempt(prebuilt: (typeof PREBUILT_QUERIES)[number], n: number): Promise<HealthRecord> {
  const started = Date.now();
  const base = { runAt, ref, commit, id: prebuilt.id, title: prebuilt.title, attempts: n };
  try {
    const result = await executePipeline(planPipeline(prebuilt.question), prebuilt.question, () => {});
    const counts: Record<string, number> = {};
    if (result.status === 'success') {
      for (const key of COUNTED) if (result.data[key]?.length) counts[key] = result.data[key].length;
    }
    return {
      ...base,
      status: result.status,
      ms: Date.now() - started,
      counts,
      partialFailed: result.status === 'success' ? (result.partial ?? []).flatMap((p) => p.failed) : [],
      partialSkipped: result.status === 'success' ? (result.partial ?? []).flatMap((p) => p.skipped) : [],
      error: result.status === 'error' ? result.message.slice(0, 200) : null,
    };
  } catch (err) {
    // A thrown error is still a data point — the question is broken either way.
    return {
      ...base,
      status: 'error',
      ms: Date.now() - started,
      counts: {},
      partialFailed: [],
      partialSkipped: [],
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}

function icon(r: HealthRecord): string {
  return r.status === 'success' ? (r.partialFailed.length || r.partialSkipped.length ? '⚠️' : '✅') : r.status === 'empty' ? '⬜' : '❌';
}

function total(r: HealthRecord): number {
  return Object.values(r.counts).reduce((n, v) => n + v, 0);
}

function summarise(r: HealthRecord, was?: HealthRecord): string {
  if (r.status === 'error') return (r.error ?? '').slice(0, 50);
  const now = total(r);
  if (!was || was.status === 'error') return `${now} rows`;
  const drift = now - total(was);
  return drift === 0 ? `${now} rows` : `${now} rows  (${drift > 0 ? '+' : ''}${drift})`;
}

function renderStatus(all: HealthRecord[]): string {
  const refs = [...new Set(all.map((r) => r.ref))].sort();
  const out = [
    '# Dashboard health',
    '',
    '_Generated by `npm run health-check` — see the weekly workflow in',
    '`.github/workflows/health-check.yml`. Every run goes through the live pipeline,',
    'never the result cache._',
    '',
    '**Targets** are the entities the question asks for, **anchors** the ones it',
    'relates them to, **reaches** the river segments drawn for a trace. Region',
    'boundaries are recorded in the history but not shown — they are the county',
    'outline, not an answer.',
    '',
    'A moved count is not automatically a bug: the knowledge graph reloads and',
    'numbers change for real reasons. It is flagged so that when something *does*',
    'look wrong, there is a date to point at.',
    '',
  ];

  for (const r of refs) {
    const runs = [...new Set(all.filter((x) => x.ref === r).map((x) => x.runAt))].sort();
    const latest = all.filter((x) => x.ref === r && x.runAt === runs[runs.length - 1]);
    const prior = new Map(all.filter((x) => x.ref === r && x.runAt === runs[runs.length - 2]).map((x) => [x.id, x]));
    if (!latest.length) continue;

    const ok = latest.filter((x) => x.status !== 'error').length;
    out.push(
      `## ${r}`,
      '',
      `**${ok} of ${latest.length} working** · ${latest[0].runAt.slice(0, 16).replace('T', ' ')} UTC · \`${latest[0].commit}\``,
      '',
      '| | Question | Time | Targets | Anchors | Reaches | Change since last run |',
      '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    );
    for (const x of latest) {
      const was = prior.get(x.id);
      const cell = (k: string) => (x.status === 'error' ? '—' : (x.counts[k] ?? 0) || '—');
      out.push(
        `| ${icon(x)} | ${x.title} | ${(x.ms / 1000).toFixed(0)}s | ${cell('FIND_TARGET_ENTITIES')} | ${cell('GET_ANCHOR_DETAILS')} | ${cell('GET_FLOWLINE_GEOMETRIES')} | ${change(x, was)} |`,
      );
    }
    out.push('');

    const notes = latest.filter((x) => x.partialFailed.length || x.partialSkipped.length);
    if (notes.length) {
      out.push('**Incomplete answers:**', '');
      for (const x of notes) {
        const bits = [
          x.partialFailed.length ? `could not answer ${x.partialFailed.join(', ')}` : '',
          x.partialSkipped.length ? `ran out of time before ${x.partialSkipped.join(', ')}` : '',
        ].filter(Boolean);
        out.push(`- ${x.title} — ${bits.join('; ')}`);
      }
      out.push('');
    }

    const errors = latest.filter((x) => x.status === 'error');
    if (errors.length) {
      out.push('**Errors:**', '');
      for (const x of errors) out.push(`- ${x.title} — \`${x.error}\``);
      out.push('');
    }
  }

  out.push('---', '', `Full history: [\`${HISTORY.split('/').pop()}\`](./${HISTORY.split('/').pop()}) — one JSON line per question per run.`, '');
  return out.join('\n');
}

function change(now: HealthRecord, was?: HealthRecord): string {
  if (!was) return '_first run_';
  if (was.status !== now.status) return `**was ${was.status}** on ${was.runAt.slice(0, 10)}`;
  if (now.status === 'error') return 'still failing';
  const drift = total(now) - total(was);
  if (drift === 0) return '—';
  const perKey = COUNTED.filter((k) => (now.counts[k] ?? 0) !== (was.counts[k] ?? 0))
    .map((k) => `${label(k)} ${was.counts[k] ?? 0} → ${now.counts[k] ?? 0}`)
    .join(', ');
  return `**${perKey}**`;
}

function label(key: string): string {
  return { FIND_TARGET_ENTITIES: 'targets', GET_ANCHOR_DETAILS: 'anchors', GET_REGION_BOUNDARIES: 'boundaries', GET_FLOWLINE_GEOMETRIES: 'reaches' }[key] ?? key;
}
