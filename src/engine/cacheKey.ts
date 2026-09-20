import type { AnalysisQuestion } from '../types/query';

// Two questions that produce the same SPARQL must produce the same cache key,
// and a question that produces different SPARQL must not. Raw JSON.stringify
// fails both directions: object key order is incidental, and the question
// carries display-only fields that never reach a query.
//
// Bump WIRE_VERSION when the set of result keys we store changes (see wire.ts) —
// old entries would then be missing data the map expects.
const WIRE_VERSION = 'w1';

// Bump DATA_VERSION after a knowledge-graph reload to make every existing key
// unreachable in one move.
//
// Deliberately a constant, not an environment variable: this value has to agree
// between the browser bundle and the warm-cache script, and an env var that
// differs between the two would produce silent, permanent cache misses with
// nothing to see in either place.
const DATA_VERSION = '2026-09';

// Label maps exist to render chips in the editor. Verified not to reach any
// query template (`grep -rn "Labels" src/engine/` finds nothing), so a user
// re-picking the same county with different label text must not miss the cache.
const DISPLAY_ONLY = new Set(['countyLabels', 'substanceLabels', 'industryLabels']);

// Filter arrays are sets — order is a UI artefact of the click sequence.
const UNORDERED_ARRAYS = new Set([
  'countyCodes',
  'countySubdivisionURIs',
  'substances',
  'materialTypes',
  'industryCodes',
  'waterTypes',
  'ftypes',
  'wellCategories',
  'aquiferTypes',
]);

function canonical(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    const items = value.map((v) => canonical(v)).filter((v) => v !== undefined);
    // An empty filter array means the same as no filter at all.
    if (items.length === 0) return undefined;
    return UNORDERED_ARRAYS.has(key ?? '') ? [...items].sort() : items;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      if (DISPLAY_ONLY.has(k)) continue;
      const v = canonical((value as Record<string, unknown>)[k], k);
      if (v !== undefined) out[k] = v;
    }
    // An object left empty carries no meaning either — `{ sampleFilters: {} }`
    // and a missing `sampleFilters` are the same question. Without this, a
    // filter the user set and then cleared would miss the cache forever.
    if (Object.keys(out).length === 0) return undefined;
    return out;
  }

  return value;
}

export function canonicalQuestion(question: AnalysisQuestion): unknown {
  const rel = question.relationship;
  // `hops` is only read on the near path (fusedQueries.ts buildFusedWhereBody),
  // so a leftover hops value from switching the dropdown must not split the key.
  //
  // Everything else on the relationship is carried through untouched, and that
  // is deliberate. An earlier version rebuilt this object as `{ type }` for the
  // trace relationships, which meant a field it did not know about vanished
  // from the key: when maxDistanceKm arrived, a 30km question and an unbounded
  // one hashed identically, and caching one would have served its answer for
  // the other — 12,000 river reaches and 14 sample points quietly missing.
  //
  // Keep the default direction safe. An unrecognised field that should have
  // been ignored only costs a cache miss; one that should have been included
  // and was dropped serves the wrong answer.
  const { hops, ...restOfRelationship } = rel;
  const relationship =
    rel.type === 'near' || rel.type === 'within'
      ? { ...restOfRelationship, hops: hops ?? 1 }
      : restOfRelationship;
  return canonical({ ...question, relationship });
}

export async function cacheKey(question: AnalysisQuestion): Promise<string> {
  const body = `${WIRE_VERSION}|${DATA_VERSION}|${JSON.stringify(canonicalQuestion(question))}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `q:${hex}`;
}

// Key for one sample point's observation table (the popup rows), cached
// server-side so a demo does not depend on the SPARQL endpoints answering on
// click. Same versioning as the question key: a graph reload retires both.
export async function sampleDetailKey(
  samplePointIri: string,
  filters?: unknown,
): Promise<string> {
  const body = `${DATA_VERSION}|${samplePointIri}|${JSON.stringify(canonical(filters ?? {}) ?? {})}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `s:${hex}`;
}
