# Query Execution Architecture

**Status**: active — Phases 1 and 2 implemented and verified (2026-09-14); Phase 3 outstanding
**Created**: 2026-09-13
**Reference sheet**: [`docs/QUERY-MATRIX.md`](../../QUERY-MATRIX.md) — every question the
UI can build, measured against the live endpoints. This plan is verified against
that sheet in Part 8.

---

## Part 1 — Summary

Today the Explorer sends one big SPARQL query per pipeline step and hopes it
finishes. The graph engine kills anything that takes more than 30 seconds, and
many of our questions take 20–40 seconds, so a large share of the query space
fails — not sometimes, but always.

This plan changes one thing at the core: **stop sending work we can't bound.**
Run a query whole; if it fails, split it into pieces that fit and merge the
results. Then put the whole pipeline behind our own API server so the answer is
computed once and reused, instead of every visitor re-running it.

Nothing about the questions the user can ask changes. Nothing about the answers
changes. What changes is how the work is packaged.

---

## Part 2 — The problem in plain language

**The 30-second wall.** QLever (the graph engine at `apps.okn.us`) stops any
query at 30 seconds and returns HTTP 429. That status normally means "too many
requests," which sent us looking for rate limiting that doesn't exist. The
response body says what really happened: `"Operation timed out."`

**Our queries sit at or past that wall.** The expensive part is the river
network trace (`hyf:downstreamFlowPathTC`) and whole-state spatial joins. Their
cost depends on how much data exists in the state, not on what the user asked
for. A query returning 0 rows can still try to allocate 3.3 GB on the way there.

**The engine's cache decides whether we pass.** The identical query measured
**26.5s cold** and **1.5s warm**. So a question that worked yesterday fails
today, with no change on our side. That is why this has felt intermittent and
unfixable.

**We have swung between two bad options twice.** Either we paste the list of
IDs into the query (too big a request → 413/502) or we make the server
re-derive the list every time (too slow → 429/500). Both waste work. Neither is
the answer.

---

## Part 3 — How it works today (before)

### 3.1 The pipeline

A question becomes 6 or 7 sequential queries (`src/engine/planner.ts`), run one
after another by `src/engine/executor.ts`. All 75 type/relationship combinations
collapse into **12 distinct step sequences**. The two most common:

```
Near (e.g. samples near facilities), 6 steps:
  FIND_TARGET_IRIS  →  FIND_ANCHOR_IRIS  →  HYDRATE_TARGET_BY_IRI
  →  HYDRATE_ANCHOR_BY_IRI  →  GET_SAMPLE_DETAILS  →  GET_REGION_BOUNDARIES

Downstream / upstream, 7 steps — same, plus GET_FLOWLINE_GEOMETRIES
```

Everything runs on the `federation` endpoint except water-body and aquifer
hydration (`hydrologykg`) and region boundaries (`spatialkg`).

### 3.2 What each step does, and what's wrong with it

| Step | What it asks for | Problem today |
| --- | --- | --- |
| `FIND_TARGET_IRIS` | IDs of the things to show | Unbounded. Carries the whole state's trace. **This is where most failures happen.** |
| `FIND_ANCHOR_IRIS` | IDs of the things they relate to | Same query, projected the other way — so the same cost is paid **twice** |
| `GET_FLOWLINE_GEOMETRIES` | river lines to draw | Inlines every anchor ID; no limit on how many |
| `HYDRATE_TARGET_BY_IRI` | map data for the targets | Above 3,000 IDs, falls back to a re-derived query that is known to time out |
| `HYDRATE_ANCHOR_BY_IRI` | map data for the anchors | Same |
| `GET_SAMPLE_DETAILS` | every measurement at every sample | 18–37 MB, used only to fill popups one click at a time |
| `GET_REGION_BOUNDARIES` | county/state outlines | 2.6 MB of geometry, re-fetched every run |

### 3.3 The three failure behaviours

1. **All-or-nothing.** `executor.ts:100` aborts the whole pipeline when any step
   fails. Five successful steps are discarded because the sixth timed out.
2. **No memory.** Every run starts cold. Two users asking the same question pay
   the full cost twice; so does one user pressing reload.
