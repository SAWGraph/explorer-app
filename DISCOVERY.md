# SAWGraph — Schema Discovery

Predicate inventories discovered via exploratory SPARQL queries against the KWG endpoints.

Use this pattern to discover predicates on any entity type:
```sparql
SELECT ?predicate (COUNT(*) AS ?count) WHERE {
  ?entity rdf:type <SomeClass> .
  ?entity ?predicate ?object .
} GROUP BY ?predicate ORDER BY DESC(?count)
```

---

## S2 Cell Predicates

### S2 Cells in hydrologykg

| Predicate | Count | Notes |
|-----------|-------|-------|
| `rdf:type` | 51.8M | |
| `owl:sameAs` | 7.4M | Links to equivalent S2 cells |
| `spatial:connectedTo` | 2.1M | General spatial relation (S2 → water bodies, etc.) |
| `spatial:spatiallyRelatedTo` | 2.1M | Same count as connectedTo |
| `kwg-ont:spatialRelation` | 2.1M | Same count as connectedTo |
| `kwg-ont:sfCrosses` | 1.4M | S2 cell crosses a feature geometry |
| `kwg-ont:sfOverlaps` | 461K | S2 cell overlaps a feature |
| `kwg-ont:sfWithin` | 185K | S2 cell is within a feature |
| `kwg-ont:sfContains` | 83K | S2 cell contains a feature (NOT water bodies — see below) |

### S2 Cells in spatialkg

| Predicate | Count | Notes |
|-----------|-------|-------|
| `spatial:connectedTo` | 105.7M | S2 → admin regions, other spatial entities |
| `spatial:spatiallyRelatedTo` | 105.7M | |
| `kwg-ont:spatialRelation` | 105.7M | |
| `kwg-ont:sfTouches` | 59.2M | Neighboring S2 cells |
| `rdf:type` | 51.8M | |
| `kwg-ont:sfWithin` | 42.4M | S2 within admin regions |
| `geo:hasMetricArea` | 7.4M | |
| `kwg-ont:cellID` | 7.4M | |
| `geo:defaultGeometry` | 7.4M | |
| `geo:hasGeometry` | 7.4M | |
| `rdfs:label` | 7.4M | |
| `owl:sameAs` | 7.4M | |
| `kwg-ont:sfOverlaps` | 4.1M | |

---

## Facility Predicates (fiokg)

### Predicates FROM `fio:Facility` (outgoing)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `rdf:type` | 8.1M | Multiple type assertions per facility |
| `epa-frs:hasRecord` | 2.6M | EPA FRS records |
| `epa-frs:ofFacilityType` | 2.5M | |
| `kwg-ont:sfWithin` | 2.4M | Facility within admin regions/S2 cells |
| `spatial:connectedTo` | 2.2M | Facility → S2 cells |
| `epa-frs:hasEnvironmentalInterest` | 1.8M | |
| `owl:sameAs` | 1.3M | |
| `dcterms:identifier` | 1.2M | |
| `rdfs:label` | 1.2M | Facility name |
| `fio:ofIndustry` | 1.1M | NAICS industry link |
| `dcterms:alternative` | 972K | Alternative name |
| `dcterms:created` | 918K | |
| `epa-frs:hasFRSId` | 918K | EPA FRS identifier |
| `geo:hasGeometry` | 763K | For WKT: `?fac geo:hasGeometry/geo:asWKT ?wkt` |
| `schema:address` | 694K | |
| `dcterms:modified` | 520K | |
| `epa-frs:hasSupplementalRecord` | 392K | |
| `epa-frs:ofInterestType` | 263K | |
| `epa-frs:fromSystem` | 262K | |
| `dcterms:description` | 54K | |
| `epa-frs:ofPrimaryIndustry` | 23K | |
| `fio:ownedBy` | 2K | |

### Predicates TO `fio:Facility` (incoming)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `kwg-ont:sfContains` | 2.4M | S2 cells/regions contain facilities |
| `spatial:connectedTo` | 2.2M | S2 cells → facilities |
| `owl:sameAs` | 1.3M | |
| `epa-frs:hasRecord` | 261K | Records pointing to facilities |
| `epa-frs:hasSupplementalRecord` | 8K | |

### Facilities in federation (larger dataset)

