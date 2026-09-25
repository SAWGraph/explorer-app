// Warms the cache for a list of questions given as JSON, for demos or any other
// set that is not in prebuiltQueries.ts.
//
//   CACHE_WRITE_TOKEN=... API_BASE=https://... npx tsx scripts/warm-questions.mts demo-questions.json
//
// The file is a JSON array of { title, question }. Same trusted-writer path as
// warm-cache.mts: the real pipeline runs here, and only the result is uploaded.
import { readFileSync } from 'node:fs';
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';
import { cacheKey } from '../src/engine/cacheKey';
import { toWire } from '../src/engine/wire';
import type { AnalysisQuestion } from '../src/types/query';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.CACHE_WRITE_TOKEN;
const ALLOW_PARTIAL = process.env.ALLOW_PARTIAL === '1';
const FILE = process.argv[2];

if (!TOKEN) { console.error('CACHE_WRITE_TOKEN is required.'); process.exit(1); }
if (!FILE) { console.error('Usage: warm-questions.mts <questions.json>'); process.exit(1); }

const items = JSON.parse(readFileSync(FILE, 'utf8')) as { title: string; question: AnalysisQuestion }[];
console.log(`Warming ${items.length} question(s) against ${API_BASE}\n`);

let warmed = 0, skipped = 0;
for (const item of items) {
  const started = Date.now();
  process.stdout.write(`  ${item.title.slice(0, 52).padEnd(54)}`);
  try {
    const result = await executePipeline(planPipeline(item.question), item.question, () => {});
    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    if (result.status !== 'success') { console.log(`skipped after ${elapsed}s (${result.status})`); skipped++; continue; }

    const wire = toWire(result);
    if (wire.partial?.length && !ALLOW_PARTIAL) {
      const missing = wire.partial.reduce((n, p) => n + p.failed.length + p.skipped.length, 0);
      console.log(`skipped after ${elapsed}s (partial: ${missing} slices missing)`);
      skipped++; continue;
    }

    const res = await fetch(`${API_BASE}/api/results/${await cacheKey(item.question)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Cache-Token': TOKEN },
      body: JSON.stringify({ question: item.question, result: wire }),
    });
    if (!res.ok) { console.log(`upload failed after ${elapsed}s (${res.status})`); skipped++; continue; }
    const { bytes } = (await res.json()) as { bytes: number };
    console.log(`cached in ${elapsed}s, ${(bytes / 1024).toFixed(0)}KB`);
    warmed++;
  } catch (err) {
    console.log(`error: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`);
    skipped++;
  }
}
console.log(`\n${warmed} cached, ${skipped} skipped`);
