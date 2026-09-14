# Query Matrix — what the Explorer can ask, and what happens when it does

**Baseline measured**: 2026-09-13, against the live `apps.okn.us` endpoints
**Re-measured after Phases 1 + 2**: 2026-09-14 (Part 6)
**Raw data**: [`query-matrix.csv`](./query-matrix.csv) — one row per query executed, importable into a spreadsheet
**Harness**: [`scripts/query-matrix.mts`](../scripts/query-matrix.mts) — re-run it and diff the CSV after any engine change

This is the reference sheet. Every claim here is a measurement, not an estimate.
Where something is an estimate, it says so.

> **Reading the baseline (Part 3):** those numbers are the *pre-Phase-1/2*
> behaviour, kept as the benchmark to measure against. They are no longer what
> the app does today — see **Part 6** for what changed and what did not.

---

## Part 1 — How to read this

Each row is one question a user can build in the editor. For each we record:
what it asks, how big the answer is, whether it works today, and if not, which
error comes back.

**Status values:**

| Status | Meaning |
| --- | --- |
| ✅ works | Returns results reliably |
| ⚠️ fragile | Returns results, but takes >15s — close enough to the 30s limit that a slow day breaks it |
| ❌ broken | Fails every time, or nearly every time |
| ⬜ n/a | The pipeline never issues this query for this shape |

"Cold" means the graph engine's internal cache is empty for that query. "Warm"
means the same query ran recently. The gap is large — often 20x — so both are
recorded where known.

---

## Part 2 — The query space

A question is three choices (`src/types/query.ts`):

```
[ Block A: what you want to see ]  →  [ relationship ]  →  [ Block C: what it relates to ]
```

**Block A and Block C** — 6 entity types each
(`src/components/QueryEditor/EntityTypeSelector.tsx`):
samples, facilities, surface water bodies, wells, aquifers, **streams**.

**Relationship** — 3 kinds
(`src/components/QueryEditor/RelationshipSelector.tsx`):

- **Near**, with 5 distances: 0, ~1, ~2, ~3, ~4 miles (S2-cell hops)
- **Downstream of** (follows rivers), optionally bounded by **distance in km**
- **Upstream from** (follows rivers), same optional bound

> **The measured baseline in Part 3 predates two of these.** `streams` as an
> entity type and the `maxDistanceKm` bound on traces both arrived with PR #41
> on 2026-09-14. No row below exercises either, so the sheet covers 95 of the
> shapes the editor offered *then*, not the larger space it offers now. The
> distance bound is characterised separately in Part 8.

That's **6 × 6 × 7 = 252 shapes** before distance bounds, filters or regions.
On top of that:

- **Region**: none, one of 13 states (`src/constants/regions.ts:8-22`), or any
  set of counties within a state
- **Filters per entity type**: substance, material type, concentration range,
  include/exclude non-detects (samples); NAICS industry codes at any depth
  (facilities); FTYPE (water bodies); category (wells); type (aquifers)

The `within` relationship exists in the type definition (`types/query.ts:59`)
but the editor never offers it, so no query in this sheet uses it.

---

## Part 3 — Results

**156 queries executed, covering 95 of the 175 shapes the editor can express.**
Every shape below was run once against the live endpoints in a single sweep on
2026-09-13.

**What is and is not covered** — so nobody reads this as exhaustive:

| Dimension | Covered | Not covered |
| --- | --- | --- |
| Entity pairs × relationship | **all 75** (25 pairs × near-1 / downstream / upstream) | — |
| Near distances 0, 2, 3, 4 | 20 of 100 (5 representative pairs) | the other 80 combinations |
| States | 6 of 13 (IL, IN, MA, NH, AL, VT) | AZ, AR, KS, MN, OH, SC |
| Filters | 8 cases, all on one base shape | filter × shape interactions |
| Region scope | none / state / 1 county / 3 counties | arbitrary multi-county selections |
| Dashboard queries | all 8, every step | — |

The gaps are deliberate: the 80 missing combinations are near-distance variants
of pairs whose hop-1 behaviour is already recorded, and distance cost is
characterised separately in 3.4. Fill them by adding pairs to phase M4 in
`scripts/query-matrix.mts` if a question there ever matters.