Federation has ~3.5x more facility data than fiokg alone (28M type assertions vs 8M). Same predicates but higher counts, e.g. `spatial:connectedTo` at 9.6M, `rdfs:label` at 3.6M, `geo:hasGeometry` at 3.0M.

---

## Sample/Observation Predicates (sawgraph)

### Classes in sawgraph

**Note:** `coso:Sample` does not exist as a type. The actual sample classes are:

| Class | Count | Notes |
|-------|-------|-------|
| `coso:ContaminantMeasurement` | 705K | One per observation |
| `coso:ContaminantObservation` | 705K | |
| `coso:ContaminantSampleObservation` | 705K | |
| `coso:SingleContaminantMeasurement` | 668K | |
| `coso:QuantityValue` | 627K | Measurement values |
| `me_egad:EGAD-PFAS-Observation` | 577K | Maine EGAD observations |
| `me_egad:EGAD-SinglePFAS-Concentration` | 539K | |
| `coso:NonDetectQuantityValue` | 464K | Non-detects (~74% of values) |
| `coso:DetectQuantityValue` | 163K | Detects (~26% of values) |
| `us-wqp:Observation` | 129K | WQP observations |
| `us-wqp:Single-PFAS-Concentration` | 129K | |
| `coso:MaterialSample` | 28K | **Main sample class** |
| `me_egad:EGAD-Sample` | 23K | Maine EGAD samples |
| `coso:WaterSample` | 21K | Water samples subset |
| `coso:GroundWaterSample` | 16K | Ground water subset |
| `coso:Feature` | 14K | Sampled features |
| `coso:SampledFeature` | 11K | |
| `coso:Point` | 11K | Sample points (geometry) |

### Predicates FROM `coso:MaterialSample` (outgoing)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `rdf:type` | 359K | Multiple type assertions per sample |
| `coso:sampleAnnotation` | 69K | |
| `coso:sampleOfMaterialType` | 32K | Material type (water, soil, etc.) |
| `coso:fromSamplePoint` | 28K | Link to sampling location geometry |
| `coso:isSampleOf` | 28K | Link to sampled feature |
| `sosa:isSampleOf` | 28K | Same as above (W3C SOSA ontology) |
| `rdfs:label` | 28K | Sample name |
| `dcterms:identifier` | 28K | |
| `owl:sameAs` | 28K | |
| `coso:sampleFeatureType` | 28K | |
| `me_egad:sampleCollectionMethod` | 23K | |
| `prov:wasAttributedTo` | 21K | Provenance |
| `me_egad:sampleTreatmentStatus` | 16K | |
| `me_egad:sampleCollectionLocation` | 16K | |
| `us-wqp:hasProjectId` | 5K | WQP-specific |
| `us-wqp:sampleID` | 5K | |

### Predicates TO `coso:MaterialSample` (incoming)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `coso:analyzedSample` | 705K | Observations → sample |
| `coso:hasAnyFeatureOfInterest` | 705K | |
| `owl:sameAs` | 28K | |

---

## Hydrology Predicates (hydrologykg)

### Classes in hydrologykg (non-S2)

| Class | Count | Notes |
|-------|-------|-------|
| `owl:Thing` | 11.3M | |
| `geo:SpatialObject` | 9.1M | |
| `geo:Feature` | 8.5M | |
| `kwg-ont:Region` | 7.4M | |
| `kwg-ont:Cell` | 7.4M | S2 cells |
| `stad:SingleData` | 920K | |
| `geo:Geometry` | 601K | |
| `hyfo:WaterFeatureRepresentation` | 435K | Flow path representation |
| `nhdplusv2:FlowPathLength` | 435K | |
| `hyf:HY_CatchmentRealization` | 435K | |
| `hyf:HY_ElementaryFlowPath` | 435K | |
| **`hyf:HY_FlowPath`** | **435K** | **Flow paths for upstream/downstream tracing** |
| `il-isgs:ISGS-Well` | 379K | Illinois wells |
| `me-mgs:MGS-Well` | 148K | Maine wells |
| `hyf:HY_HydroFeature` | 73K | Parent class (NOT water bodies) |
| `hyf:HY_WaterBody` | 73K | Surface water bodies |
| `hyf:HY_Lake` | 60K | Lakes subset |
| `kwg-ont:AdministrativeRegion` | 39K | |
| `kwg-ont:AdministrativeRegion_3` | 35K | Counties |
| `gwml2:GW_Aquifer` | 8K | Aquifers |
| `us-sdwis:PublicWaterSystem` | 6K | Public water systems |

