// Runs the queries a change moved against the live endpoints, before and
// after, and reports both side by side as Markdown.
//
//   npx tsx scripts/sparql-live-diff.mts <base snapshot> [head snapshot] [--limit N]
//
// The snapshot tells you which queries a change touched; only the endpoints
// can say whether they still work. Both regressions on 2026-09-20 were timeouts
// on shapes the fix had not been aimed at, invisible to every offline check.
//
// Both versions come from snapshots, which hold every query body, so the base
// branch never needs checking out. Each query runs twice and the second run is
// reported: the engine answers 10 to 20x faster warm, and comparing a cold
// base with a warm head credits the change with the cache (docs/DEBUGGING.md,
// "Two measurement traps"). Strictly sequential, for the same reason.
//
// Steps that receive IRIs from an earlier step hold example.org placeholders
// in the snapshot and would measure nothing, so they are listed as skipped.
// Exits 1 if any query that worked before fails after.
import { readFileSync } from 'node:fs';
import { executeSparql } from '../src/engine/sparqlClient';
import { SparqlError } from '../src/engine/sparqlErrors';
import { blastRadius, parseSnapshot } from '../src/engine/queries/snapshot';
import type { EndpointKey } from '../src/constants/endpoints';

const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const LIMIT = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : 20;
const [basePath, headPath = new URL('../src/engine/queries/__snapshots__/query-shapes.txt', import.meta.url).pathname] = args;
if (!basePath) {
  console.error('usage: sparql-live-diff.mts <base snapshot> [head snapshot] [--limit N]');
  process.exit(2);
}

const baseText = readFileSync(basePath, 'utf8');
const headText = readFileSync(headPath, 'utf8');
const base = parseSnapshot(baseText);
const head = parseSnapshot(headText);
const { moved, added } = blastRadius(baseText, headText);

// Distinct changed queries, each remembering which entries it appears in.
interface Pair { endpoint: string; type: string; before?: string; after: string; entries: string[] }
const pairs = new Map<string, Pair>();
let skipped = 0;
for (const name of [...moved, ...added]) {
  const was = base.entries.get(name) ?? [];
  head.entries.get(name)!.forEach((step, i) => {
    const before = was[i]?.type === step.type ? was[i].hash : undefined;
    if (before === step.hash) return;
    if (head.query(step.hash)!.includes('http://example.org/')) return void skipped++;
    const key = `${step.endpoint} ${before} ${step.hash}`;
    const pair = pairs.get(key) ?? { endpoint: step.endpoint, type: step.type, before, after: step.hash, entries: [] };
    pair.entries.push(name);
    pairs.set(key, pair);
  });
}

interface Outcome { ok: boolean; rows: number; ms: number; error?: string }
async function measure(endpoint: string, query: string): Promise<Outcome> {
  let last: Outcome = { ok: false, rows: 0, ms: 0 };
  for (let i = 0; i < 2; i++) {
    const t = Date.now();
    try {
      const rows = await executeSparql(endpoint as EndpointKey, query);
      last = { ok: true, rows: rows.length, ms: Date.now() - t };
    } catch (err) {
      const kind = err instanceof SparqlError ? err.kind : 'error';
      last = { ok: false, rows: 0, ms: Date.now() - t, error: kind };
    }
  }
  return last;
}

const cell = (o?: Outcome) => (!o ? 'n/a' : o.ok ? `${o.rows} rows, ${(o.ms / 1000).toFixed(1)}s` : `fails (${o.error})`);
function verdict(b: Outcome | undefined, a: Outcome): string {
  if (!b) return a.ok ? 'new, works' : '**new, fails**';
  if (b.ok && !a.ok) return '**now fails**';
  if (!b.ok && a.ok) return 'now works';
  if (!b.ok && !a.ok) return 'still fails';
  const parts = [a.rows === b.rows ? 'same row count' : `rows ${b.rows} to ${a.rows}`];
  if (a.ms > 2 * b.ms && a.ms > 5000) parts.push('**slower**');
  return parts.join(', ');
}

const todo = [...pairs.values()];
console.log('### Live run of the changed queries\n');
if (!todo.length) {
  console.log(`No changed query can run on its own${skipped ? ` (${skipped} need IRIs from an earlier step)` : ''}.`);
  process.exit(0);
}
console.log(`${todo.length} distinct changed queries${todo.length > LIMIT ? `, running the first ${LIMIT}` : ''}. Second of two runs each, base then this branch.\n`);
console.log('| Step | Endpoint | Used by | Base | This branch | Verdict |');
console.log('| --- | --- | --- | --- | --- | --- |');
let regressions = 0;
for (const p of todo.slice(0, LIMIT)) {
  const b = p.before ? await measure(p.endpoint, base.query(p.before)!) : undefined;
  const a = await measure(p.endpoint, head.query(p.after)!);
  const v = verdict(b, a);
  if (v.includes('fails**')) regressions++;
  const used = p.entries.length > 1 ? `${p.entries[0]} and ${p.entries.length - 1} more` : p.entries[0];
  console.log(`| \`${p.type}\` | \`${p.endpoint}\` | ${used} | ${cell(b)} | ${cell(a)} | ${v} |`);
}
if (skipped) console.log(`\n${skipped} changed steps skipped: they need IRIs from an earlier step.`);
if (regressions) console.log(`\n**${regressions} queries that worked on the base branch fail on this one.**`);
process.exit(regressions ? 1 : 0);