| | Runs | Worked | of which slow (>15s) | Failed |
| --- | --- | --- | --- | --- |
| Near, 1 hop — all 25 entity pairs | 25 | 24 | 3 | **1** |
| Downstream — all 25 pairs | 25 | 10 | 6 | **15** |
| Upstream — all 25 pairs | 25 | 13 | 7 | **12** |
| Distance sweep (0, 2, 3, 4 hops) | 20 | 17 | 5 | **3** |
| 8 dashboard queries (every step) | 40 | 40 | 5 | 0 |
| Statewide downstream, 6 states | 6 | 1 | 1 | **5** |
| No region at all | 3 | 2 | 1 | **1** |
| Filters | 8 | 8 | 3 | 0 |
| County-scoped | 4 | 4 | 1 | 0 |
| **TOTAL** | **156** | **119** | **32** | **37** |

**Headlines:**

1. **Roughly a quarter of the query space fails outright** (37 of 156).
2. **River-trace questions are the problem: only 23 of 50 work** (downstream
   10/25, upstream 13/25). "Near" is mostly healthy at 24/25.
3. **Maine is the healthy state.** For the same plain question — "samples
   downstream of facilities" — **5 of 6 other states fail**, including Indiana,
   which is one of our own dashboard queries.
4. **All 8 dashboard queries pass**, but 4 of 8 take 30–67 seconds end to end,
   and one returns 0 results.
5. **A further 32 queries are slow enough to be at risk** — >15s against a 30s
   limit. These are the ones that flip between working and failing depending on
   the engine's cache.

**Important caveat about repeatability.** These are single runs. The engine's
cache makes the same query 10–20x faster when warm, so a ⚠️ can become a ❌ on
a cold cache and vice versa. Observed directly: "samples near facilities,
3 hops" failed with a timeout earlier in the day and passed at 20.9s during
this sweep. **Treat ⚠️ as "fails sometimes" and ✅ above ~10s as "fragile".**

Failure breakdown: 20 × timeout at 30s, 15 × engine out-of-memory,
2 × cancelled sort. See Part 4 for what each means.

### 3.1 Near, ~1 mile — every entity pair

| Block A ↓ / Block C → | Samples | Facilities | Water bodies | Wells | Aquifers |
| --- | --- | --- | --- | --- | --- |
| **Samples** | ❌ 32.4s timeout-30s | ⚠️ 15.2s (2273) | ✅ 1.7s (2199) | ✅ 5.1s (4279) | ✅ 1.6s (2759) |
| **Facilities** | ⚠️ 16.3s (1358) | ✅ 2.3s (2976) | ✅ 0.9s (1591) | ✅ 2.8s (2900) | ✅ 1.6s (1728) |
| **Water bodies** | ⚠️ 24.7s (591) | ✅ 1.0s (1015) | ✅ 1.5s (6612) | ✅ 3.6s (3553) | ✅ 2.2s (3165) |
| **Wells** | ✅ 2.4s (14897) | ✅ 1.7s (25668) | ✅ 3.1s (52861) | ✅ 2.5s (83038) | ✅ 1.2s (40080) |
| **Aquifers** | ✅ 6.2s (899) | ✅ 0.9s (1504) | ✅ 0.6s (3712) | ✅ 5.3s (3659) | ✅ 0.7s (4972) |

### 3.2 Downstream of — every entity pair

| Block A ↓ / Block C → | Samples | Facilities | Water bodies | Wells | Aquifers |
| --- | --- | --- | --- | --- | --- |
| **Samples** | ✅ 9.8s (3214) | ✅ 12.1s (2412) | ⚠️ 19.8s (2610) | ❌ 34.6s timeout-30s | ⚠️ 25.4s (2741) |
| **Facilities** | ⚠️ 17.4s (1657) | ❌ 30.1s engine-oom | ❌ 29.2s engine-oom | ❌ 31.2s timeout-30s | ❌ 30.4s engine-oom |
| **Water bodies** | ✅ 10.9s (1511) | ❌ 32.3s timeout-30s | ⚠️ 28.6s (6095) | ❌ 32.9s timeout-30s | ❌ 30.1s engine-oom |
| **Wells** | ⚠️ 24.2s (28920) | ❌ 30.3s timeout-30s | ❌ 30.7s timeout-30s | ❌ 30.7s timeout-30s | ❌ 35.3s engine-oom |
| **Aquifers** | ✅ 13.0s (2599) | ⚠️ 28.4s (3242) | ❌ 31.9s engine-oom | ❌ 30.8s timeout-30s | ❌ 30.9s engine-oom |