### Predicates FROM `hyf:HY_HydroFeature` (outgoing)

Same predicates as HY_WaterBody (73K instances each, same entities with dual typing):

| Predicate | Count | Notes |
|-----------|-------|-------|
| `rdf:type` | 498K | |
| `spatial:connectedTo` | 274K | → S2 cells |
| `kwg-ont:sfOverlaps` | 230K | |
| `nhdplusv2:hasReachCode` | 73K | |
| `nhdplusv2:hasCOMID` | 73K | NHDPlus COMID |
| `nhdplusv2:hasFCODE` | 73K | Feature code |
| `nhdplusv2:hasFTYPE` | 73K | Feature type |
| `geo:hasGeometry` | 73K | |
| `owl:sameAs` | 73K | |
| `kwg-ont:sfTouches` | 21K | |
| `kwg-ont:sfContains` | 20K | WB contains S2 cells |
| `dcterms:title` | 20K | |
| `rdfs:label` | 20K | |
| `schema:name` | 20K | |

### Flow Paths

`hyf:HY_FlowPath` has 435K instances. `hyfo:FlowPath` returned empty — the correct class is `hyf:HY_FlowPath` / `hyf:HY_ElementaryFlowPath`. The `hyfo:` namespace predicates query timed out (likely very large).

---

## Water Body Predicates (hydrologykg)

### Predicates FROM `hyf:HY_WaterBody` (outgoing)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `rdf:type` | 498K | Multiple type assertions per water body |
| `spatial:connectedTo` | 274K | Water body → S2 cells (bidirectional with S2→WB) |
| `spatial:spatiallyRelatedTo` | 274K | |
| `kwg-ont:spatialRelation` | 274K | |
| `kwg-ont:sfOverlaps` | 230K | Water body overlaps S2 cells |
| `nhdplusv2:hasReachCode` | 73K | NHDPlus reach code |
| `nhdplusv2:hasCOMID` | 73K | NHDPlus COMID |
| `nhdplusv2:hasFCODE` | 73K | Feature code |
| `nhdplusv2:hasFTYPE` | 73K | Feature type (e.g., StreamRiver, LakePond) |
| `geo:defaultGeometry` | 73K | |
| `geo:hasGeometry` | 73K | For WKT extraction: `?wb geo:hasGeometry/geo:asWKT ?wkt` |
| `owl:sameAs` | 73K | |
| `kwg-ont:sfTouches` | 21K | |
| `kwg-ont:sfContains` | 20K | Water body contains S2 cells (direction matters!) |
| `dcterms:title` | 20K | Only ~20K of 73K have names |
| `rdfs:label` | 20K | Same subset as dcterms:title |
| `schema:name` | 20K | Same subset — notebook uses this one |
| `kwg-ont:sfCrosses` | 4K | |

### Predicates TO `hyf:HY_WaterBody` (incoming)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `spatial:connectedTo` | 274K | S2 cells → water body (this is what our queries use) |
| `spatial:spatiallyRelatedTo` | 274K | |
| `kwg-ont:spatialRelation` | 274K | |
| `kwg-ont:sfOverlaps` | 230K | |
| `owl:sameAs` | 73K | |
| `kwg-ont:sfTouches` | 21K | |
| `kwg-ont:sfWithin` | 20K | S2 cell is within a water body |
| `kwg-ont:sfCrosses` | 4K | |

**Key insight:** `kwg-ont:sfContains` goes FROM water bodies TO S2 cells (20K), not the other direction. To find water bodies from S2 cells, use `?s2 spatial:connectedTo ?waterBody`.

---

## Admin Region Predicates (spatialkg)

### Classes

| Class | Count | Notes |
|-------|-------|-------|
| `kwg-ont:AdministrativeRegion` | 41,789 | All admin regions |
| `kwg-ont:AdministrativeRegion_3` | 35,458 | Counties |
| `kwg-ont:AdministrativeRegion_2` | 6,228 | States |
| `kwg-ont:AdministrativeRegion_1` | 102 | Countries/territories |