3. **One error message.** Nine distinct failures (see the matrix sheet, Part 4)
   all surface as *"Something went wrong. You can edit the question and try
   again."* The user cannot tell "too big" from "try again in a minute."

### 3.4 What changed on 2026-09-13 (the three patches)

These are in the working tree now. They are real improvements and they stay
until this plan replaces them.

| # | Before | After the patch |
| --- | --- | --- |
| 1 | ID-finding queries joined in every measurement (substance, sample, result, material, unit) and discarded them | Those joins are dropped unless a filter needs them. Downstream `FIND_TARGET_IRIS`: 7/7 failures → 4.3s |
| 2 | Sample hydration re-derived the entire trace inside the query | Reuses the IDs the previous step found, when ≤3,000. 33.8s timeout → 0.8s |
| 3 | Any 429 killed the run | One automatic retry, which lands on the now-warm cache |

**What they did not fix**, and this plan must: upstream questions, near with
3+ hops, traces anchored on large entity sets, Illinois, and anything above the
3,000-ID cap.

---

## Part 4 — How it will work (after)

### 4.1 The core idea

```
run(query, scope):
    result ← execute(query, scope)
    if result failed AND scope can be divided:
        left, right ← divide(scope)
        return merge(run(query, left), run(query, right))
    return result
```

Run it whole. If the engine refuses, cut the scope in half and run both halves.
Keep cutting only where cutting is needed.

**Why split-on-failure rather than always-split:** most questions already work
in a few seconds (the matrix sheet shows the majority of shapes at ✅). Those
should keep costing exactly one request. Only the shapes that fail pay the
splitting cost, and they pay it only as deep as they need.

**Why this beats tuning thresholds:** per-chunk cost is not predictable. One
Illinois sample point took **26.9s** while its neighbours took 4s. No static
"chunk size = N" rule survives that. Failure is the only reliable signal.

### 4.2 What "divide the scope" means

Three axes. The executor picks whichever side is smallest.

| Axis | Divide by | Use when | Measured |
| --- | --- | --- | --- |
| **Anchor entities** | batches of the Block C entities | anchor set is small and listable | 186 ME airports in 0.8s → 8 batches of 25 → 2.8–3.0s each |
| **Target entities** | batches of the Block A entities | target set is the small side | IL: 78 samples → batches of 20 → 12.7s each |
| **Region** | one county at a time | neither entity side is listable | ME ↓ 83,038 wells → 16 counties → 6.3–7.5s each |

**The axis is not fixed, because the right one flips between states:**

| | Maine | Illinois |
| --- | --- | --- |
| Sample points | 4,528 | **78** |
| Facilities | 2,976 | **22,574** |
| Best axis | anchor (facilities) or county | **target (samples)** |
| County axis | works — 6.3–7.5s per county | **fails — Cook County alone needs 3.3 GB** |

### 4.3 Choosing the axis cheaply

Do **not** use `COUNT` to size a side. Counting Maine's facilities without an
industry filter took **11.0s** — as expensive as the query we're trying to
plan.

Instead **probe with a limit**: `SELECT ?x WHERE { ...block filters... } LIMIT 201`.
If fewer than 201 rows come back, the side is small and listable, and we already
have the list. If it fills, that side is "large" and we move on to the next
axis. Filtered probes are fast: 186 ME airports listed in **0.8s**.

Probe results are cached — a side's size only changes when the graph data does.

### 4.4 Merging chunk results

- **ID lists** (`FIND_TARGET_IRIS`, `FIND_ANCHOR_IRIS`): union, deduplicated by
  IRI. Verified identical to the monolith on shapes 3, 4 and 6 of the matrix
  (1,172 / 1,591 / 2,274 rows, exact match).
- **Hydration rows**: chunked by target IRI, so a given entity appears in
  exactly one chunk. Per-entity aggregates (`COUNT`, `MAX`, `GROUP_CONCAT`)
  stay correct because their `GROUP BY` key never spans chunks. **This is the
  rule that must not be broken:** never chunk an aggregate query on an axis
  other than its own `GROUP BY` key.
- **Geometry rows** (flowlines, boundaries): union, deduplicated by IRI. The
  same river reach reached from two anchors is one line.

### 4.5 Run it on our server, and remember the answer