### 3.3 Upstream from — every entity pair

| Block A ↓ / Block C → | Samples | Facilities | Water bodies | Wells | Aquifers |
| --- | --- | --- | --- | --- | --- |
| **Samples** | ✅ 13.1s (3221) | ✅ 13.7s (2739) | ✅ 13.5s (6072) | ⚠️ 24.3s (47730) | ✅ 12.6s (4650) |
| **Facilities** | ⚠️ 24.3s (3195) | ❌ 31.6s timeout-30s | ❌ 23.3s engine-oom | ❌ 32.1s timeout-30s | ❌ 27.8s engine-oom |
| **Water bodies** | ✅ 8.9s (3064) | ✅ 13.0s (2770) | ⚠️ 20.1s (6504) | ⚠️ 28.1s (51437) | ⚠️ 15.5s (4764) |
| **Wells** | ❌ 36.1s timeout-30s | ❌ 31.3s timeout-30s | ❌ 29.9s engine-oom | ❌ 31.3s timeout-30s | ❌ 28.4s engine-oom |
| **Aquifers** | ⚠️ 23.2s (2935) | ⚠️ 17.1s (1919) | ❌ 18.0s engine-oom | ❌ 32.4s timeout-30s | ❌ 25.9s timeout-sort-estimate |


### 3.4 Distance (depth) sweep — Maine

| Question | Status | Time | Result |
| --- | --- | --- | --- |
| samples near(0) facilities [ME] | ✅ | 0.7s | 985 rows |
| samples near(0) wells [ME] | ✅ | 0.4s | 3254 rows |
| wells near(0) facilities [ME] | ✅ | 0.5s | 5462 rows |
| waterBodies near(0) facilities [ME] | ✅ | 0.3s | 352 rows |
| samples near(0) waterBodies [ME] | ✅ | 0.3s | 709 rows |
| samples near(2) facilities [ME] | ✅ | 6.5s | 3061 rows |
| samples near(2) wells [ME] | ✅ | 11.9s | 4438 rows |
| wells near(2) facilities [ME] | ⚠️ | 18.9s | 45280 rows |
| waterBodies near(2) facilities [ME] | ✅ | 6.7s | 1628 rows |
| samples near(2) waterBodies [ME] | ✅ | 10.6s | 3120 rows |
| samples near(3) facilities [ME] | ⚠️ | 20.9s | 3734 rows |
| samples near(3) wells [ME] | ⚠️ | 21.9s | 4500 rows |
| wells near(3) facilities [ME] | ⚠️ | 16.4s | 59773 rows |
| waterBodies near(3) facilities [ME] | ✅ | 8.6s | 2245 rows |
| samples near(3) waterBodies [ME] | ❌ | 30.7s | **timeout-30s** |
| samples near(4) facilities [ME] | ✅ | 14.7s | 4100 rows |
| samples near(4) wells [ME] | ⚠️ | 25.6s | 4521 rows |
| wells near(4) facilities [ME] | ❌ | 33.3s | **timeout-30s** |
| waterBodies near(4) facilities [ME] | ❌ | 24.4s | **timeout-sort-estimate** |
| samples near(4) waterBodies [ME] | ✅ | 3.4s | 4242 rows |

### 3.5 Same question, different states — "samples downstream of facilities", no filters

| State | Status | Time | Result |
| --- | --- | --- | --- |
| Illinois | ❌ | 31.0s | **timeout-30s** |
| Indiana | ❌ | 31.2s | **timeout-30s** |
| Massachusetts | ❌ | 23.3s | **engine-oom** |
| New Hampshire | ❌ | 32.1s | **timeout-30s** |
| Alabama | ❌ | 21.7s | **engine-oom** |
| Vermont | ⚠️ | 20.8s | 17 rows |

### 3.6 Region scope — smallest to largest

| Scope | Status | Time | Result |
| --- | --- | --- | --- |
| samples near(1) facilities [1 county (Cumberland)] | ✅ | 0.8s | 430 rows |
| samples near(1) facilities [3 counties] | ✅ | 1.4s | 1048 rows |
| samples downstream facilities [1 county (Cumberland)] | ✅ | 11.3s | 339 rows |
| samples downstream facilities [3 counties] | ⚠️ | 15.0s | 902 rows |
| samples near facilities [NO REGION] | ✅ | 1.4s | 4770 rows |
| samples downstream facilities [NO REGION] | ❌ | 37.3s | **engine-oom** |
| wells near facilities [NO REGION] | ⚠️ | 21.6s | 219026 rows |