### Predicates FROM `kwg-ont:AdministrativeRegion_3` (counties, outgoing)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `spatial:connectedTo` | 8.7M | Region → S2 cells and other regions |
| `spatial:spatiallyRelatedTo` | 8.7M | |
| `kwg-ont:spatialRelation` | 8.7M | |
| `kwg-ont:sfContains` | 6.3M | Region contains S2 cells |
| `kwg-ont:sfOverlaps` | 2.3M | |
| `rdf:type` | 213K | |
| `kwg-ont:administrativePartOf` | 71K | County → state hierarchy |
| `kwg-ont:sfWithin` | 71K | County within state |
| `kwg-ont:hasFIPS` | 35K | FIPS code |
| `geo:defaultGeometry` | 35K | |
| `geo:hasGeometry` | 35K | For boundary WKT |
| `rdfs:label` | 35K | Region name |
| `owl:sameAs` | 35K | |

### Predicates TO admin regions (incoming, example: Maine USA.23)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `spatial:connectedTo` | 86K | S2 cells → Maine |
| `kwg-ont:sfWithin` | 84K | S2 cells within Maine |
| `kwg-ont:sfOverlaps` | 2K | S2 cells overlapping border |
| `kwg-ont:administrativePartOf` | 32 | Counties within Maine |
| `owl:sameAs` | 2 | |
| `kwg-ont:sfContains` | 1 | |

---

## Important Relationships Summary

### S2 → Water Body
- **Use:** `?s2cell spatial:connectedTo ?waterBody`
- **Endpoint:** `hydrologykg`
- **NOT:** `kwg-ont:sfContains` (zero triples in this direction for water bodies)

### S2 → Facility
- **Use:** `?s2cell spatial:connectedTo ?facility` or `?s2cell kwg-ont:sfContains ?facility`
- **Endpoint:** `fiokg` (or `federation` for cross-graph)
- Facilities also have `kwg-ont:sfWithin` pointing to S2 cells/regions

### S2 → Admin Region
- **Use:** `?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.{FIPS}`
- **Endpoint:** `spatialkg`

### Observation → Sample → Feature
- **Use:** `?obs coso:analyzedSample ?sample . ?sample coso:fromSamplePoint ?point`
- **Endpoint:** `sawgraph`

### Water Body Labels
- `schema:name`, `rdfs:label`, `dcterms:title` — all ~20K triples, same subset
- ~53K water bodies have no name at all

### Facility Labels
- `rdfs:label` — 1.2M in fiokg, 3.6M in federation

---

## Class Counts

| Class | Endpoint | Count |
|-------|----------|-------|
| `hyf:HY_WaterBody` | hydrologykg | ~73K |
| `hyf:HY_WaterBody` | federation | ~107K |
| `hyf:HY_HydroFeature` | hydrologykg | ~73K (same entities, dual-typed with HY_WaterBody) |
| `hyf:HY_FlowPath` | hydrologykg | ~435K |
| `hyf:HY_Lake` | hydrologykg | ~60K (subset of HY_WaterBody) |
| `fio:Facility` | fiokg | ~918K (by hasFRSId count) |
| `fio:Facility` | federation | ~3.6M |
| `coso:MaterialSample` | sawgraph | ~28K |
| `coso:WaterSample` | sawgraph | ~21K |
| `coso:ContaminantObservation` | sawgraph | ~705K |
| `kwg-ont:S2Cell_Level13` | spatialkg/hydrologykg | ~7.4M |
| `kwg-ont:AdministrativeRegion_3` | spatialkg | ~35K (counties) |
| `kwg-ont:AdministrativeRegion_2` | spatialkg | ~6K (states) |
| `gwml2:GW_Aquifer` | hydrologykg | ~8K |
| `us-sdwis:PublicWaterSystem` | hydrologykg | ~6K |

---

## Data Coverage by State

### Facilities

**fiokg** has 1.3M facilities. **Federation** has 4.9M (aggregates fiokg + spatial linkage from other graphs).

Named graphs in fiokg confirm data for 13 states: ME, NH, AL, AR, AZ, IL, KS, MA, OH, IN, MN, SC, VT.

However, federation returns facilities for **many more states** via EPA FRS data. Top states by facility count (via federation):

