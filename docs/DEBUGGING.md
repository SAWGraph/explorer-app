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
