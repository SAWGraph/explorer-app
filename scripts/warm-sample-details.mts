// Warms the popup observation rows for the demo prebuilt questions, so a demo
// does not depend on the SPARQL endpoints answering while someone clicks.
//
//   CACHE_WRITE_TOKEN=... API_BASE=https://sawgraph-explorer-api-development.up.railway.app \
//     npx tsx scripts/warm-sample-details.mts [id-substring ...]
//
// Same trusted-writer path as warm-cache.mts: the real query runs here and only
// the built popup payload is uploaded, under the `s:` key namespace.
//
// ponytail: sequential batches, no concurrency. It is a manual pre-demo run.
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';
import { sampleDetailKey } from '../src/engine/cacheKey';
import { buildSampleDetailsByIri } from '../src/engine/templates/hydrate';
import { buildSamplePointDetail } from '../src/engine/resultTransformer';
import { executeSparql } from '../src/engine/sparqlClient';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import type { SampleFilters } from '../src/types/query';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.CACHE_WRITE_TOKEN;
const BATCH = Number(process.env.BATCH ?? 20);
const MAX_POINTS = Number(process.env.MAX_POINTS ?? 2000);
// Which prebuilts to warm. Defaults to the demo set at the top of the list.
const DEFAULT_IDS = [
  'samples-near-airports-indiana',
  'facilities-upstream-pfos-york-cumberland',
  'samples-downstream-airports-indiana',
];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;

if (!TOKEN) {
  console.error('CACHE_WRITE_TOKEN is required (must match the API service).');
  process.exit(1);
}

const targets = PREBUILT_QUERIES.filter((q) => ids.some((id) => q.id.includes(id)));
if (targets.length === 0) {
  console.error(`No prebuilt matched ${ids.join(', ')}`);
  process.exit(1);
}

let stored = 0;
let failed = 0;

for (const prebuilt of targets) {
  console.log(`\n${prebuilt.title}`);
  const filters: SampleFilters | undefined =
    prebuilt.question.blockA.type === 'samples'
      ? prebuilt.question.blockA.sampleFilters
      : prebuilt.question.blockC.sampleFilters;

  const result = await executePipeline(planPipeline(prebuilt.question), prebuilt.question, () => {});
  if (result.status !== 'success') {
    console.log(`  pipeline ${result.status}, skipping`);
    failed++;
    continue;
  }

  const iris = [
    ...new Set(
      Object.values(result.data)
        .flat()
        .map((row) => row.sp)
        .filter((sp): sp is string => Boolean(sp)),
    ),
  ].slice(0, MAX_POINTS);
  console.log(`  ${iris.length} sample point(s)`);

  for (let i = 0; i < iris.length; i += BATCH) {
    const chunk = iris.slice(i, i + BATCH);
    try {
      const rows = await executeSparql('federation', buildSampleDetailsByIri(chunk, filters));
      const bySp = new Map<string, typeof rows>();
      for (const row of rows) {
        if (!row.sp) continue;
        const arr = bySp.get(row.sp);
        if (arr) arr.push(row);
        else bySp.set(row.sp, [row]);
      }

      for (const [sp, spRows] of bySp) {
        const detail = buildSamplePointDetail(spRows);
        if (!detail) continue;
        const res = await fetch(`${API_BASE}/api/results/${await sampleDetailKey(sp, filters)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Cache-Token': TOKEN },
          body: JSON.stringify({ question: { samplePointIri: sp, filters: filters ?? null }, result: detail }),
        });
        if (res.ok) stored++;
        else {
          failed++;
          console.log(`  upload failed for ${sp} (${res.status})`);
        }
      }
    } catch (err) {
      failed++;
      console.log(`  batch ${i} failed: ${err instanceof Error ? err.message.slice(0, 70) : String(err)}`);
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, iris.length)}/${iris.length} fetched, ${stored} cached`);
  }
  process.stdout.write('\n');
}

console.log(`\n${stored} sample point(s) cached, ${failed} failure(s)`);
process.exit(stored === 0 ? 1 : 0);