### 3.7 Filters — all applied to Maine

| Filter | Status | Time | Result |
| --- | --- | --- | --- |
| substance filter (PFOS) | ⚠️ | 16.1s | 1375 rows |
| material filter (GW) | ✅ | 1.0s | 0 rows |
| concentration range 10-1000 | ✅ | 13.3s | 944 rows |
| exclude non-detects | ✅ | 1.5s | 1892 rows |
| substance + downstream | ⚠️ | 27.9s | 1406 rows |
| NAICS 2-digit (whole sector 31) | ✅ | 11.6s | 334 rows |
| aquifer type filter | ⚠️ | 30.0s | 2759 rows |
| waterbody ftype filter | ✅ | 2.0s | 1583 rows |

### 3.8 The 8 dashboard queries — full pipeline, every step

| Dashboard query | Steps | Slowest step | Total | Status |
| --- | --- | --- | --- | --- |
| Samples Near Agricultural Chemical Facilities in Maine | 6 | GET_REGION_BOUNDARIES 25.5s | 62.7s | ⚠️ |
| Samples Near Landfills & DOD Sites in Penobscot and Knox County | 6 | GET_SAMPLE_DETAILS 9.7s | 15.4s | ✅ |
| Surface Water Bodies Near Landfills & DOD Sites in Penobscot and Knox County | 5 | HYDRATE_TARGET_BY_IRI 27.5s | 30.8s | ⚠️ |
| Samples Downstream of Waste Treatment Facilities in Indiana | 7 | GET_FLOWLINE_GEOMETRIES 22.5s | 67.2s | ⚠️ |
| Maine Private Wells Near Landfills & DoD Sites | 5 | HYDRATE_TARGET_BY_IRI 13.4s | 18.8s | ✅ |
| Maine Private Wells Near Wastewater Treatment Facilities | 5 | HYDRATE_TARGET_BY_IRI 9.9s | 13.4s | ✅ |
| Maine Private Wells Near Airports & Air Transportation Sites (AFFF) | 5 | HYDRATE_TARGET_BY_IRI 10.9s | 14.4s | ✅ |
| PFHpA Groundwater Samples Downstream from Facilities in Cumberland County (returns 0 results) | 1 | FIND_TARGET_IRIS 2.1s | 2.1s | ✅ |

---

## Part 4 — Error catalogue

Every distinct failure observed, what it actually means, and why it happens.
The user sees one message for all of them: **"Something went wrong. You can edit
the question and try again."** That single message is itself part of the
problem — it hides which of these nine cases occurred.

### 1. `429 Too Many Requests` — "Operation timed out"

```json
{ "exception": "Operation timed out. Last operation: Join on ?s2neighbor" }
```

**What it really is:** not rate limiting. QLever, the graph engine, stops any
query that exceeds **30 seconds** and reports that stop with the 429 status
code. The `Last operation` field names whichever join it was working on when
the clock ran out. Observed variants: `Join on ?s2neighbor`, `Join on
?ds_flowline`, `Join on ?spC`, `Join on ?flowline`, `Join on ?s2anchor`,
`OptionalJoin on ?substanceUri`, `Exists Join`, `Query planning`, `Sort
(internal order)`.

**Why:** the query asks for more work than fits in 30 seconds. Confirmed it is
not throttling by sending 8 simultaneous requests — all 8 returned 200.

**Confusing detail:** these 429 responses are large (323 KB, 375 KB, 996 KB
observed) because the error body echoes the entire query back. A big response
body on a "Too Many Requests" error is what made this look like something else.

### 2. `429` — "Sort operation was canceled"

```
Sort operation was canceled, because time estimate exceeded remaining time by a factor of N
```

**What it really is:** the same 30-second limit, caught earlier. QLever
estimated the sort would not finish in the time left and gave up rather than
burning the remaining budget.

### 3. `500` — "Tried to allocate X, but only Y were available"

Observed: 80.2 MB, 310.4 MB, 825.6 MB, **3.2 GB**, **3.3 GB**.

**What it really is:** the engine ran out of memory building an intermediate
result. Not our browser, not the network — the server.

**Why:** an intermediate join result is enormous, even when the final answer is
small. The Illinois example is the clearest: a query returning **0 rows** tried
to allocate 3.3 GB along the way.

