# Phase 3 — Cache what's already computed

**Status**: done
**Created**: 2026-09-14
**Completed**: 2026-09-14 (PRs #40, #42)

Phase 3 of [the query execution
plan](./2026-09-13-query-execution-architecture.md). Phases 1 and 2
(PR #38) bounded how much work one query does; this one stops us doing the same
work twice.

## Problem

Nothing remembers anything. The same query measures **26.5s cold and 1.5s warm**
on the graph engine, and today every user and every page reload races the same
cold cache.

The sharpest case is a shared link. `PublishedView.tsx:42-53` fetches only the
question JSON and then sets `pendingAutoRun`, so **every visitor re-runs the
entire pipeline in their own browser** — 26–218s, sometimes failing outright.
That is the flow that produced the original 429 screenshot.

The original spec (§4.5 of the Phase 1–2 plan) answered this by moving execution
to the server. Exploration found a cheaper answer: **the publisher's browser has
already computed the result.** When someone clicks Publish, `pipelineResult` is
sitting in the store. Sending it costs zero extra compute and needs no engine on
the server.

Target outcome: opening a cached link makes **zero requests to `apps.okn.us`**
and renders immediately.

## Approach

A results cache that only **trusted writers** populate:

| Writer | Authenticated by | Writes |
| --- | --- | --- |
| The publisher | the existing `editToken` (`publish.ts:9-15` `tokensMatch`) | their own published result |
| A maintainer script | `CACHE_WRITE_TOKEN`, never in the browser bundle | the 8 dashboard questions |

Reads are public. Because nothing untrusted can write, the cache-poisoning and
content-injection risks of an open write endpoint never arise. This matters more
than usual here: the tool renders PFAS contamination near named facilities, and
a poisoned cache would place fake readings on a real map, identically for every
visitor.

**The design constraint that shapes everything: the server never computes a
cache key.** So it never imports engine code, so there is no cross-package
bundling and no Railway build-root change. Two key namespaces, one table:

- `publish:<id>` — derived from the URL param the server already trusts
- `q:<sha256>` — computed by the client (to read) and the maintainer script (to
  write, token-authenticated); the server stores it verbatim

### Data model

Appended to `server/src/schema.sql`, which `db.ts:21` replays in full on every
boot — so every statement must stay idempotent.

```sql
CREATE TABLE IF NOT EXISTS query_results (
  cache_key     TEXT PRIMARY KEY,          -- 'publish:<id>' | 'q:<sha256>'
  question      JSONB NOT NULL,
  payload       BYTEA NOT NULL,            -- gzipped wire JSON
  payload_bytes INTEGER NOT NULL,
  source        TEXT NOT NULL,             -- 'publish' | 'prewarm'
  partial       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count     INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL
);

-- payload is already gzipped; don't let TOAST try to pglz it again
ALTER TABLE query_results ALTER COLUMN payload SET STORAGE EXTERNAL;
CREATE INDEX IF NOT EXISTS query_results_expires_at_idx ON query_results (expires_at);

ALTER TABLE published_workflows ADD COLUMN IF NOT EXISTS result_key TEXT;
```

**gzip bytea, not JSONB.** Payloads are 3–21 MB of JSON dominated by repeated
IRI prefixes, where gzip gets ~10–20×. Stored bytes are served verbatim with
`Content-Encoding: gzip` — never decompressed server-side, never re-compressed,
and the browser inflates transparently.

**TTL:** 30 days for a clean success; 6 hours when `partial` is true, because a
partial result means slices failed and a warmer engine may do better — it must
not freeze for a month. Only `status: 'success'` is cached; errors are usually
transient endpoint load.

### Server

Global JSON limit stays 64 kb (`index.ts:13`); the write routes get a
**route-scoped** `express.json({ limit: '25mb' })`.

- `server/src/routes/publish.ts` — `PUT /:id/result` (requires `editToken`,
  reuses `tokensMatch`; gzips with `node:zlib`, upserts under `publish:<id>`,
  sets `result_key`) and `GET /:id/result`.
- `server/src/routes/results.ts` (new) — `GET /:key` public read, bumping
  `hit_count`/`last_hit_at`, 404 on missing *or expired*; `PUT /:key` requiring
  `X-Cache-Token`, for the maintainer script only.
- `server/src/index.ts` — mount the router, and sweep
  `DELETE FROM query_results WHERE expires_at < now()` at boot.

### Client

- `src/engine/cacheKey.ts` (new, shared with the script) — canonicalises the
  question before hashing: strips display-only label maps (`countyLabels`,
  `substanceLabels`, `industryLabels` — verified never to reach a query
  template), sorts object keys and filter arrays, drops `undefined` and `[]`,
  and normalises `hops` (only read when `mode === 'near'`, per
  `fusedQueries.ts:209`, so `{type:'downstream', hops:3}` must share a key with
  `{type:'downstream'}`). Hash includes `WIRE_VERSION` and `DATA_VERSION`.
  Uses `crypto.subtle.digest`, which exists in both the browser and Node 18+.
- `src/engine/wire.ts` (new) — `toWire` trims `data` to the four keys the map
  actually consumes (`useMapLayers.ts:41-44`), dropping internal IRI lists;
  `fromWire` rebuilds a `PipelineResult`.
- `src/hooks/useQueryPipeline.ts` — try the cache first; on any miss or error
  fall through to today's local execution, unchanged. `?cache=off` forces local.
- `src/components/Layout/PublishedView.tsx` — with a `result_key`, fetch the
  cached result and `setPipelineResult` instead of setting `pendingAutoRun`.
  Without one, behaviour is exactly as today.
- `src/components/Layout/AnalysisQuestionBar.tsx:359` — after publishing
  succeeds, PUT the trimmed result. Fire-and-forget with a `.catch`, so
  publishing never fails because caching did.
- **Provenance**: the published view shows "Results computed &lt;date&gt;" and a
  **Re-run live** button. A cached map must never silently look like a fresh
  one — this tool's output ends up in reports.
- `scripts/warm-cache.mts` (new) — runs the 8 questions in
  `src/constants/prebuiltQueries.ts` through the real engine in Node (the
  pattern `scripts/query-matrix.mts` already proves works under `tsx`) and PUTs
  each result. Run by hand after a data update.

## Tasks

- [x] Save this plan into the repo; moved to `active/`
- [x] Retarget PR #38 to `development`; branch `phase-3-result-cache` off it
- [x] Remove the last Render references; document the four Railway services
- [x] `src/engine/cacheKey.ts` + `src/engine/wire.ts`, with a losslessness check
- [x] `schema.sql`: `query_results` table + `result_key` column
- [x] `server/src/routes/results.ts`; `PUT`/`GET /:id/result`; mount + boot sweeper
- [x] Read path: `useQueryPipeline.ts`, `PublishedView.tsx`, provenance UI
- [x] Write path: `AnalysisQuestionBar.tsx` after publish
- [x] `scripts/warm-cache.mts` for the 8 dashboard questions
- [x] Verify (below); update §4.5 of the Phase 1–2 plan; changelog entry

## Results (measured 2026-09-14, local Postgres 16 + live SPARQL endpoints)

The gate, on "Samples Near Landfills & DOD Sites in Penobscot and Knox County":

| | Time | Payload |
| --- | --- | --- |
| Cached | **37 ms** | 724 KB gzipped, one request |
| Live, warm graph engine | 6,604 ms | 5 requests to `apps.okn.us` |
| Live, cold graph engine | ~100 s | as above |

**178× on a warm engine**, and identical row counts either way
(`FIND_TARGET_ENTITIES=57 GET_ANCHOR_DETAILS=8 GET_REGION_BOUNDARIES=16`) —
the cached answer is the same answer.

Compression is better than estimated: a 1.4 MB wire payload stored as **86 KB**
(16×). Round-trip verification covered 15 cases — auth rejection (no token,
wrong token, wrong `editToken`), the 64 kb limit still holding on every other
route, gzip headers, `result_key` exposure, 404 on a miss, and byte-for-byte
losslessness through `toWire`/`fromWire`.

Two bugs the verification caught, both fixed:

- **The global 64 kb JSON parser rejected result uploads before the
  route-scoped parser ran.** Route-scoped body limits are useless if a global
  parser has already read the body; `index.ts` now skips the two upload paths.
- **Canonicalisation left empty objects behind**, so `{industryCodes: []}`
  hashed differently from a question with no filter at all — a filter set and
  then cleared would have missed its own cache entry forever.

## Notes

### Deliberately deferred, not dropped

- **Server-side execution** — needs engine bundling, a job+polling transport, a
  concurrency gate, and a *blocking* Railway change (the API build root would
  have to include `explorer/src`). The read path here is identical either way,
  so it can be swapped in later without touching the client.
- **SSE / progress streaming** — only needed if execution moves server-side.
- **Single-flight** — only implementable server-side, and N≈1 at this scale.
- **Nightly cron** — a maintainer-run script instead. No scheduled-job pattern
  exists in this repo, and the thing it would guard against is a TTL we control.

### Verification

A working database is the prerequisite. Docker is installed but its daemon is
not running: start Docker Desktop and
`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16`, then set
`DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres` and
`PGSSL=disable`. Alternatively use the Railway dev database's **public TCP
proxy** URL — the `*.railway.internal` host only resolves inside Railway.

1. **Migration idempotence** — boot twice; `runMigrations()` must succeed both
   times, including the `ALTER ... SET STORAGE`.
2. **Serialization losslessness** (no DB needed) — build map layers from a live
   `pipelineResult`, then from `fromWire(toWire(result))`, and compare per-layer
   feature counts. `SparqlRow` is `Record<string,string>` so it should be
   lossless; prove it rather than assume it.
3. **End-to-end** — publish, open `/p/:id` in a private window, confirm devtools
   shows **zero requests to `apps.okn.us`** and identical feature counts.
4. **The gate** — open-to-render for a published link, before and after. Target
   26–218s → under 2s. *If that number doesn't move dramatically, nothing else
   in Phase 3 is justified.*
5. **Auth** — `PUT` with no token, a wrong token, and a mismatched `editToken`
   must all be rejected; oversized bodies 413 on the write routes while the rest
   of the API keeps its 64 kb limit.
6. **No engine regression** — this scope adds files but changes no query logic;
   run one shape through `scripts/query-matrix.mts` to confirm.

### Risks

- **Size cap.** The Indiana dashboard pipeline was 21.2 MB raw. Trimming
  internal IRI lists (and the already-deleted details step) puts most under
  ~7 MB, but anything over the 25 MB cap is skipped — logged, with publishing
  still succeeding. A browser-side `CompressionStream` gzip before upload is the
  fallback if uploads prove slow; deliberately not built first.
- **Staleness.** A cached result is a snapshot. Mitigated by the 30-day TTL, the
  `DATA_VERSION` component of the key, the visible computed-on date, and the
  re-run control.
- **Hit rate for ad-hoc questions is probably low** — two users rarely build a
  byte-identical question by hand. The value is concentrated in published links
  and the dashboard queries, which is exactly where the trusted writers are.
- **`server/.env` currently points `DATABASE_URL` at a dead Render host.**
  Running `npm run dev` against it would migrate the wrong database. Replace it
  before any local server work.

### Warming the dashboard questions

A GitHub Action does this on a button press: **Actions → Warm result cache → Run
workflow**, pick `development` or `production`, optionally filter by title, then
Run. It checks out the repo, runs the eight questions through the real engine on
the runner, and uploads each result.

One-time setup: add repository secrets `CACHE_WRITE_TOKEN_DEV` and
`CACHE_WRITE_TOKEN_PROD` matching `CACHE_WRITE_TOKEN` on each API service. The
workflow fails with an explicit message if the one it needs is missing, rather
than silently uploading nothing.

Locally the same thing is `npm run warm-cache` with `API_BASE` and
`CACHE_WRITE_TOKEN` set. Run it after a graph reload (bump `DATA_VERSION`
first), after editing `prebuiltQueries.ts`, or when the 30-day TTL lapses.
Deliberately no schedule — the header of the workflow file shows the three lines
that would add one.

### Railway dashboard (manual, outside the repo)

Add `CACHE_WRITE_TOKEN` to both API services, and optionally `DATA_VERSION`. No
build-command, root-directory, or replica changes — that is the payoff of
keeping the engine out of the server.
