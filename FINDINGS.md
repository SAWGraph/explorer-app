# SAWGraph Query Editor — Debugging Findings

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
