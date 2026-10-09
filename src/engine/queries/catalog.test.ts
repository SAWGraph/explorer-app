// Golden-file snapshot of every query in the catalog. Fails on any diff, and
// the diff is the point: an intentional change shows exactly which other
// queries moved with it, then you re-record with `npm test -- -u`.
//
// Why this exists: near and downstream/upstream share one query builder
// (buildFusedWhereBody in src/engine/templates/fusedQueries.ts takes a `mode`
// and differs only in the middle hop). Everything else (entity binding, region
// clauses, IRI pinning, sample-observation joins) is common. So a fix aimed at
// a trace bug silently rewrites the `near` queries too, and the only thing that
// noticed until this existed was a live sweep taking about 30 minutes.
import { expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { catalog } from './catalog';
import { blastRadius, formatBlastRadius, renderSnapshot } from './snapshot';
import { renderQueriesDoc } from './docs';

const SNAPSHOT = new URL('./__snapshots__/query-shapes.txt', import.meta.url);

test('generated SPARQL matches the snapshot', async () => {
  const next = renderSnapshot(catalog());
  // Say which queries moved before the raw diff, so a "downstream fix" that
  // also moved 36 near shapes says so in the first lines of output.
  if (existsSync(SNAPSHOT)) {
    const prev = readFileSync(SNAPSHOT, 'utf8');
    if (prev !== next) console.log(formatBlastRadius(blastRadius(prev, next)));
  }
  await expect(next).toMatchFileSnapshot(SNAPSHOT.pathname);
});

// The query reference is generated from the same catalog, so it cannot
// describe a pipeline the engine no longer runs, which is what the
// hand-written docs/queries pages drifted into.
test('docs/QUERIES.md matches the code', async () => {
  await expect(renderQueriesDoc(catalog())).toMatchFileSnapshot(new URL('../../../docs/QUERIES.md', import.meta.url).pathname);
});