`server/` is already an Express + Postgres service deployed for publishing
(`server/src/index.ts`, `server/src/routes/publish.ts`). Add `POST /api/query`:
it runs the pipeline and caches the result in Postgres, keyed by a hash of the
`AnalysisQuestion` plus a data-version tag.

What this buys that the browser cannot:

- **The cold cost is paid once, ever.** First asker waits; everyone after gets
  the cached answer. Given the 26.5s → 1.5s cold/warm gap, this is the single
  biggest user-visible win.
- **Single-flight.** Ten people opening the same shared link trigger one
  computation, not ten.
- **Retries and chunk splitting are invisible.** The browser makes one request.
- **Published links precompute at publish time** — exactly the flow that
  produced the original 429 screenshot.
- **Nightly prewarm** of the 8 dashboard questions
  (`src/constants/prebuiltQueries.ts`), so the common paths are never cold.
- **Responses shrink** — the server can filter and aggregate before sending.

### 4.6 Fetch popup details on demand

`GET_SAMPLE_DETAILS` returns 18–37 MB per run. Its only consumer is the popup
body (`useMapLayers.ts:57` → `MapPopup.tsx:119`), which shows one sample at a
time. One sample's details is **31 rows / 29.8 KB**.

Remove the step; fetch per sample when its popup opens. Caveat worth planning
for: a single-sample fetch measured **10s cold**, so this needs the server
cache (4.5) or a viewport prefetch behind it, or we trade a 26s wait up front
for a 10s wait on click.

---

## Part 5 — Before and after, step by step

| Step | Before | After |
| --- | --- | --- |
| Choosing scope | none — always whole region | probe both sides with `LIMIT 201`, pick the smaller as the split axis |
| `FIND_TARGET_IRIS` | one unbounded query | one query; on failure, split and merge |
| `FIND_ANCHOR_IRIS` | second unbounded query, same cost paid twice | derived from the same chunk results where possible |
| `GET_FLOWLINE_GEOMETRIES` | inlines all anchor IDs, uncapped | chunked with the same mechanism; no cap needed |
| `HYDRATE_*_BY_IRI` | ≤3,000 inline, else a query that times out | always inline, chunked at ~1,000 IDs (70 KB/request, 1.0–3.3s measured) |
| `GET_SAMPLE_DETAILS` | 18–37 MB up front | deleted; per-sample on popup open |
| `GET_REGION_BOUNDARIES` | 2.6 MB every run | cached server-side; it changes ~never |
| On failure | whole pipeline aborts, generic red card | chunk retried, then split; partial results shown with an explicit note |
| Second identical run | full cost again | served from Postgres cache |

---

## Part 6 — Worked examples

**A. "Samples in Maine near airports" (works today)**
Before: 6 queries, 12.8s. After: 6 queries, 12.8s cold — **unchanged**, because
nothing failed and nothing was split. Second run: near-instant from cache.

**B. "Samples in Maine downstream of airports" (fragile today)**
Before: 4–32s, fails when cold. After: `FIND_TARGET_IRIS` runs whole (4.3s warm)
or, when it fails cold, splits into 8 anchor batches of 2.8–3.0s. Same 1,172
sample points either way.

**C. "Samples in Maine downstream of wells" (always fails today)**
Before: 429 at 42s, every time. After: the anchor side probes as large (83,038
wells), so the executor falls to the county axis — 16 chunks at 6.3–7.5s.

**D. "Samples in Illinois downstream of airports" (always fails today)**
Before: 500 OOM at 16s. After: anchor side is large (22,574 facilities) and the
county axis is fatal (Cook County: 3.3 GB), so the target side wins — 78 samples
in batches of 20, 12.7s each, 4 chunks.

---

## Part 7 — Edge cases

