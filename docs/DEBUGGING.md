# SAWGraph — Debugging Findings

Documented discoveries from investigating pipeline behavior and KWG data.

---

## 1. Executor Silent Pass-Through Bug (FIXED)

**Problem:** When a region filter step (FILTER_S2_TO_REGION) returned 0 results, `context.s2Cells` was not zeroed out — it retained the previous step's cells. The early-exit check (`context.s2Cells.length === 0`) never triggered, so the pipeline silently continued with unfiltered data, showing results from the entire US on the map.

**Fix (executor.ts):** Changed the S2-producing step handler to always update `context.s2Cells`, setting it to `[]` when results are empty:

```typescript
if (S2_PRODUCING_STEPS.has(step.type)) {
  if (results.length > 0 && results[0].s2cell) {
    context.s2Cells = results.map((r) => shortenS2URI(r.s2cell));
  } else {
    context.s2Cells = [];
  }
}
```

**Symptom:** Query "What samples in Alabama are near 3253 facilities?" showed facilities across the entire US instead of showing "no results."

---

## 2. KWG Data Coverage — Not All States Have All Facility Types

**Discovery:** Alabama (FIPS 01) has no NAICS 3253 (Pesticide, Fertilizer, and Other Agricultural Chemical Manufacturing) facilities in the knowledge graph. The facility S2 query (Step 1) runs nationwide and returns 1534 S2 cells, but none are in Alabama.

This is a **data reality**, not a code bug. The region filter correctly returns 0 when none of the nationwide facility S2 cells overlap with the selected state.

