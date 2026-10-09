// Self-check for the result-cache key (src/engine/cacheKey.ts).
//
//   npx tsx scripts/check-cache-key.mts
//
// Cache-key bugs are silent in both directions and neither shows up in the UI:
// too-strict canonicalisation means a question never hits its own cached result,
// too-loose means two different questions share an answer and the map shows data
// for a question nobody asked. Hence a runnable check rather than a comment.
import assert from 'node:assert/strict';
import { cacheKey, sampleDetailKey } from '../src/engine/cacheKey';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import type { AnalysisQuestion } from '../src/types/query';

const q = (over: Record<string, unknown> = {}): AnalysisQuestion =>
  ({
    blockA: { type: 'samples', region: { stateCode: '23' }, ...(over.a ?? {}) },
    relationship: over.rel ?? { type: 'near', hops: 1 },
    blockC: { type: 'facilities', ...(over.c ?? {}) },
  }) as AnalysisQuestion;

let checks = 0;
async function same(name: string, a: AnalysisQuestion, b: AnalysisQuestion) {
  assert.equal(await cacheKey(a), await cacheKey(b), `expected same key: ${name}`);
  checks++;
}
async function differs(name: string, a: AnalysisQuestion, b: AnalysisQuestion) {
  assert.notEqual(await cacheKey(a), await cacheKey(b), `expected different keys: ${name}`);
  checks++;
}

// Same question, incidental differences — must share a key.
await same(
  'block key order',
  { blockA: q().blockA, relationship: q().relationship, blockC: q().blockC },
  { blockC: q().blockC, relationship: q().relationship, blockA: q().blockA } as AnalysisQuestion,
);
await same(
  'display-only label maps',
  q({ a: { region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'Cumberland' } } } }),
  q({ a: { region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'CUMBERLAND, ME' } } } }),
);
await same(
  'filter array order',
  q({ c: { facilityFilters: { industryCodes: ['481111', '488119'] } } }),
  q({ c: { facilityFilters: { industryCodes: ['488119', '481111'] } } }),
);
await same('cleared filter vs never set', q({ c: { facilityFilters: { industryCodes: [] } } }), q());
await same('undefined filter vs absent', q({ a: { sampleFilters: { substances: undefined } } }), q());
// hops is only read on the near path, so a value left over from switching the
// relationship dropdown must not split the key.
await same('stale hops on downstream', q({ rel: { type: 'downstream', hops: 3 } }), q({ rel: { type: 'downstream' } }));
await same('near hops defaults to 1', q({ rel: { type: 'near' } }), q({ rel: { type: 'near', hops: 1 } }));

// Different questions — must not collide.
await differs('hops on near', q({ rel: { type: 'near', hops: 1 } }), q({ rel: { type: 'near', hops: 3 } }));
await differs('near vs downstream', q({ rel: { type: 'near', hops: 1 } }), q({ rel: { type: 'downstream' } }));
await differs('state', q(), q({ a: { region: { stateCode: '17' } } }));
await differs(
  'industry filter',
  q({ c: { facilityFilters: { industryCodes: ['481111'] } } }),
  q({ c: { facilityFilters: { industryCodes: ['562212'] } } }),
);
await differs('entity type', q(), { ...q(), blockC: { type: 'wells' } } as AnalysisQuestion);
await differs(
  'county added',
  q({ a: { region: { stateCode: '23', countyCodes: ['23005'] } } }),
  q({ a: { region: { stateCode: '23', countyCodes: ['23005', '23019'] } } }),
);

// A distance bound changes the answer, so it must change the key. This is the
// case that was wrong once: canonicalQuestion rebuilt the relationship as
// `{ type }` for traces, silently dropping maxDistanceKm, so a bounded and an
// unbounded question collided.
await differs(
  'maxDistanceKm vs unbounded',
  q({ rel: { type: 'upstream' } }),
  q({ rel: { type: 'upstream', maxDistanceKm: 30 } }),
);
await differs(
  'different maxDistanceKm',
  q({ rel: { type: 'upstream', maxDistanceKm: 30 } }),
  q({ rel: { type: 'upstream', maxDistanceKm: 10 } }),
);
await differs(
  'maxDistanceKm on downstream',
  q({ rel: { type: 'downstream' } }),
  q({ rel: { type: 'downstream', maxDistanceKm: 30 } }),
);
// ...while an unbounded trace keeps the key it had before maxDistanceKm existed,
// so entries cached earlier stay reachable.
await same(
  'unbounded trace key is unchanged',
  q({ rel: { type: 'downstream' } }),
  q({ rel: { type: 'downstream', hops: 3 } }),
);

// The dashboard questions are what the warm-cache script writes: they must be
// distinct from each other and stable between runs.
const keys = await Promise.all(PREBUILT_QUERIES.map((p) => cacheKey(p.question)));
assert.equal(new Set(keys).size, keys.length, 'dashboard questions must have distinct keys');
assert.equal(await cacheKey(PREBUILT_QUERIES[0].question), keys[0], 'key must be stable across calls');
checks += 2;

// Sample-point popup keys (warm-sample-details.mts writes these). The filter
// argument is part of the key: the same point under a substance filter is a
// different observation table.
const spA = 'http://w3id.org/sawgraph/v1/me-egad#d.SamplePoint.1';
const spB = 'http://w3id.org/sawgraph/v1/me-egad#d.SamplePoint.2';
const pfos = { substances: ['http://w3id.org/DSSTox/v1/DTXSID3031864'] };
assert.equal(await sampleDetailKey(spA), await sampleDetailKey(spA), 'sample key must be stable');
assert.notEqual(await sampleDetailKey(spA), await sampleDetailKey(spB), 'different points differ');
assert.notEqual(await sampleDetailKey(spA), await sampleDetailKey(spA, pfos), 'filters are part of the key');
assert.equal(
  await sampleDetailKey(spA, { substances: [] }),
  await sampleDetailKey(spA),
  'an emptied filter must not miss the cache',
);
assert.ok((await sampleDetailKey(spA)).startsWith('s:'), 'sample keys live in the s: namespace');
checks += 5;

console.log(`cache key: ${checks} checks passed`);