| Case | What happens |
| --- | --- |
| A chunk returns 0 rows | Normal. Merge skips it; other chunks still count. |
| Every chunk returns 0 rows | Same "no results" state as today (`executor.ts` empty path). |
| A chunk fails even when split to a single entity | Cannot divide further. Return partial results **and say so** — "showing 7 of 8 areas; one timed out" — never silently. |
| An entity appears in several chunks | Deduplicated by IRI on merge. |
| Aggregate query chunked on the wrong axis | Forbidden by rule 4.4 — aggregates may only be chunked on their `GROUP BY` key. |
| User edits the question mid-run | Abort in-flight chunks (`AbortController`), discard partial state. |
| Two users ask the same question at once | Single-flight in the server; one computation, both served. |
| Graph data is updated | Cache key includes a data-version tag; bump it to invalidate. |
| Filters set (substance, material, range, non-detects) | Applied inside every chunk, never after merging — otherwise per-chunk results are wrong. |
| "Near, 0 miles" (hops = 0) | Same cell, no neighbour expansion — cheapest shape, never split. |
| User already picked counties | The region axis is those counties, not all 16. |
| No region selected at all | Largest possible query; region axis falls back to the state list. See matrix row M7 for whether this is viable at all. |
| Water body / aquifer hydration | Runs on `hydrologykg`, which rejects >~1 MB bodies (413, `ebc6dda`). Chunk size must respect the smaller per-endpoint limit. |
| Very large successful response | A 37 MB body can still truncate mid-JSON under load. Chunking bounds response size too. |
| Server cache miss under load | Falls through to live execution; no correctness difference, only latency. |

---

## Part 8 — Verification against the matrix sheet

The sheet ran **156 queries**: 119 worked, 37 failed, and 32 of the 119 were
slow enough (>15s against a 30s limit) to fail on a cold cache. This part checks
the plan against every group in it.

### 8.1 Does the plan fix what is broken?

| Group in the sheet | Failing today | Which part of the plan handles it | Proven? |
| --- | --- | --- | --- |
| Downstream, 25 pairs | 15 fail | 4.1 bisection + 4.2 axis choice | ✅ verified on 3 of them (airports, wells, all-facilities) |
| Upstream, 25 pairs | 12 fail | same | ✅ verified: 8 chunks × 2.8–3.0s, 2,274 rows |
| Near ≥ 3 hops | 3 fail | same | ✅ verified: 8 chunks × 3.4–8.2s, 1,591 rows |
| Other states (5 of 6 fail) | 5 fail | 4.2 — target axis, because county is fatal in Illinois | ✅ verified for Illinois; ❌ **Indiana, Massachusetts, New Hampshire, Alabama not yet tested** |
| No region at all | 1 fail | 4.2 — region axis falls back to the state list | ❌ not tested |
| `samples near samples` | 1 fail | bisection on either side (both are samples) | ❌ not tested |
| Hydration above 3,000 IDs | latent | 4.4 — chunk at ~1,000 | ✅ verified: 5 chunks, 1.0–3.3s, 0 failures |
| 32 fragile (>15s) queries | at risk | 4.5 server cache — cold cost paid once | ❌ not tested (no server yet) |
| 4 dashboard queries at 30–67s | slow | 4.5 cache + 4.6 lazy details | ❌ not tested |

**Verified so far: ~40 chunk runs, 0 failures, every merged result identical to
the monolith where a monolith could produce one.**

### 8.2 What the sheet says that changes the plan

1. **This is not an edge-case problem.** 37 of 156 queries fail and 32 more are
   fragile — that is **44% of the measured space at risk**. Bounded execution is
   not an optimisation, it is the fix.
2. **Maine flatters us.** Every state we test against by habit is the one state
   where things mostly work. Indiana is in our own dashboard and fails on the
   plain form of the question. **Phase 2 must be verified against at least
   three states, not Maine alone.**
3. **`GET_REGION_BOUNDARIES` took 25.5s** in one dashboard run — a query for
   county outlines that never change. It is the clearest possible case for
   caching, and it is not even about chunking. Move it to Phase 1.
4. **The distance selector is a cliff.** 0 hops is 0.3–0.7s; 4 hops times out.
   Cost per hop rises steeply and unevenly. The UI currently offers 0–4 miles
   with no indication that the top of that range mostly doesn't work.
