// Warms the result cache for the dashboard questions.
//
//   CACHE_WRITE_TOKEN=... API_BASE=https://sawgraph-explorer-api-development.up.railway.app \
//     npx tsx scripts/warm-cache.mts
//
// Run this by hand after a knowledge-graph reload (and bump DATA_VERSION in
// src/engine/cacheKey.ts first, which makes every existing entry unreachable).
// Deliberately not a cron job: there is no scheduler in this service, and the
// thing a nightly run would guard against is a TTL we control.
//
// This is a trusted writer — it runs the real pipeline and uploads what it got,
// so nothing untrusted ever reaches another user's map.
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';
import { cacheKey } from '../src/engine/cacheKey';
import { toWire } from '../src/engine/wire';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.CACHE_WRITE_TOKEN;
const ONLY = process.argv[2]; // optional substring filter on the title
// A partial result means some slices failed. Serving one to every visitor for
// the next few hours is worse than letting them run it live and possibly get a
// complete answer, so prewarm skips them unless asked not to.
const ALLOW_PARTIAL = process.env.ALLOW_PARTIAL === '1';

if (!TOKEN) {
  console.error('CACHE_WRITE_TOKEN is required (must match the API service).');
  process.exit(1);
}

const targets = PREBUILT_QUERIES.filter((q) => !ONLY || q.title.toLowerCase().includes(ONLY.toLowerCase()));
console.log(`Warming ${targets.length} question(s) against ${API_BASE}\n`);

let warmed = 0;
let skipped = 0;

for (const prebuilt of targets) {
  const label = prebuilt.title.slice(0, 58);
  const startedAt = Date.now();
  process.stdout.write(`  ${label.padEnd(60)} `);

  try {
    const result = await executePipeline(planPipeline(prebuilt.question), prebuilt.question, () => {});
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);

    if (result.status !== 'success') {
      console.log(`skipped after ${elapsed}s (${result.status})`);
      skipped++;
      continue;
    }

    const wire = toWire(result);
    if (wire.partial?.length && !ALLOW_PARTIAL) {
      const missing = wire.partial.reduce((n, p) => n + p.failed.length + p.skipped.length, 0);
      console.log(`skipped after ${elapsed}s (partial: ${missing} slices missing; ALLOW_PARTIAL=1 to cache anyway)`);
      skipped++;
      continue;
    }

    const key = await cacheKey(prebuilt.question);
    const res = await fetch(`${API_BASE}/api/results/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Cache-Token': TOKEN },
      body: JSON.stringify({ question: prebuilt.question, result: wire }),
    });

    if (!res.ok) {
      console.log(`upload failed after ${elapsed}s (${res.status} ${(await res.text()).slice(0, 60)})`);
      skipped++;
      continue;
    }

    const { bytes } = (await res.json()) as { bytes: number };
    const partial = wire.partial?.length ? ' [partial]' : '';
    console.log(`cached in ${elapsed}s, ${(bytes / 1024).toFixed(0)}KB${partial}`);
    warmed++;
  } catch (err) {
    console.log(`error: ${err instanceof Error ? err.message.slice(0, 70) : String(err)}`);
    skipped++;
  }
}

console.log(`\n${warmed} cached, ${skipped} skipped`);
process.exit(skipped > 0 && warmed === 0 ? 1 : 0);