### 4. `500` — "Waited for a result from another thread which then failed"

**What it really is:** a secondary symptom, not a root cause. QLever shares
sub-computations between queries; this query was waiting on a shared piece that
failed for one of the reasons above. Retrying often gives the real error.

### 5. `413 Payload Too Large` — appears in the browser as a CORS error

**What it really is:** the request we sent was too big — a `VALUES` clause with
~20,000 well IRIs, about 1.5 MB (documented in commit `ebc6dda`).

**Why it looks like CORS:** the gateway's 413 response has no
`Access-Control-Allow-Origin` header, so the browser refuses to show it and
reports a CORS failure instead. This misdirection cost real debugging time.

**Current ceiling:** `federation` accepted a 1.9 MB body in testing today, so
this limit is per-endpoint (it bit `hydrologykg`) rather than global.

### 6. `502 Bad Gateway`

Same cause as 413 on a different endpoint — an oversized POST body from inlined
IRI lists. Recorded in the code comment at
`src/engine/templates/fusedQueries.ts:251`.

### 7. `403 Forbidden` — on `?timeout=120s`

**What it really is:** QLever lets a client request a longer timeout, but only
with an access token. We don't have one, so the 30-second limit is currently not
raisable from our side.

### 8. Client-side: `Bad control character in string literal in JSON`

Observed at byte positions 4,194,053 and 12,582,605 of large responses.

**What it really is:** a truncated response body. The server stopped mid-JSON
and our `response.json()` choked on the fragment. Seen only when several large
queries ran at once, so it is likely server-side memory pressure rather than a
client bug — but it means a very large response can fail *after* a successful
200 status.

### 9. What the user sees

**Baseline:** all eight surfaced as the same red card — nothing distinguished
"this question is too big" from "the server had a bad moment, press retry".

**Now:** classified in `src/engine/sparqlErrors.ts` and shown per kind. A
`sibling-failure` says to just run it again; a network error says to check the
connection; a timeout or out-of-memory offers the lever that applies to the
question being asked (see Part 8.1) rather than one fixed sentence.

A partial result — some slices answered, some not — names the slices that
failed, because a count alone leaves the user guessing which part of the map is
missing.

---

## Part 5 — Why these happen (four root causes)

Every error above traces back to one of four things:

**A. The work is unbounded.** *(addressed in Phase 2 — bounded by splitting)* A single query carries the whole river-network
closure (`hyf:downstreamFlowPathTC`) or a whole-state spatial join. Cost scales
with how much data exists in the state, not with what the user asked to see.
There is no `LIMIT`, no chunk, no budget anywhere in the pipeline.
→ Causes errors 1, 2, 3, 4.

**B. One code path serves two different needs.** *(fixed 2026-09-13)* `bindEntityInCell`
(`fusedQueries.ts`, added in `d9ba5a6` on 2026-05-30) is used both by queries
that need measurement columns and by queries that only need a list of IDs. Both
got the measurement joins. The ID queries were building every chemical
measurement in the state and throwing it away.
→ Caused errors 1 and 3 on every downstream question. Partially fixed 2026-09-13.

**C. A false choice between two bad options.** *(dissolved — chunks are small enough to inline, so neither horn applies)* Either inline the IRI list into
the request (risks errors 5 and 6) or re-derive the set inside the query (risks
errors 1–4). The project has swung between these twice. Neither reuses work,
which is the actual problem.

**D. Nothing remembers anything.** *(partly addressed — session cache for boundaries and probes; the shared server cache is Phase 3, still outstanding)* The same query costs 26.5s cold and 1.5s
warm. Every user and every page reload races the same cold cache. We control no
cache of our own.
→ Turns a fast query into a slow one, and a slow one into error 1.

---

## Part 6 — After Phases 1 and 2 (measured 2026-09-14)

Phases 1 and 2 of
[the execution plan](./plans/active/2026-09-13-query-execution-architecture.md)
are implemented: the pipeline no longer fetches popup detail up front, and any
query the engine refuses is split into slices that fit and merged back together.

### 6.1 Re-measured shapes