| FIPS | State | Facilities |
|------|-------|-----------|
| 06 | California | 337,300 |
| 34 | New Jersey | 286,636 |
| 36 | New York | 227,622 |
| 48 | Texas | 192,919 |
| 27 | Minnesota | 173,458 |
| 17 | Illinois | 126,962 |
| 12 | Florida | 113,357 |
| 13 | Georgia | 84,457 |
| 42 | Pennsylvania | 80,716 |
| 18 | Indiana | 78,793 |
| 39 | Ohio | 77,960 |
| 53 | Washington | 72,633 |
| 37 | North Carolina | 68,034 |
| 25 | Massachusetts | 62,483 |
| 41 | Oregon | 61,746 |
| ... | (many more) | ... |

**Pipeline validated for all 13 states.** Both S2 lookup (federation) and facility details (fiokg) return results:

| State | FIPS | S2 Cells | Facilities w/ details |
|-------|------|----------|-----------------------|
| IL | 17 | 10,080 | 21,731 |
| OH | 39 | 7,959 | 14,226 |
| MN | 27 | 7,366 | 17,443 |
| AR | 05 | 6,450 | 9,724 |
| IN | 18 | 5,445 | 9,664 |
| MA | 25 | 4,544 | 13,624 |
| SC | 45 | 4,219 | 7,669 |
| AZ | 04 | 2,962 | 7,272 |
| NH | 33 | 2,160 | 4,800 |
| ME | 23 | 1,985 | 2,718 |
| VT | 50 | 1,488 | 2,845 |
| KS | 20 | 52 | 125 |
| AL | 01 | 39 | 42 |

States outside these 13 will return 0 results. The federation endpoint inflates counts via owl:sameAs entailment (4.9M vs 1.3M real facilities), but only these 13 states have actual facility attributes in fiokg.

### Samples (sawgraph)

Two data programs:
- **ME-EGAD** (Maine): 23,024 samples from ~20 sources (DEP, HALEYWARD, MEDEP, MEDACF, etc.)
- **US-WQP** (national Water Quality Portal): 5,109 samples (possibly multi-state)

Top sample sources by count: DEP (6,163), HALEYWARD (3,101), MEDEP (3,074), MEDACF (1,780). ~7,328 samples have no attributed source.

### Water Bodies (hydrologykg, via federation)

| State FIPS | State | Water Body Count |
|------------|-------|-----------------|
| 17 | Illinois | 8,228 |
| 23 | Maine | 6,612 |

Water bodies are linked to counties (`AdministrativeRegion_2` in hydrologykg = county level, not state level). Full state breakdown requires federation queries. hydrologykg contains 3,142 county-level admin regions.

### Implications for UI
- Facility S2 lookup (federation) covers many states, but facility details (fiokg) may only work for 13 states
- Sample queries outside Maine will mostly return WQP data only (5K samples)
- The UI should surface data coverage limitations to avoid user confusion

---

## Template Validation

### Facilities (`facilities.ts`) — CORRECT
- S2→facility: `kwg-ont:sfContains` — confirmed 141K triples in fiokg
- Facility names: `rdfs:label` — confirmed 1.2M in fiokg
- Industry: `fio:ofIndustry` — confirmed 1.1M
- Geometry: `geo:hasGeometry/geo:asWKT` — confirmed 763K have geometry

### Samples (`samples.ts`) — CORRECT (with note)
- S2→SamplePoint: uses `spatial:connectedTo` — works, though `kwg-ont:sfContains` also exists (4.6K triples)
- Sample linkage: `coso:observedAtSamplePoint` → `coso:analyzedSample` → `coso:sampleOfMaterialType`
- Geometry: via `coso:SamplePoint` → `geo:hasGeometry/geo:asWKT`
- Note: `coso:Sample` class does not exist; actual class is `coso:MaterialSample`

### Water Bodies (`waterBodies.ts`) — FIXED
- Was using wrong type, predicate, endpoint, and label (see FINDINGS.md #6)
- Now uses: `hyf:HY_WaterBody`, `spatial:connectedTo`, `hydrologykg`, `schema:name`

### Hydrology (`hydrology.ts`) — CORRECT
- Flow path class: `hyf:HY_FlowPath` — confirmed 435K instances
- Tracing predicate: `hyf:downstreamFlowPathTC` — confirmed 408M triples (transitive closure)
- S2 linkage: `spatial:connectedTo` — confirmed
- No `upstreamFlowPathTC` predicate exists; upstream tracing uses `downstreamFlowPathTC` in reverse (correct)
- Note: `hyfo:FlowPath` does not exist; `hyfo:` namespace has zero predicates in hydrologykg (only used for class types like `hyfo:WaterFeatureRepresentation`)
