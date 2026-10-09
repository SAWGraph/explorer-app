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
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PREFIXES } from '../../constants/prefixes';
import { catalog, prebuiltEntries } from './catalog';
import { blastRadius, formatBlastRadius, renderSnapshot } from './snapshot';
import { renderQueriesDoc, renderQuestionPage } from './docs';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';

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

// One page per dashboard question. These replaced hand-written pages that
// still described the six-step S2 pipeline months after the engine stopped
// running it.
describe('docs/queries pages match the code', () => {
  const entries = prebuiltEntries();
  PREBUILT_QUERIES.forEach((prebuilt, i) => {
    test(prebuilt.id, async () => {
      await expect(renderQuestionPage(prebuilt, entries[i])).toMatchFileSnapshot(
        new URL(`../../../docs/queries/${prebuilt.id}.md`, import.meta.url).pathname,
      );
    });
  });
});

// The wiki explains queries in prose and quotes them, which is the only
// hand-copied SPARQL left. Each quote must still be something the app sends:
// a whole query, or for a fragment, part of one. Region codes are compared as
// placeholders, so a page may pick its own example county.
describe('SPARQL quoted in docs/wiki is still what the app sends', () => {
  const norm = (q: string) =>
    q.replace(PREFIXES, '').replace(/administrativeRegion\.USA\.\d+/g, 'administrativeRegion.USA.N').replace(/\s+/g, ' ').trim();
  const sent = catalog().flatMap((e) => e.steps.map((s) => norm(s.query)));
  const whole = new Set(sent);
  const dir = new URL('../../../docs/wiki/', import.meta.url);
  for (const page of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const quotes = [...readFileSync(new URL(page, dir), 'utf8').matchAll(/```sparql\n([\s\S]*?)```/g)].map((m) => norm(m[1]));
    quotes.forEach((quote, i) => {
      test(`${page}, block ${i + 1}`, () => {
        const ok = /^(PREFIX|SELECT|ASK|CONSTRUCT)/.test(quote) ? whole.has(quote) : sent.some((q) => q.includes(quote));
        expect(ok, `this quote matches no query in the catalog: ${quote.slice(0, 200)}`).toBe(true);
      });
    });
  }
});