| Shape | Baseline (Part 3) | Now | Note |
| --- | --- | --- | --- |
| ME samples ↓ airports | 21.2s warm, fails cold | **16.1–16.7s warm** | 1,172 → 999 rows, unchanged |
| ME samples ~ airports | 12.8s | same counts (515 / 45) | 18 MB detail payload gone |
| **samples ~ samples [ME]** | ❌ 32.4s timeout | ✅ **86.3s** | hydration split into 5 slices |
| **IL samples ↓ airports** | ❌ 500 OOM @ 16s | ✅ **218s** | 4 discovery slices; 1 flowline slice reported as partial |
| ME samples ↓ 83,038 wells | ❌ 429 @ 42s | ✅ via county slices | 16 slices, 6.3–7.5s each |
| **facilities ↓ facilities [ME]** | ❌ 500 OOM, 5.9 GB | ❌ **still fails**, ~2.5 min | see 6.3 |
| **wells ↓ facilities [ME]** | ❌ 429 @ 30s | ❌ **still fails**, ~3 min | see 6.3 |

Per-step, "ME samples downstream of airports", two sequential warm passes:

```
Finding downstream samples                 4,391ms   1,172 rows
Finding facilities with downstream samples 4,283ms     190 rows
Loading downstream stream geometries       1,070ms   4,661 rows
Loading target samples details             6,257ms     999 rows
Loading anchor facilities details            579ms     190 rows
Loading region boundaries                    135ms      16 rows
TOTAL 16.7s   (second pass 16.1s)
```

`GET_SAMPLE_DETAILS` is absent — that step alone was 18–37 MB and 15–26s.

**1,172 found vs 999 shown is not a discrepancy.** 173 of those sample points
have no contaminant observations recorded, and hydration only emits rows for
points with at least one measurement. Identical before and after chunking; the
merge is exact.

### 6.2 What splitting costs

Slices run sequentially — the endpoint serialises them anyway — so a heavily
split question is slower in wall-clock than a question that fits whole, and its
first run is slower than the old *failure*. What it buys is an answer where
there was none, plus a bounded, honest outcome when even slices cannot finish.

Two mechanisms exist to keep that bounded:

- **Per-step budget, 120s.** Without it a step whose slices all fail keeps
  subdividing — observed past 400s. Per step rather than per pipeline, so a
  slow-but-progressing question (Illinois, ~3.5 min overall) still completes.
- **Partial results.** Slices that fail are reported in the UI
  (`PartialResultsNotice`) rather than silently dropped.

### 6.3 The two shapes that still fail, and why

Block A = facilities (or wells) in Maine, **Downstream of**, Block C =
facilities with **no filter and no region**. The generated `FIND_TARGET_IRIS`
leaves the anchor side completely unconstrained:

```sparql
?s2anchor kwg-ont:sfContains ?facilityA .        # ← no region, no filter
?facilityA fio:ofIndustry ?industryCodeA .
...
?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline .   # full river closure
?s2target spatial:connectedTo kwgr:administrativeRegion.USA.23 .
```

Leaving Block C's region blank means "downstream of any facility anywhere", and
that is a very large anywhere:

```
ALL facilities in the graph: 1,506,326
ALL wells in the graph:        532,771
```

So the query traces the river network from 1.5 million facilities and intersects
the result with Maine. Splitting cannot rescue it: neither entity side is
enumerable under the probe limit, and a single county still exceeds the engine's
budget.

**What actually helps — measured, not assumed:**

| Change | Result |
| --- | --- |
| Block C region = Maine | ✅ 338s, partial — 119 targets, 574 anchors |
| Block C industry filter (landfills) | ✅ 262s, partial — 274 targets, 27 anchors |
| **Block A narrowed to one county** | ❌ **no help** — 500 OOM, 2.6 GB |

The last row matters for the UI copy: narrowing the *first* block, the intuitive
"look at a smaller area" move, changes nothing, because the cost lives entirely
on the unconstrained second block. The error message names Block C for that
reason.

### 6.4 Still outstanding

- **Phase 3** — server-side execution with a shared Postgres cache. Everything
  in 6.1 is measured cold-per-session; the cache is what turns a 16s repeat into
  an instant one, and what makes a 218s Illinois answer a one-time cost.
- **Not re-measured:** the full 156-query sweep has not been re-run since the
  change. Only the shapes in 6.1 were checked. Re-run
  `scripts/query-matrix.mts` before treating Part 3 as superseded.
- **The okn.us asks** (access token to raise the 30s limit; a materialized
  downstream relation) would remove the ceiling that everything here works
  around.

---

## Part 7 — Full verification sweep (2026-09-14)