**Implication:** The UI should show a clear "no results" message when a region has no matching entities, rather than failing silently (now fixed by Bug #1).

---

## 3. KWG Spatial Data Model — S2 Cells and Admin Regions

Confirmed via exploratory SPARQL against `spatialkg`:

### S2 Cell → Admin Region linkage
- Predicate: `spatial:connectedTo` (from `<http://purl.org/spatialai/spatial/spatial-full#>`)
- S2 cells connect to **both** state-level and county-level admin regions directly
- Example: `kwgr:s2.level13.XXXX spatial:connectedTo kwgr:administrativeRegion.USA.01` (state) and `kwgr:administrativeRegion.USA.01001` (county)

### Admin Region IRI format
- State: `kwgr:administrativeRegion.USA.{FIPS}` (e.g., `USA.01` for Alabama, `USA.23` for Maine)
- County: `kwgr:administrativeRegion.USA.{stateFIPS}{countyFIPS}` (e.g., `USA.01001` for Baldwin County, AL)
- Uses numeric FIPS codes, not state abbreviations

### S2 Cell URI format
- Full: `http://stko-kwg.geog.ucsb.edu/lod/resource/s2.level13.{id}`
- Prefixed: `kwgr:s2.level13.{id}`
- The `shortenS2URI()` utility converts between these

### Region hierarchy via `spatial:connectedTo`
- Querying `?s spatial:connectedTo kwgr:administrativeRegion.USA.01` returns counties (`USA.01001`, `USA.01003`, ...) and `USA` itself — not S2 cells directly at the state level
- However, S2 cells **do** have direct `spatial:connectedTo` links to state-level regions (confirmed: 116,668 S2 cells connected to Alabama, 86,377 to Maine)

### Data counts (approximate)
| State | FIPS | S2 cells connected |
|-------|------|--------------------|
| Alabama | 01 | 116,668 |
| Maine | 23 | 86,377 |

---

## 4. SPARQL Endpoint Roles

| Endpoint | Contains | Used for |
|----------|----------|----------|
| `federation` | Federated queries across graphs | Step 1: facility S2 lookup (combines fiokg + spatialkg) |
| `fiokg` | Facility data, NAICS codes | Facility details, industry discovery |
| `sawgraph` | Sample/observation data | Sample retrieval, substance/material discovery |
| `spatialkg` | S2 cells, admin regions, geometry | Region filtering, near expansion, boundaries |
| `hydrologykg` | Water bodies, flow paths, upstream/downstream, S2→water body links | Water body queries, hydrological tracing |

---

## 5. Region Filter Query Pattern

The `buildRegionFilterQuery` in `spatial.ts` uses this pattern:

```sparql
SELECT ?s2cell WHERE {
  ?s2neighbor spatial:connectedTo kwgr:administrativeRegion.USA.{regionCode} .
  VALUES ?s2neighbor { <list of S2 cells from previous step> }
  ?s2neighbor kwg-ont:sfTouches | owl:sameAs ?s2cell .
}
```

This finds S2 cells from the VALUES list that are in the specified region, then expands to include their touching neighbors and owl:sameAs equivalents. Note: this returns **neighbors of matching cells**, not just the matching cells themselves — intentional to avoid missing edge cases at S2 cell boundaries.

The `buildStrictRegionFilterQuery` is simpler (no expansion):

```sparql
SELECT DISTINCT ?s2cell WHERE {
  VALUES ?s2cell { <list> }
  ?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.{regionCode} .
}
```

---

## 6. Region Filter Applied After LIMIT Bug (FIXED)

**Problem:** Queries for states with small amounts of data (like Alabama with 42 facilities) were returning 0 results even though the data exists. The issue was that `buildFacilityS2Query` used `LIMIT 5000` to prevent excessive results, but this limit was applied BEFORE the region filter.

**Symptom:**
- Query "What samples in Alabama are near facilities?" showed:
  - Step 1: Finding S2 cells containing matching facilities (5000 results) ✓
  - Step 2: Filtering to region 01 (0 results) ✗
- The 5000 S2 cells returned were an arbitrary nationwide sample that didn't include Alabama's 39 S2 cells

**Root Cause:** The pipeline architecture was:
1. GET_S2_FOR_ANCHOR: Find S2 cells with facilities nationwide (`LIMIT 5000`)
2. FILTER_S2_TO_REGION: Filter those 5000 cells to the target region

Small states like Alabama (39 S2 cells) weren't in the arbitrary 5000 cells returned by the federation endpoint, so the region filter had nothing to work with.

**Fix:**
- Modified `buildFacilityS2Query`, `buildSampleS2Query`, and `buildWaterBodyS2Query` to accept optional `regionCode` parameter
- When region is provided, incorporate `?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.{regionCode}` directly in the SPARQL query
- When region is provided, don't use LIMIT (the region filter naturally limits results)
- Modified `getS2Step` in planner.ts to pass region code to query builders
- Modified `planPipeline` to determine region code and pass it to `getS2Step` for all relationship types (near, downstream, upstream)
- Kept the explicit `filterS2ToRegionStep` as a fallback for endpoints that don't have region linkage data

**Files Modified:**
- `src/engine/templates/facilities.ts` - Added regionCode parameter and region filter clause
- `src/engine/templates/samples.ts` - Added regionCode parameter and region filter clause
- `src/engine/templates/waterBodies.ts` - Added regionCode parameter and region filter clause
- `src/engine/planner.ts` - Modified getS2Step and planPipeline to pass region codes

**Result:** Now queries for Alabama (and other small states) will work correctly. The S2 query filters to the region first, then returns those cells without arbitrary limits.

---

## 7. Water Bodies Query — Wrong Type, Predicate, Endpoint, and Label (FIXED)

**Problem:** "Water bodies near facilities" returned 0 results at Step 5. Four bugs:

1. **Wrong RDF type:** Used `hyf:HY_HydroFeature` (73K in hydrologykg) instead of `hyf:HY_WaterBody` (107K in federation). These are different classes — HY_WaterBody is the correct one for surface water bodies.
2. **Wrong predicate:** Used `kwg-ont:sfContains` to link S2 cells → water bodies, but zero `sfContains` triples point to water bodies. The correct predicate is `spatial:connectedTo` (274K links).
3. **Wrong endpoint:** Queried `spatialkg` which has zero water body entities. Water body data lives in `hydrologykg`.
4. **Wrong label predicate:** Used `rdfs:label` for water body names. The data uses `schema:name` (both exist on ~19K water bodies, but the reference notebook uses `schema:name`).

**Fix:**
- `waterBodies.ts`: `HY_HydroFeature` → `HY_WaterBody`, `kwg-ont:sfContains` → `spatial:connectedTo`, `rdfs:label` → `schema:name`
- `prefixes.ts`: Added `PREFIX schema: <https://schema.org/>`
- `planner.ts`: Changed all three waterBodies cases from `endpoint: 'spatialkg'` → `endpoint: 'hydrologykg'`

**Reference:** Python notebook `UC1_CQ2_WaterBodies_Near_Facilities(2026_02_12_Update).ipynb` has the correct queries.

---

## 8. Pipeline Restructure — Double Expansion, Wrong Anchors, Wrong Endpoint (FIXED)

Three interconnected bugs caused incorrect map results for spatial relationship queries.

### Bug 8a: Double S2 Expansion for "near" (FIXED)
`FILTER_S2_TO_REGION` (which uses `sfTouches | owl:sameAs`) followed by `EXPAND_S2_NEAR` (same) created 2 hops of expansion (~2-4km) instead of the notebook's 1 hop (~1-2km). After adding `regionCode` to Step 1's SPARQL, the region filter step became redundant — but its expansion side-effect remained.

**Fix:** Removed `filterS2ToRegionStep` from all three relationship pipelines. Step 1 now handles region filtering directly in SPARQL. A single `expandNearStep()` provides the correct 1-hop expansion. For downstream/upstream, `expandNearStep` replaces `filterS2ToRegionStep` (the expansion is still needed to capture nearby flow paths; only the redundant region filter was removed).

### Bug 8b: Anchor Details Showed ALL Anchor Entities (FIXED)
`GET_ANCHOR_DETAILS` used `anchorS2Cells` (all anchor S2 cells from Step 1), so the map showed every Alabama facility (42) even though only 1 sample was found. Most facilities had no sample near them.

**Fix:** Added new pipeline step `FILTER_ANCHOR_TO_NEARBY_TARGETS` between `FIND_TARGET_ENTITIES` and `GET_ANCHOR_DETAILS` (for "near" only):
1. Target entity queries now also `SELECT ?s2cell`
2. Executor extracts target S2 cells into `context.targetS2Cells` after `FIND_TARGET_ENTITIES`
3. New step queries spatialkg: find anchor S2 cells that touch any target S2 cell
4. Updates `context.anchorS2Cells` to only the relevant anchors
5. If `FIND_TARGET_ENTITIES` returns 0 results, pipeline returns `'empty'` immediately

For downstream/upstream, reverse directional trace is expensive — all anchors still shown (future enhancement).

### Bug 8c: Wrong Endpoint for Facility Queries (FIXED)
`FIND_TARGET_ENTITIES` and `GET_ANCHOR_DETAILS` for facilities used `fiokg`, but `kwg-ont:sfContains` (linking S2 cells to facilities) requires the federated graph. `fiokg` alone returned 14/42 Alabama facilities.

**Fix:** Changed both steps to `endpoint: 'federation'`.

**Files Modified:** `planner.ts`, `executor.ts`, `templates/spatial.ts`, `templates/samples.ts`, `templates/facilities.ts`, `templates/waterBodies.ts`

---

## 2026-02-28 — HierarchicalSelect not showing pre-selected industry codes

**Component**: `HierarchicalSelect/useNaicsTree.ts` — `collapseSelections` function
**Symptom**: Opening the edit modal for a prebuilt query with `industryCodes: ['3253']` showed "Any industry..." placeholder instead of a chip for 3253.
**Root cause**: `collapseSelections` assumed incoming codes were always fully expanded (parent + all descendants). When only the parent code `"3253"` was present without its child codes (`325311`, etc.), the function detected a "partial selection", recursed into children, found none selected, and returned an empty `userSelections` set.
**Fix**: Simplified the logic — when a node's code is in `allCodes`, always add it to `userSelections` regardless of whether all descendants are also selected.
**Files touched**: `src/components/QueryEditor/HierarchicalSelect/useNaicsTree.ts`
**Prevention**: When writing selection collapse/expand logic, handle the case where stored data may not match the fully expanded representation.

---

## 2026-09-08 — Substance dropdown empty: required label predicate with zero triples

**Component**: `src/engine/templates/regions.ts` — `buildDiscoverSubstancesQuery()`, and `useSubstances()` in `src/hooks/useDiscoveryQueries.ts`
**Symptom**: The Substance dropdown rendered "No options available" with a state selected, and silently showed the seven-entry `FALLBACK_SUBSTANCES` list with no state selected.
**Root cause**: The query required `?substance dcterms:alternative ?_label`. That predicate has **zero** triples on substances, on `sawgraph` and `federation` alike. Because it was a required pattern rather than `OPTIONAL`, the whole query returned 0 rows instead of returning substances without labels. Substance names live on `rdfs:label` (896,899 triples). The likely origin of the mistake is `docs/SCHEMA.md`'s facility table, where `dcterms:alternative` is a legitimate *facility* predicate: 3,824,195 triples in fiokg, 3,742,487 of them on `fio:Facility`, 0 on `comptox:ChemicalEntity`.
**Fix**: Switched to `rdfs:label`, then made both label patterns `OPTIONAL` and added a DTXSID fallback in the hook. Fixing only the predicate still hid 32 of 101 substances (47,642 observations, 5.0% of everything with a substance link) because the label was still required. Live counts: 0 rows → 69 → 101 unfiltered, and 0 → 69 → 79 for Maine.
**Files touched**: `src/engine/templates/regions.ts`, `src/hooks/useDiscoveryQueries.ts`, `docs/wiki/Dropdowns Substance.md`, `docs/SCHEMA.md`
**Prevention**: A label pattern in a discovery query must be `OPTIONAL` with a URI-tail fallback. A required label does not degrade, it deletes: the row disappears along with its data, and the dropdown looks merely short rather than broken. This one mistake caused both the total outage and the 32 hidden substances. Cross-repo confirmation: `SAWGraph/streamlit-app/filters/substance.py:67` carries the identical bug and returns 0 rows live today, while `core/sparql.py:586` and `analyses/pfas_upstream/queries.py:147` in the same repo use `rdfs:label`; `analyses/aquifer_wells/queries.py:96-97` asks for both predicates but marks each `OPTIONAL`, and therefore survives.

---

## 2026-09-09 — QLever aggregate quirks while building the substance label fallback

**Component**: `src/engine/templates/regions.ts` — `buildDiscoverSubstancesQuery()`
**Symptom**: Three separate failures while adding a fallback that borrows a substance name from the source parameter it was matched to.
**Root cause**: All three are QLever aggregate behaviours, not SPARQL semantics.

1. `COALESCE(SAMPLE(?a), SAMPLE(?b))` returns HTTP 500 on `federation` with `Assertion 'singleResult.size() == 1' failed. An expression returned a vector expression result that contained an unexpected amount of entries ... GroupByImpl.cpp:436`. The same query succeeds on `sawgraph`, so it passes a casual test. `SAMPLE(COALESCE(?a, ?b))` runs on both.
2. `SAMPLE(?x)` where `?x` is bound inside a nested `OPTIONAL` can return **unbound even when some rows in the group bind it**. This is the dangerous one: it fails silently, costing 8 of 69 acronyms with no error. Requiring the value in the OPTIONAL's own pattern (`OPTIONAL { ?p pred ?s ; rdfs:label ?_x . }`) rather than nesting a second OPTIONAL inside fixes it.
3. `SAMPLE()` picks arbitrarily across the 41 substances matched by more than one parameter, so labels changed between runs. `MIN()` is deterministic and, because `X` sorts before `X_A`, happens to prefer the unsuffixed base form.

**Fix**: Project the borrowed name as its own column with `MIN(?_viaParam)`, require `rdfs:label` inside the OPTIONAL, and coalesce in the hook rather than in SPARQL.
**Files touched**: `src/engine/templates/regions.ts`, `src/hooks/useDiscoveryQueries.ts`
**Prevention**: Test aggregate expressions against **both** `sawgraph` and `federation`; they do not behave identically. And when an aggregate feeds a fallback chain, assert the expected coverage count rather than eyeballing the first few rows, since a silently unbound `SAMPLE` looks exactly like missing data.

---

## 2026-09-11 — A dead IRI returns 200 with no rows, it does not error

**Component**: `src/constants/prebuiltQueries.ts`, `src/constants/materialTypes.ts`
**Symptom**: The "PFHpA Groundwater Samples Downstream from Facilities in Cumberland County" card ran every pipeline step, reported success, and drew an empty map. No error anywhere.
**Root cause**: The card's material filter pinned `http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.GW`, which matches zero triples. The August 2026 reload moved the two halves of the graph in opposite directions: instance data to `v2/me-egad-data#` and `v2/us-wqp-data#`, controlled vocabulary out of `-data` and into the roots `v1/me-egad#` and `v1/us-wqp#`. Material types are vocabulary, so the root form is the live one. All six `FALLBACK_MATERIAL_TYPES` entries carried the same dead namespace, and one also used `sampleMaterialType.SO` for sludge, a code that appears nowhere in the vocabulary — the real one is `.SU`.

The failure mode is the point. The filter it builds is `VALUES ?matType { <dead-iri> }`, which is valid SPARQL. The endpoint answers 200 with zero rows, and nothing downstream can distinguish that from an honest "no data matches". Verified live: with the dead IRI, 0 sample points; with the root form, 65 sample points and 171 observations.

**Fix**: `ef0c40b` — both files moved to `v1/me-egad#`, sludge corrected to `.SU`.
**Files touched**: `src/constants/prebuiltQueries.ts`, `src/constants/materialTypes.ts`
**Prevention**: Same family as the `dcterms:alternative` bug above — *a required pattern that cannot match does not degrade, it deletes*. Extend that to IRIs: a hardcoded IRI is a silent single point of failure the moment a namespace moves. When a query returns nothing, count the triples on the IRIs it names (`SELECT (COUNT(*) AS ?n) WHERE { { <iri> ?p ?o } UNION { ?s ?p2 <iri> } }`) before investigating anything else. Source of truth for the source-specific vocabularies is `SAWGraph/pfas-kg` under `datasets/*/controlledVocab/`, not `contaminoso`, which defines only the shapes.

---

## 2026-09-11 — QLever reports a query timeout as HTTP 429

**Component**: any pipeline step against `apps.okn.us`
**Symptom**: `429 Too Many Requests` in the network tab after ~30s, which reads as rate limiting and sends you looking for a request budget that does not exist.
**Root cause**: QLever uses 429 for query timeouts. The response body carries the real reason:

```json
{ "exception": "Operation timed out. Last operation: Join on ?s2anchor" }
{ "exception": "Operation timed out. Last operation: Sort (internal order) on ?resultC" }
```

A related failure appears as HTTP 500 with `Tried to allocate 409.6 MB, but only 351 MB were available`. Both are resource exhaustion; only the reporting differs. Available memory is not stable — observed at 370 MB, 351 MB and 88 MB within one afternoon on the same endpoint, so the same query can pass and fail minutes apart. This matches the endpoint flakiness recorded in changelog week 37 entry 5.

**Fix**: None needed in the app. Diagnostic note only.
**Prevention**: Always read the response body before concluding rate limiting; the status code alone is misleading. A 429 that took 30 seconds is a timeout, not a throttle — a real throttle returns immediately. Retry on an idle endpoint before investigating a query, and be aware a green run proves less than a red one here.

Trimming unused bindings measurably helps. The downstream `FIND_TARGET_IRIS` query selects only `?spC` but also binds `?matTypeLabelC` and computes `?result_valueC`, neither projected nor filtered on. Removing just those two took the query from a hard timeout to 24.7s before it hit the memory ceiling. Same pattern as the Indiana card in changelog week 37 entry 5.
## 2026-09-13 — The 429s, and what shipped to stop them

Builds on the 2026-09-11 entry above, which established that a 429 from these
endpoints is a query timeout. This one records the scale of the problem and the
fix.

**How widespread**: a sweep of every question the editor can build (95 shapes,
156 queries) found **37 failing outright and 32 more running over 15s** against
a 30s limit. River-trace questions were half broken — 23 of 50 worked. Maine was
the only healthy state: the same plain question failed in 5 of 6 others,
including Indiana, which is one of our own dashboard cards. Full results and the
catalogue of all nine failure responses are in `docs/QUERY-MATRIX.md`.

**Root cause beyond the unused bindings** already noted above: `bindEntityInCell`
(`templates/fusedQueries.ts`) served both the ID-finding queries and the hydrate
queries. The hydrate side projects `?substance`, `?matTypeLabel`,
`?result_value`; the ID side projects one column and needs none of it. Both got
the measurement joins, so the ID queries built every measurement in the state
and discarded it.

**Fix**: ID-finding queries drop those joins unless a filter needs them, and any
query the engine refuses is split into slices and merged
(`src/engine/scope.ts`). 34 of the 37 failures now work, none regressed.

**Three traps worth knowing**

- **An unfiltered second block means every entity in the graph** — 1,506,326
  facilities, 532,771 wells. That, not the size of the answer, is what blows the
  limit. Narrowing the *first* block does not help: measured, still OOM at
  2.6 GB. The three questions that remain unanswerable all have this shape.
- **413/502 arrives in the browser as a CORS error**, because the gateway's
  error response omits `Access-Control-Allow-Origin`. It means our *request* was
  too big — an inlined `VALUES` list — not that anything is wrong with CORS.
- **`?timeout=120s` returns 403.** Raising the engine's limit needs an access
  token we do not have, so the 30s ceiling is not negotiable from our side.

**Prevention**: benchmark against more than Maine, and re-run
`npm run query-matrix` after any engine change, diffing against
`docs/query-matrix/2026-09-14-raw-baseline.csv`.

---

## 2026-09-14 — Cached results served for the wrong question (FIXED)

**Component**: `src/engine/cacheKey.ts` — `canonicalQuestion`

**Symptom**: none visible. That is the point of this entry. A map would render a
complete, plausible answer that belonged to a *different* question, with no
error, no warning, and the usual "showing saved results" banner.

**Root cause**: `canonicalQuestion` normalised the relationship by rebuilding it
from a whitelist:

```ts
const relationship =
  rel.type === 'near' || rel.type === 'within'
    ? { type: rel.type, hops: rel.hops ?? 1 }
    : { type: rel.type };          // ← everything else on the relationship is gone
```

Correct when written — `hops` is genuinely only read on the near path, so a
leftover value must not split the key. But the `else` branch discards *any* other
field. When PR #41 added `maxDistanceKm`, a 30 km-bounded question and an
unbounded one immediately hashed to the same key:

```
unbounded : q:6b1d1ee8b88e820f5b44f6833c15730d3a9c574894339c8dba671e8c7b04e615
30 km     : q:6b1d1ee8b88e820f5b44f6833c15730d3a9c574894339c8dba671e8c7b04e615
```

Caching either would have served its answer for the other. For "facilities
upstream from PFOS samples in York/Washington/Waldo" that is **12,077 river
reaches and 14 sample points missing**, presented as the complete answer.

**Caught**: while warming that question for a demo — the key was printed as part
of checking the upload, and the two matched. The upload was killed before it
wrote and the cache verified clean (404 on the colliding key), so nothing needed
purging. It would not have been caught by looking at a map.

**Fix**: strip only the field known to be irrelevant, and carry the rest
through:

```ts
const { hops, ...restOfRelationship } = rel;
const relationship =
  rel.type === 'near' || rel.type === 'within'
    ? { ...restOfRelationship, hops: hops ?? 1 }
    : restOfRelationship;
```

Unbounded traces keep the key they had before `maxDistanceKm` existed, so
entries cached earlier stay reachable.

**Prevention** — the general lesson, which matters more than this instance:

- **A cache key must fail safe, and "safe" is asymmetric.** A field wrongly
  *included* costs a cache miss. A field wrongly *dropped* serves the wrong
  answer. So build the key by removing known-irrelevant fields, never by
  listing known-relevant ones — a whitelist silently drops whatever is added
  next, and adding a field to `AnalysisQuestion` is a normal thing to do.
- Any new field on `AnalysisQuestion` that changes results must be reflected in
  `scripts/check-cache-key.mts`. It now covers bounded vs unbounded, two
  different bounds, and that the unbounded key is unchanged — 19 checks.
- The same reasoning applies to `WIRE_VERSION` in that file: bump it when the
  set of stored result keys changes, or cached entries will be missing data the
  map expects.

---

## 2026-09-16 — "Upstream from" answered the mirror question (FIXED)

**Component**: `src/engine/planner.ts` — `buildFusedSteps`, and
`src/engine/templates/fusedQueries.ts` — `buildFusedWellQuery`

**Symptom**: reported by Torsten: "the upstream query seems to be switched: I
asked for facilities upstream of stream but seem to get stream upstream of
facilities." Every `upstream` question returned the relation read backwards.
Nothing errored, both layers drew, and the streams were real rivers beside real
facilities.

**Root cause**: the templates trace one way only. The anchor is bound into
`?s2anchor`, the seed flowline hangs off it, and the target comes out
`direction` of the anchor:

```sparql
downstream mode:  ?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline   # target below anchor
upstream mode:    ?ds_flowline hyf:downstreamFlowPathTC ?upstream_flowline   # target above anchor
```

So the planner decides two things: which block is the anchor (which side seeds)
and which way to trace from it. For `upstream` the anchor has to be block A,
because seeding from an unfiltered block C means every stream in the country and
times out. The anchor was right; the direction was not:

```ts
if (relationship.type === 'upstream') { anchorBlock = blockA; targetBlock = blockC; }   // correct
...
direction: relationship.type === 'downstream' ? 'downstream' : 'upstream',              // wrong
```

Two flips were required and one was applied. In one line: the code treated *the
name of the relationship the user picked* and *the direction to trace from the
seed* as the same value, and they are the same only when the seed is block C.

Not a regression from the fused refactor. `d9ba5a6` carried the bug across
faithfully, comment and all; the S2-cell pipeline it replaced did the same thing
(`getS2Step(blockA)` then `traceUpstreamStep()` then `findEntitiesStep(blockC)`),
and `git log -S buildUpstreamTraceQuery --reverse` puts that in the initial
commit. Upstream had never worked.

**How wrong**: "samples in Maine upstream from landfills", measured live.

| | Distinct samples |
| --- | --- |
| Before | 840 |
| After | 2,797 |
| In both | 777 |

72% of the correct answer was missing and 63 rows were false positives. The old
answer was, in effect, the *downstream* relation, so "samples upstream from
landfills" and "samples downstream from landfills" were two names for one
question (404 of 474 rows shared, the rest explained by the seed-side tolerance
below).

For facility-shaped answers the answer layer barely moves — Cook County returns
411 facilities either way, because "upstream of some stream" and "downstream of
some stream" are both nearly vacuous — so the stream layer was the only visible
tell. That is what was noticed, and it is why no screenshot review ever caught
it.

**Caught**: by a user, on a shape nothing automated runs. The 9 prebuilt
dashboard questions are 7 `near` and 2 `downstream`, zero `upstream`, so the
weekly health check and the warm cache never touched it. `docs/QUERY-MATRIX.md`
3.3 *did* measure all 36 upstream shapes and passed them: a mirror answer
returns a plausible row count in a plausible time, and the sweep records status,
duration and rows, never semantics.

**Fix**: name the decision and make it once.

```ts
const isUpstream = relationship.type === 'upstream';
const anchorBlock: EntityBlock = isUpstream ? blockA : blockC;
const targetBlock: EntityBlock = isUpstream ? blockC : blockA;
// The anchor is always the upstream side of the question, so the trace always
// runs downstream from it.
const traceDirection = 'downstream' as const;
```

Two further things came out of the fix:

- **A second copy of the rule.** `buildFusedWellQuery` re-derives the whole
  trace server-side (a statewide well set is 20k+ IRIs, too many to inline) and
  decided its own direction from `relationship.type` via `relationshipMode()`.
  Before the fix it agreed with discovery, both wrong. After it, the well layer
  would have been a different set from the wells discovery found. The planner
  now passes the direction it used and `relationshipMode` is deleted with its
  only caller.
- **The corrected question is much heavier**, and it first failed outright:
  `chooseAxis` had no axis left for a single-county question (both probes past
  `PROBE_LIMIT`, one county not splittable), so the step errored after 64s
  instead of slicing. `scope.ts` gained a last-resort bulk probe.

**Verified** end to end through the real pipeline, and in the app on the PR
preview: Cook County facilities upstream from streams draws 402 facilities and
1,290 flowlines running down the Des Plaines, the Illinois and the Mississippi
past St. Louis. Before the fix the same question drew the headwater tributaries
north of Chicago and nothing downstream of it.

| Question | Before | After |
| --- | --- | --- |
| Cook facilities upstream from streams, any distance | 1.3s, wrong direction | 214s |
| same, bounded 10 km / 50 km | n/a | 25s / 12s |
| Cook facilities near streams | 11s | 11s |
| ME samples downstream from landfills | 38s | 38s |

**Prevention** — the general lessons:

- **A flag that reads like a pass-through is not one.**
  `rel.type === 'downstream' ? 'downstream' : 'upstream'` looks like it forwards
  the user's choice. It was duplicated at two call sites, so the decision had no
  name and no home. Anything with two independent flips has to name both.
- **Do not overload one variable with a semantic role and an execution
  property.** `anchor` means both "which side of the question" and "which side
  seeds, and therefore which side is cheap". One meaning was updated without
  the other, which is what overloaded variables do.
- **Plausible output is not verification.** The only assertion that would have
  caught this is one about the *query*, not the result. That is
  `scripts/check-trace-direction.mts`: across all 180 planner shapes, every
  query carrying `hyf:downstreamFlowPathTC` must trace downstream from the seed,
  and a `near` question must not trace at all. It reads the emitted SPARQL, so
  it covers all three builders that trace (discovery, the flowline layer, well
  hydration) rather than trusting the flag each was handed. Confirmed to fail on
  the code before each of the two fixes.
- **The dashboard is not coverage.** A third of the question space had no
  automated exercise of any kind. Where a shape cannot be afforded in CI, an
  offline assertion about the generated query is the cheap substitute.
- **A semantics fix does not invalidate the cache.** `cacheKey` hashes the
  question, not the engine, and complete results live 30 days, so wrong answers
  keep being served after the fix deploys. Purge by question shape (see
  `docs/ARCHITECTURE.md`, The Result Cache).

**Known, and not a bug**: the seed side gets a one-cell tolerance the target
side does not (`?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor` before
attaching to a flowline). So "A upstream from C" and "C downstream from A" are
not exactly reciprocal even now, which is part of the 840 vs 474 gap above.
Making them reciprocal means applying that tolerance to both sides or neither.

---

## 2026-09-17: Two silent filters in the fused queries, join order and the unit join

Both found while running "What facilities are upstream from PFOS samples in York
and Cumberland counties (Maine)?" with the facilities block left empty. The
pipeline failed at step 1 after 116.3s with `500 out-of-memory` ("tried to
allocate 204.8 MB, only 159.3 MB available"), sliced into the two counties, and
both slices failed the same way.

**Join order (fixed).** `buildFusedWhereBody` always wrote the anchor side
first, and for an upstream question the planner puts block A on the anchor side.
With no region and no industry filter on block A, the query started from every
facility in the graph and traced the national flowline network to look for
samples in two Maine counties.

QLever does not search join orders exhaustively at these body sizes (12-14
triples), so it follows the query text. Writing the constrained side first is
the whole fix: same triples, same variables, different order. Measured across
all 72 hydrology shape/config pairs, one county scope: 5 shapes rescued, 0
regressions, 0 rows lost, faster in 50 of 66 comparable runs.

Two things this is *not*, both measured, so nobody re-derives them:

- **Not volume.** Rows materialised through the trace from Cumberland seeds:
  samples + PFOS 872,385, facilities 681,299, wells 4,183,432. The samples seed
  materialises more than the facilities seed and succeeds where it fails.
- **Not a sub-SELECT.** Fencing the constrained side in a sub-SELECT rescues the
  same 5 shapes but breaks 7 that work today, all OOM: a sub-SELECT is an
  optimiser barrier, so it forces one plan and forbids every other. A variant
  that carried only the distinct cells through the fence and re-joined the
  entity last failed the same 7, three of them degrading from OOM into 60s
  timeouts.

**The unit join (fixed).** `bindEntityInCell` emitted the entire observation
chain whenever *any* sample filter was set, including
`?result coso:measurementUnit ?unit`. A non-detect has no
`coso:measurementUnit` (`templates/samples.ts` documents this, and the by-IRI
templates already gated it behind `needsUnitJoin`), so a substance-only question
with "include non-detects" ticked silently dropped every non-detect. Cumberland
PFOS observations: 1,688 total, 914 with a unit, 774 non-detect with none. At
sample-point level, 23 points and 13 facilities became 32 and 15 once the joins
a substance filter actually reads were the only ones emitted.

The same required join was hiding non-detects in the popup's observation table
(`buildSampleDetailByIriQuery`): on sample point 64220, **474 of 3,334 rows**,
the missing 2,860 all non-detects. `OPTIONAL` in place OOMs at 819.7 MB; joining
it after `resultValueClauses()` with the symbol lookup nested inside costs what
it did before (6.88s vs 6.59s).

**Lessons**

- **Every required triple is also a filter.** Joining detail the query only
  displays, or that an inactive filter would have read, deletes rows. Both bugs
  here are one habit: an all-or-nothing gate that conflated "the user set a
  filter" with "fetch the whole record".
- **Textual triple order is a semantic-free change with a non-semantic-free
  cost.** It cannot alter the answer, and it decided whether this question
  answered at all. That makes it cheap to try and worth asserting:
  `scripts/check-query-joins.mts` reads the emitted SPARQL and fails if the
  unconstrained side leads, or if the unit join appears without a concentration
  range.
- **Measure the fix against the shapes it touches, not the one that prompted
  it.** The sub-SELECT looked like a 48% median win on the question at hand and
  was a net regression across the shape space.

## 2026-09-19: The stream layer drew rivers in a basin no sample drains from (FIXED)

Reported from outside the team: "What facilities are upstream from PFOS samples?"
scoped to York County, ME drew the entire Merrimack River, which is in another
state and another watershed.

**What was broken.** `GET_FLOWLINE_GEOMETRIES` is a separate query from
discovery, and it traced a one-sided transitive closure. It seeded from the
cells of every resolved anchor, widened each by `sfTouches`, and followed
`hyf:downstreamFlowPathTC` to the end of the network:

```sparql
?upstream_flowline rdf:type hyf:HY_FlowPath ;
      spatial:connectedTo ?s2cellus ;
      hyf:downstreamFlowPathTC ?flowline .
```

Nothing in it references the target. An anchor sitting near a drainage divide
therefore pulled in the whole of the neighbouring basin. Drawn for that
question: 122 segments of the Merrimack, 40 of the Presumpscot, 37 of the
Suncook, 24 of Cohas Brook, 21 of the Winnipesaukee (~130km away), 16 of the
Powwow.

**Where it was not.** The discovery query was innocent, which is why the first
guess was wrong. Filtering its own `?upstream_flowline` set for those names
returns zero rows. Only the layer query was one-sided.

**The fix.** Intersect the closure with the flowlines that reach the resolved
targets. Measured with the real answer sets (1,497 facilities, 200 sample
points): 3,271 flowlines down to 2,516 in the same 7s, **755 removed and 0
added**, so the change can only subtract flowlines that were never on a path
from a facility to a sample. Of the 755, 684 are in a different basin and 71 lie
below a sample, the latter being a deliberate behaviour change: the drawn river
now stops at the sample instead of running on to the sea.

**Two forms measured and rejected.**

- *The direct membership test*, `?flowline hyf:downstreamFlowPathTC? ?_flTarget`,
  leaves `?flowline` unbound on the left and QLever times out at 31s ("Join on
  ?flowline"). Two `SELECT DISTINCT` closures intersected on `?flowline` run in
  the same 7s the one-sided query took.
- *A reflexive reach*, `TC?` instead of `TC` on the target side, recovers **0**
  flowlines and costs 8s. `hyf:downstreamFlowPathTC` is already reflexive, so
  `TC?` is the same relation spelled more expensively: `X TC X` holds for 2,104
  of 2,104 York County flowlines and there are 434,501 self-pairs graph-wide.
  ARCHITECTURE.md Pattern 3 already said so. The segment a target sits on is
  therefore drawn; what the intersection excludes is the river *below* it.

**A distance bound is not a substitute.** The bounded branch got the same
intersection. At 25km it went 3,034 to 2,516, matching the unbounded set,
because connectivity dominates the cap at that range; at 5km the cap still bites
(2,314), so the two constraints compose. The shipped bounded query had been
drawing a Merrimack segment straight through its own 25km cap.

`scripts/check-flowline-scope.mts` asserts both ends are bound for all 100
shapes that draw the layer, bounded and unbounded.

**Also fixed here: `includeNondetects: true` counted as a filter.** The
seed-side rule added on 2026-09-17 asked "is this side narrowed" with a generic
"any filter field is non-null" scan. `includeNondetects: true` is the UI's
default ticked state and narrows nothing, so a samples block carrying only that
was read as constrained and reordered the entire body. Ticking the checkbox and
un-ticking it back therefore changed the emitted SPARQL for a semantically
identical question. Samples now delegate to `sampleJoinsNeeded`, which already
drew the line at `=== false`.

The same predicate existed three times (`scope.ts` as `hasBlockFilters`,
`sparqlErrors.ts` as `isNarrowed`, and the new copy). `scope.ts` asks it to pick
a chunking axis, so a drift means the executor slices on an axis the template
already led with. It is now one exported `blockIsFiltered`.

**Lessons**

- **A one-sided closure is not a filter, it is a fan-out.** Seeding from the
  answer set feels bounded and is not: transitive closure from any seed reaches
  the end of the network. If both ends of a relationship are known, bind both.
- **The query that produces the wrong output is not always the query that looks
  wrong.** Three queries feed one map. Name-filtering each layer's own result
  set located this in one step after a day of reading the wrong query.
- **"Stop at the cutoff" and "stop where it stops mattering" are different
  bounds.** A distance cap looked like it should have prevented this and did
  not, because the wrong basin was well within range.