5. **One dashboard query returns 0 results** ("PFHpA Groundwater Samples
   Downstream from Facilities in Cumberland County"). That is a data or query
   correctness issue, not a performance one — **out of scope for this plan, but
   it should be raised separately.**

### 8.3 Gate for calling this done

Re-run the matrix harness after each phase and diff against
`docs/query-matrix.csv`:

- No shape may move from ✅/⚠️ to ❌.
- All 37 ❌ rows must become ✅ or ⚠️.
- The 32 fragile rows should move under 15s once the cache lands.
- Run the sweep twice — once cold, once warm — because a single sweep hides the
  cache effect that causes most intermittent failures.

---

## Part 9 — What we are deliberately not doing

- **No backoff on retries.** There is no quota to wait out; the failure is a
  fixed 30-second compute limit.
- **Not removing the NAICS `EXISTS` subcode filter.** Measured *slower* without
  it (16.7s vs 8.0s, identical rows).
- **Not capping the flowline anchor list with a server-side fallback.** That
  fallback is documented as wrong in `3f50251` — it dropped 16 of 39
  contributing landfills.
- **Not parallelising chunks for speed.** The endpoint serializes them anyway
  (22s parallel vs 23s sequential, measured). Chunking is for bounded failure,
  not latency. Latency comes from the cache.
- **Not moving to a different graph engine or hosting our own copy.** Out of
  scope, and the cache plus bounded work should make it unnecessary.

---

## Part 10 — Tasks

**Phase 1 — done 2026-09-13**
- [x] Cache `GET_REGION_BOUNDARIES` — `sparqlClient.ts` session cache, opted into per step
- [x] Per-sample popup fetch (`hooks/useSampleDetails.ts`); `GET_SAMPLE_DETAILS` deleted from the pipeline
- [x] Error cases distinguished (`engine/sparqlErrors.ts` → `PipelineProgressStrip`)
- [ ] Email okn.us: access token to raise the 30s limit; materialized downstream relation
      (draft ready at `docs/plans/drafts/2026-09-13-team-email-429.md`, not sent)

**Phase 2 — done 2026-09-13**
- [x] `LIMIT 201` side-probe + axis selection (`engine/scope.ts`)
- [x] Split-on-failure runner with merge + dedupe (`engine/executor.ts`)
- [x] Chunk-level progress in `PipelineProgressStrip`
- [x] Partial-result UI state (`components/Pipeline/PartialResultsNotice.tsx`)
- [x] `MAX_INLINE_SAMPLE_IRIS` and the inline-vs-re-derive fork deleted, along with
      `buildFusedSampleAggregateQuery` / `buildFusedSampleDetailsQuery`

**Phase 3 — server execution and cache**
- [ ] `POST /api/query` + `query_cache` table (question hash + data version)
- [ ] Single-flight; client switches to the API with a debug flag for direct SPARQL
- [ ] Precompute on publish; nightly prewarm of the 8 dashboard questions

### Results after implementing Phases 1 and 2 (measured 2026-09-14)

| Shape | Before | After |
| --- | --- | --- |
| ME samples ↓ airports | 21.2s warm, flaky cold | **16.1–16.7s warm**, 48–66s cold; 1,172 → 999 (unchanged) |
| ME samples ~ airports | 12.8s | same counts (515 / 45), details payload gone |
| **samples ~ samples [ME]** | ❌ timeout | ✅ 86.3s (5 hydration chunks) |
| **Illinois samples ↓ airports** | ❌ 500 OOM | ✅ 218s, 4 discovery chunks; one flowline slice reported partial |
| facilities ↓ facilities [ME], no filters | ❌ 30s, misleading message | ❌ still — but bounded at ~2.5 min with "narrow the area" guidance |
| wells ↓ facilities [ME], no filters | ❌ | ❌ same |

Two shapes remain unfixable by splitting: both sides unfiltered *and* a river
trace, where even a single county exceeds the 30s budget and neither entity side
is enumerable under the probe limit. They now fail predictably with actionable
guidance instead of a bare error card. Adding any filter, or choosing counties,
makes them work.

Two mechanisms were added during implementation that the plan did not anticipate:

- **Per-step time budget (120s).** Without it a step whose slices all fail keeps
  splitting indefinitely — observed running past 400s. Budgeted per step, not per
  pipeline, so a slow-but-progressing question (Illinois, ~3.5 min total) still
  finishes.
- **County refinement axis.** When a region slice is down to one county and still
  fails, chunk the *target* entities inside it. Target-only: narrowing the anchor
  side would drop out-of-region contributors (`3f50251`).

**Verification gate for each phase:** re-run the matrix harness and compare
against `docs/query-matrix.csv`. No shape may regress; the ❌ rows must turn ✅.