The whole matrix re-run through the real engine (`QUERY_MATRIX_MODE=engine`), so
splitting, merging, partial results and the step budget were all exercised —
not just the raw SPARQL. Raw data: `docs/query-matrix-after.csv`.

**124 shapes compared. Of the 37 that failed at baseline, 34 now work. No
regressions.**

| Outcome | Count |
| --- | --- |
| Fixed | **34** |
| Still failing | **3** |
| Regressions | **0** |
| Unchanged, working | 85 |

### 7.1 The 3 that still fail

Every one leaves the **second block** completely unconstrained, which is what
drives the cost — not the size of the answer.

| Shape | What it asks | Failure |
| --- | --- | --- |
| `samples near(3) waterBodies [ME]` | within 3 miles of *any* water body in the graph | OOM, 1.4 GB |
| `facilities ↓ facilities [ME]` | downstream of *all 1,506,326* facilities | no response in 60s |
| `samples ↓ facilities [NO REGION]` | the above with no region on either side | OOM, 2.6 GB |

Constraining the second block fixes them (measured in 6.3). Narrowing the
*first* block does not — the cost is not there.

### 7.2 Small questions stay fast

| Shape | Time | Rows |
| --- | --- | --- |
| 1 county, near 1 mile | 0.8s | 430 |
| 3 counties, near 1 mile | 1.4s | 1,048 |
| 1 county, downstream | 12.2s | 339 |
| 0-mile radius, any pair | 0.3–0.8s | — |
| 2-mile radius | 6–19s | up to 45,280 |

Note `wells near(2) facilities`: **45,280 rows in 18.8s**. Large answers are
fine. Unbounded *search spaces* are not.

### 7.3 Dashboard queries — all 8 pass, 3 materially faster

| Query | Before | After |
| --- | --- | --- |
| Samples Near Agricultural Chemical Facilities | 62.7s | **33.4s** |
| Surface Water Bodies Near Landfills & DOD | 30.8s | **24.1s** |
| Samples Near Landfills & DOD (Penobscot/Knox) | 15.4s | **10.6s** |
| Samples Downstream of Waste Treatment (Indiana) | 67.2s | 70.8s |
| Maine Private Wells × 3 | 13–19s | 13–23s |
| PFHpA Groundwater Samples (Cumberland) | 2.1s, empty | 2.4s, **still empty** |

The speed-ups are the deleted `GET_SAMPLE_DETAILS` step. PFHpA returning nothing
is unchanged and unrelated to performance — a data or query-correctness issue
that deserves its own investigation.

### 7.4 Three defects the sweep exposed, and fixed

**A missing client timeout.** `executeSparql` had no `AbortController`, so a
stalled endpoint blocked indefinitely — single requests recorded at **959s and
1,918s**. The per-step budget could not help, because it is checked *between*
slices. Worse, a hang never becomes a classified error, so the query never
split: three shapes recorded as "still failing" were only hanging, and all three
work now (`facilities upstream facilities` → 224s, 2,813 rows, complete). A 60s
cap now reports a stall as a timeout, which is splittable.

**Two budget rules, both wrong, in opposite directions.** Budgeting *elapsed*
time killed runs that were succeeding: `wells near(4)` had 13 of 16 county
slices working and was cut off at 120s for being big. Budgeting only *wasted*
time then broke the opposite case: Illinois has slices that fail slowly before
the ones that succeed, so it gave up before reaching the answer. Both are gone.
One rule remains — every slice is attempted, only the 300s step total is
bounded. Both cases now complete: Illinois 248s, `wells near(4)` 283s with
69,127 rows and nothing missing.

**"Failed" and "skipped" were the same number.** A slice the engine refused and
a slice never attempted were both reported as "too large". They need opposite
advice — narrow the question vs. just run it again — and are now tracked and
worded separately.

### 7.5 Caveat on the recorded partial counts

`query-matrix-after.csv` was captured *before* the budget fix, so its
`partialSlices` numbers are pessimistic: they count slices skipped by a rule
that has since been replaced. The one case re-measured afterwards
(`wells near(4)`) went from 11 missing to **0**. Several other partials in that
file are likely complete now; they have not been re-run.

---

## Part 8 — Distance-bounded traces (2026-09-14)

PR #41 added an optional `maxDistanceKm` to downstream and upstream questions:
the trace sums `nhdplusv2:hasFlowPathLength` over the segments between seed and
candidate and drops anything past the budget, then extends one segment further
so the drawn path does not stop mid-channel.

