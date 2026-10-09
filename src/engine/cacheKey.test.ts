// The result-cache key. Cache-key bugs are silent in both directions and
// neither shows up in the UI: too-strict canonicalisation means a question
// never hits its own cached result, too-loose means two different questions
// share an answer and the map shows data for a question nobody asked.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cacheKey } from './cacheKey';
import { PREBUILT_QUERIES } from '../constants/prebuiltQueries';
import type { AnalysisQuestion } from '../types/query';

const q = (over: Record<string, unknown> = {}): AnalysisQuestion =>
  ({
    blockA: { type: 'samples', region: { stateCode: '23' }, ...(over.a ?? {}) },
    relationship: over.rel ?? { type: 'near', hops: 1 },
    blockC: { type: 'facilities', ...(over.c ?? {}) },
  }) as AnalysisQuestion;

// Same question, incidental differences: must share a key.
const SAME: Array<[string, AnalysisQuestion, AnalysisQuestion]> = [
  [
    'block key order',
    { blockA: q().blockA, relationship: q().relationship, blockC: q().blockC },
    { blockC: q().blockC, relationship: q().relationship, blockA: q().blockA } as AnalysisQuestion,
  ],
  [
    'display-only label maps',
    q({ a: { region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'Cumberland' } } } }),
    q({ a: { region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'CUMBERLAND, ME' } } } }),
  ],
  [
    'filter array order',
    q({ c: { facilityFilters: { industryCodes: ['481111', '488119'] } } }),
    q({ c: { facilityFilters: { industryCodes: ['488119', '481111'] } } }),
  ],
  ['cleared filter vs never set', q({ c: { facilityFilters: { industryCodes: [] } } }), q()],
  ['undefined filter vs absent', q({ a: { sampleFilters: { substances: undefined } } }), q()],
  // hops is only read on the near path, so a value left over from switching the
  // relationship dropdown must not split the key.
  ['stale hops on downstream', q({ rel: { type: 'downstream', hops: 3 } }), q({ rel: { type: 'downstream' } })],
  ['near hops defaults to 1', q({ rel: { type: 'near' } }), q({ rel: { type: 'near', hops: 1 } })],
  // An unbounded trace keeps the key it had before maxDistanceKm existed, so
  // entries cached earlier stay reachable.
  ['unbounded trace key is unchanged', q({ rel: { type: 'downstream' } }), q({ rel: { type: 'downstream', hops: 3 } })],
];

// Different questions: must not collide.
const DIFFERS: Array<[string, AnalysisQuestion, AnalysisQuestion]> = [
  ['hops on near', q({ rel: { type: 'near', hops: 1 } }), q({ rel: { type: 'near', hops: 3 } })],
  ['near vs downstream', q({ rel: { type: 'near', hops: 1 } }), q({ rel: { type: 'downstream' } })],
  ['state', q(), q({ a: { region: { stateCode: '17' } } })],
  [
    'industry filter',
    q({ c: { facilityFilters: { industryCodes: ['481111'] } } }),
    q({ c: { facilityFilters: { industryCodes: ['562212'] } } }),
  ],
  ['entity type', q(), { ...q(), blockC: { type: 'wells' } } as AnalysisQuestion],
  [
    'county added',
    q({ a: { region: { stateCode: '23', countyCodes: ['23005'] } } }),
    q({ a: { region: { stateCode: '23', countyCodes: ['23005', '23019'] } } }),
  ],
  // A distance bound changes the answer, so it must change the key. This is the
  // case that was wrong once: canonicalQuestion rebuilt the relationship as
  // `{ type }` for traces, silently dropping maxDistanceKm, so a bounded and an
  // unbounded question collided.
  ['maxDistanceKm vs unbounded', q({ rel: { type: 'upstream' } }), q({ rel: { type: 'upstream', maxDistanceKm: 30 } })],
  ['different maxDistanceKm', q({ rel: { type: 'upstream', maxDistanceKm: 30 } }), q({ rel: { type: 'upstream', maxDistanceKm: 10 } })],
  ['maxDistanceKm on downstream', q({ rel: { type: 'downstream' } }), q({ rel: { type: 'downstream', maxDistanceKm: 30 } })],
];

describe('same question, same key', () => {
  for (const [name, a, b] of SAME) {
    test(name, async () => assert.equal(await cacheKey(a), await cacheKey(b), `expected same key: ${name}`));
  }
});

describe('different question, different key', () => {
  for (const [name, a, b] of DIFFERS) {
    test(name, async () => assert.notEqual(await cacheKey(a), await cacheKey(b), `expected different keys: ${name}`));
  }
});

// The dashboard questions are what the warm-cache script writes: they must be
// distinct from each other and stable between runs.
test('dashboard questions have distinct, stable keys', async () => {
  const keys = await Promise.all(PREBUILT_QUERIES.map((p) => cacheKey(p.question)));
  assert.equal(new Set(keys).size, keys.length, 'dashboard questions must have distinct keys');
  assert.equal(await cacheKey(PREBUILT_QUERIES[0].question), keys[0], 'key must be stable across calls');
});