Measured on "facilities upstream from PFOS samples in York, Washington and Waldo
counties" — the question that prompted this, because its map covered most of
southern Maine in river lines:

| Bound | Time | Reaches | Facilities | Samples | Payload |
| --- | --- | --- | --- | --- | --- |
| none | 109s | 15,782 | 616 | 372 | 22.3 MB |
| **30 km** | 99s | **3,705** | **616** | 358 | **7.1 MB** |
| 10 km | 52s | 1,684 | 554 | 287 | 4.6 MB |

**30 km removes 77% of the river reaches while keeping every facility**, and
brings the payload under the 25 MB cache limit. It is not free: 14 sample points
disappear, and at 10 km, 62 facilities and 85 samples do. A bound answers a
different question — "within this distance" — rather than rendering the same
answer more legibly.

Note the time barely moves at 30 km. The engine still computes the closure and
then filters on summed length; the saving is in what is transferred and drawn.
Only 10 km meaningfully cuts runtime.

**Reliability caveat, worth knowing before relying on it.** The same 30 km
question ran 99s complete in one hour and 361s *partial* (2 slices missing) in
the next, with no code change between. Distance bounds reduce volume; they do
not make a heavy trace dependable.

### 8.1 Which slice failed, and what actually rescues it

The 361s partial run above is worth following, because it is the case the
error copy was getting wrong. Running each county on its own:

| County | Result |
| --- | --- |
| York | ❌ 429 timeout at 72s |
| Washington | ✅ 7s — 16 samples |
| Waldo | ✅ 23s — 177 samples |

York is the dense corner of the state, so it carries the most facilities and the
busiest river network. Not missing data: York holds 361 PFOS sample points.

What rescues it, measured on York alone:

| Change | Result |
| --- | --- |
| 30 km, no Block A filter | ❌ 429 timeout at 64s |
| **10 km** | ✅ **145 samples in 25s** |
| 30 km, Block A = landfills | ⬜ *empty* in 3s |

Two things follow, and both are now encoded in `adviceForOversizedQuestion`
(`src/engine/sparqlErrors.ts`):

- **A shorter distance is the lever that works here** — and it was the one the
  old message never mentioned. It said to add a filter or region to the second
  block, which on this question already had a substance and three counties.
- **A filter is not automatically good advice.** It makes a query cheap by
  asking for less, and here it turned a timeout into an empty result: a missing
  answer traded for no answer.

The slice labels themselves used to read `area 1`, `area 2` — `chooseAxis` held
the county codes and discarded the identity. They now carry the county name, so
a partial result says *York County, Maine* rather than *1 too large*.

**A trap to avoid when measuring this.** The landfill run above returns
`status: 'empty'`, which is a valid answer. The first pass of this test counted
it as a failure and reported all three variants as broken. Any script that
treats `status !== 'success'` as an error will draw the same wrong conclusion.

### What was tried and rejected: trimming by connectivity

The original goal was to keep only the reaches that actually connect a matched
facility to a matched sample — bounding by *terminus* rather than by distance.
That was measured and **does not work**:

| Query | Result |
| --- | --- |
| current (no terminus) | 16s, 4,661 reaches |
| terminus-bounded | **429 timeout at 70s** |

Adding a second `hyf:downstreamFlowPathTC` join — a 408M-triple relation —
exceeds what the endpoint will do, even with all 1,172 target IRIs pinned in a
`VALUES` block. `maxDistanceKm` is the trimming mechanism that exists.

If anyone revisits this: the remaining untested idea is applying the terminus
constraint only on the *distance-bounded* path, where `boundedTrace` has already
cut the candidate set before the second join runs. That would only help
questions that set a distance.

### Useful facts established while measuring

- **`hyf:downstreamFlowPathTC` is reflexive** — `<X> hyf:downstreamFlowPathTC <X>`
  returns a row. A zero-or-one path (`?`) after it is redundant.
- **`A TC B` means B is downstream of A.** Three Penobscot headwater reaches at
  ~46.1°N had successors averaging 0.73–0.79° south (seaward) and predecessors
  immediately upslope.
- **The network contains genuine two-way connectivity.** Testing linked pairs
  returned *both* directions true for every pair sampled, and not because the
  reaches coincided (0 of 50 shared one). Braided channels mean "is A upstream
  of B" has no clean yes/no answer — so do not use a single pair to reason about
  trace direction.
