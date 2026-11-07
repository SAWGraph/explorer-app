# SAWGraph — Schema & Data Model

Predicate inventories discovered via exploratory SPARQL queries against the KWG endpoints.

Use this pattern to discover predicates on any entity type:
```sparql
SELECT ?predicate (COUNT(*) AS ?count) WHERE {
  ?entity rdf:type <SomeClass> .
  ?entity ?predicate ?object .
} GROUP BY ?predicate ORDER BY DESC(?count)
```

---

## Prefixes

| Prefix | Namespace |
|--------|-----------|
| `gwml2:` | `http://gwml2.org/def/gwml2#` |
| `hyf:` | `https://www.opengis.net/def/schema/hy_features/hyf/` |
| `hyfo:` | `http://hyfo.spatialai.org/v1/hyfo#` |
| `il-isgs:` | `http://sawgraph.spatialai.org/v1/il_isgs_data#` (Illinois source graph) |
| `me-mgs:` | `http://sawgraph.spatialai.org/v1/me_mgs_data#` (Maine source graph) |

Note: `gwml2:` is `gwml2.org`, **not** the OGC `opengis.net/def/gwml` namespace the UML diagrams suggest.

### Instance data vs controlled vocabulary (August 2026 reload)

The reload moved the two halves of the SAWGraph source data in **opposite directions**.
Getting this backwards produces queries that are valid, return 200, and match nothing.

| What | Where it lives | Example |
|---|---|---|
| Instance data — samples, sample points, observations | `v2/<source>-data#` | `v2/me-egad-data#d.egad.sample.136913…` |
| Controlled vocabulary — material types, parameters, qualifiers | `v1/<source>#` (root) | `v1/me-egad#sampleMaterialType.GW` |

A single WQP sample carries both at once, which is the clearest illustration:

```
instance:    http://w3id.org/sawgraph/v2/us-wqp-data#d.wqp.sample.11113300-A302638001
vocabulary:  http://w3id.org/sawgraph/v1/us-wqp#sampleMedia.water
```

Verified live 2026-09-11, counting triples on all four spellings of one vocabulary term:

| IRI | Triples |
|---|---|
| `v1/me-egad#sampleMaterialType.GW` | **46,110** |
| `v1/me-egad-data#sampleMaterialType.GW` | 0 |
| `v2/me-egad#sampleMaterialType.GW` | 0 |
| `v2/me-egad-data#sampleMaterialType.GW` | 0 |

Confirmed by Katrina Schweikert's note on the reload: *"all controlled vocabulary terms are
in the root namespaces (me_egad and us_wqp)"*.

Source of truth for the source-specific vocabularies is **`SAWGraph/pfas-kg`**, under
`datasets/<state>/<source>/controlledVocab/`. Maine's material types are
`datasets/maine/egad/controlledVocab/sample_type.ttl`, which declares
`@prefix me_egad: <http://w3id.org/sawgraph/v1/me-egad#>` and defines 47 terms.
`SAWGraph/contaminoso` defines the shapes (`coso:MaterialSample` and its subclasses),
**not** the source terms — do not look for a material type there.

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

#### Material type inventory

`coso:sampleOfMaterialType` is what the Material dropdown offers. Measured live 2026-09-11:
**171 distinct values**, drawn from four unrelated source vocabularies that were never
reconciled with each other.

| Values | Observations | Vocabulary | Example |
|---|---|---|---|
| 79 | 163,405 | `v1/us-wqp#biologicalTaxon.*` | `Lepomis macrochirus` |
| 47 | 833,058 | `v1/me-egad#sampleMaterialType.*` | `GROUNDWATER`, `LEACHATE` |
| 39 | 33,790 | `v1/me-egad#sampleMaterialTypeQualifier.*` | `DEER`, `SPLIT` |
| 6 | 208,219 | `v1/us-wqp#sampleMedia.*` | `Water`, `Tissue` |

Consequences worth knowing before writing a query against it:

- **Labels are inconsistent by source.** EGAD shouts (`GROUNDWATER`), WQP is title case
  (`Tissue`). Upstream, not a rendering artefact.
- **It includes things that are not materials.** Fish species sit alongside groundwater, and
  the qualifier vocabulary mixes animals (`DEER`, `TURKEY`) with QA/QC flags (`SPLIT`,
  `FIELD BLANK`, `NORMAL ENVIRONMENTAL SAMPLE`).
- **`us-wqp#sampleMedia.water` is ambiguous.** It spans groundwater and surface water with
  no way to separate them.
- **14 samples (177 observations) have no `coso:sampleOfMaterialType` at all.** They are
  unreachable through any material filter, though they appear when none is applied. One is
  identified as "PFAS SLUDGE" and typed `coso:RawWaterSample`, so the information exists —
  just not on this predicate.

The grouping the dropdown shows is not in the data. It is computed per query by left joining
each sample to the four direct subclasses of `coso:MaterialSample` and taking `MIN` of a
hardcoded priority. The buckets are not naturally disjoint: 171 material types produce 178
type-to-bucket links, and `MIN` resolves the 7 overlaps.

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
| `kwg-ont:AdministrativeRegion_3` | 35K | County subdivisions |
| `gwml2:GW_Aquifer` | 8.4K | Aquifers (ME 4,972 + IL 3,469) |
| `gwml2:GW_AquiferSystem` | 1.9K | Aquifer systems (ME 1,502 + IL 439) |
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
| `kwg-ont:AdministrativeRegion_3` | 35,458 | County subdivisions (towns, townships, census county divisions) |
| `kwg-ont:AdministrativeRegion_2` | 6,228 | Counties, each under two IRIs (KWG and Data Commons) |
| `kwg-ont:AdministrativeRegion_1` | 102 | States and territories |

In all 13 selectable states AR1 is the state, AR2 the county and AR3 the county subdivision (checked live 2026-11-07: Hancock County, `USA.23009`, is AR2). Every county exists as `kwgr:administrativeRegion.USA.23009` and as `https://datacommons.org/browser/geoId/23009`, both `administrativePartOf` the state, so a count of counties is doubled unless it filters by namespace. Subdivisions exist only as Data Commons IRIs (`geoId/2300902865`, Bar Harbor town).

### Predicates FROM `kwg-ont:AdministrativeRegion_3` (county subdivisions, outgoing)

| Predicate | Count | Notes |
|-----------|-------|-------|
| `spatial:connectedTo` | 8.7M | Region → S2 cells and other regions |
| `spatial:spatiallyRelatedTo` | 8.7M | |
| `kwg-ont:spatialRelation` | 8.7M | |
| `kwg-ont:sfContains` | 6.3M | Region contains S2 cells |
| `kwg-ont:sfOverlaps` | 2.3M | |
| `rdf:type` | 213K | |
| `kwg-ont:administrativePartOf` | 71K | Subdivision → county (both county IRIs) |
| `kwg-ont:sfWithin` | 71K | Subdivision within county |
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

### Substance Labels

Substances are `comptox:ChemicalEntity` (`http://w3id.org/DSSTox/v1/`), reached from an
observation via `coso:ofDSSToxSubstance`. 101 of them are typed in sawgraph, and every
observed substance is typed, so the type pattern drops nothing.

A substance carries 39 distinct predicates. Only these can name it:

| Field | Coverage | Verdict |
|-------|----------|---------|
| `skos:altLabel` on the substance | 25 of 101 | **Best acronym.** Canonical casing: `PFOS`, `PFHxS` |
| `rdfs:label` on the substance | 69 of 101 | **Best full name.** `Perfluorooctanoic acid` |
| `rdfs:label` on the source parameter | **101 of 101** | Polluted in general, good as a last resort |
| `skos:altLabel` on the source parameter | 68 of 101 | Rejected, see below |
| `dcterms:alternative` | **0** | Does not exist on substances, on any endpoint |
| `owl:sameAs` | 101 of 101 | Self-referential, useless |
| `hasCASRN`, `hasInChIKey`, `hasSMILES`, `dcterms:identifier` | 40 of 101 | Identifiers, and all sit inside the labelled 69 |
| `rdfs:seeAlso`, `rdfs:isDefinedBy` | 68 of 101 | Provenance URIs |
| 30 physicochemical properties (`logP`, `meltingPoint`, …) | 40 of 101 | Not names |

Regenerate with:

```sparql
SELECT ?p (COUNT(DISTINCT ?s) AS ?substances) WHERE {
  ?s a comptox:ChemicalEntity . ?s ?p ?v
} GROUP BY ?p ORDER BY DESC(?substances)
```

**The label chain is `skos:altLabel` → `rdfs:label` → source parameter's `rdfs:label` →
DTXSID.** The source parameter is reached by the inbound
`?param comptox:sameAsDSSToxSubstance ?substance`. This resolves all 101.

**Every label predicate must be queried as `OPTIONAL`.** The 32 substances with no
`rdfs:label` of their own carry 47,642 observations, 5.0% of the 944,541 with a substance
link, and they hold only `rdf:type` and `owl:sameAs`. A required label pattern does not
return them unlabelled, it drops them entirely.

**Do not use the parameter's `skos:altLabel` as an acronym.** Its `_A` suffix marks the
*acid* as distinct from the anion: `PFOS_A` is Perfluorooctanesulfonic acid
(`DTXSID3031864`), `PFOS` is Perfluorooctanesulfonate (`DTXSID80108992`). `_L` and `_BR` mark
linear and branched isomers. Borrowing these collapses 10 pairs of genuinely different
substances into identical labels; stripping the suffixes makes it worse, not better.

**Parameter name quality**, for the 171 distinct values: 31 contain `***retired***use …`
(which names its own replacement, so split on it and take the right side), 78 are ALL CAPS,
21 are CAS-index style (`1-Octanesulfonic acid, 1,1,2,2,3,3,…`), and one is misspelled
(`PERFLOUROOCTANE`). 41 substances have several conflicting values, so aggregate with `MIN()`
for determinism. For the 32 that actually need it, 31 have exactly one value and 30 need no
cleanup.

**Known upstream error:** `me-egad#parameter.PFECHS_A` is aligned to `DTXSID7022546`, which
is `Acetohydroxamic acid`, not a PFAS. 2 observations. Belongs in an issue against
`SAWGraph/pfas-kg`.

**Trap:** `dcterms:alternative` in the facility table above is a *facility* predicate.
Measured on fiokg: 3,824,195 triples, of which 3,742,487 are on `fio:Facility` and **0 on
`comptox:ChemicalEntity`**. Using it for substance names returns zero rows. See
`docs/DEBUGGING.md`, 2026-09-08.

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
| `comptox:ChemicalEntity` | sawgraph | 101 (69 with `rdfs:label`) |
| `kwg-ont:S2Cell_Level13` | spatialkg/hydrologykg | ~7.4M |
| `kwg-ont:AdministrativeRegion_3` | spatialkg | ~35K (county subdivisions) |
| `kwg-ont:AdministrativeRegion_2` | spatialkg | ~6K (counties, each under two IRIs) |
| `gwml2:GW_Aquifer` | hydrologykg | ~8.4K (ME 4,972 + IL 3,469) |
| `gwml2:GW_AquiferSystem` | hydrologykg | ~1.9K (ME 1,502 + IL 439) |
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

Water bodies have no link to any administrative region, only to S2 cells (checked 2026-11-07 on hydrologykg and federation). See Subdivision link coverage below.

### Subdivision link coverage

A **subdivision link** (GLOSSARY.md) ties an entity to the county subdivision it sits in, which rolls up to its county and state. A region filter is exact only for a type that has them: wells use them since #96, every other type trusts the S2 cell, which lets in entities from across the county line. Measured for issue #123 with `npm run subdivision-coverage` (`engine/scripts/subdivision-coverage.mts`); paste its output over the tables below to refresh them.

Measured 2026-11-07 on federation (24.3 min). Two queries stalled (Montana facilities, Virginia wells); both answered when sent again by hand and are filled in.

**Combined**, the whole graph. Linked: at least one subdivision link. No link, S2 cell only: no subdivision link, located only by the S2 cell it sits in. Unplaced: neither. County link only: linked to a county but not to a subdivision (already counted in one of the middle columns). App can show: entities the engine's own cell bind for the type finds, so the most any question can put on the map.

| Type | Total | Linked | No link, S2 cell only | Unplaced | County link only | App can show |
|---|---:|---:|---:|---:|---:|---:|
| Sample points | 20,345 | 8,731 (42.9%) | 4,445 (21.8%) | 7,169 (35.2%) | 0 (0.0%) | 8,730 (42.9%) |
| Facilities | 627,188 | 457,883 (73.0%) | 1,994 (0.3%) | 167,311 (26.7%) | 58,564 (9.3%) | 459,877 (73.3%) |
| Water bodies | 107,067 | 0 (0.0%) | 72,985 (68.2%) | 34,082 (31.8%) | 0 (0.0%) | 72,985 (68.2%) |
| Wells | 532,771 | 515,287 (96.7%) | 1,093 (0.2%) | 16,391 (3.1%) | 0 (0.0%) | 462,535 (86.8%) |
| Aquifers | 8,441 | 8,441 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 8,441 (100.0%) |
| Stream flowlines | 468,583 | 0 (0.0%) | 434,384 (92.7%) | 34,199 (7.3%) | 0 (0.0%) | 434,384 (92.7%) |

**By state**, linked / no link (share linked). An entity with no link counts in a state when its S2 cell touches that state, so one on a state line counts in both.

Selectable states:

| State | Sample points | Facilities | Water bodies | Wells | Aquifers | Stream flowlines |
|---|---:|---:|---:|---:|---:|---:|
| Alabama | 57 / 25 (69.5%) | 0 / 2 (0.0%) | no data | no data | no data | no data |
| Arizona | 457 / 2,831 (13.9%) | 7,259 / 1 (100.0%) | no data | no data | no data | no data |
| Arkansas | 24 / 4 (85.7%) | 9,688 / 10 (99.9%) | no data | no data | no data | no data |
| Illinois | 62 / 5 (92.5%) | 22,273 / 15 (99.9%) | 0 / 8,228 (0.0%) | 378,404 / 219 (99.9%) | 3,469 / 0 (100.0%) | 0 / 61,927 (0.0%) |
| Indiana | 359 / 27 (93.0%) | 9,539 / 11 (99.9%) | 0 / 4,866 (0.0%) | 0 / 880 (0.0%) | no data | 0 / 20,215 (0.0%) |
| Kansas | 20 / 0 (100.0%) | 0 / 11 (0.0%) | no data | no data | no data | no data |
| Maine | 4,526 / 2 (100.0%) | 2,902 / 1 (100.0%) | 0 / 6,612 (0.0%) | 136,883 / 1 (100.0%) | 4,972 / 0 (100.0%) | 0 / 29,677 (0.0%) |
| Massachusetts | 255 / 14 (94.8%) | 13,434 / 6 (100.0%) | 0 / 4,559 (0.0%) | no data | no data | 0 / 11,434 (0.0%) |
| Minnesota | 1,084 / 505 (68.2%) | 17,361 / 8 (100.0%) | 0 / 18,352 (0.0%) | no data | no data | 0 / 35,811 (0.0%) |
| New Hampshire | 28 / 13 (68.3%) | 5,557 / 1 (100.0%) | 0 / 1,939 (0.0%) | 0 / 1 (0.0%) | no data | 0 / 12,577 (0.0%) |
| Ohio | 0 / 310 (0.0%) | 13,882 / 9 (99.9%) | 0 / 3,516 (0.0%) | no data | no data | 0 / 39,024 (0.0%) |
| South Carolina | 21 / 3 (87.5%) | 7,605 / 6 (99.9%) | no data | no data | no data | no data |
| Vermont | 9 / 1 (90.0%) | 2,764 / 2 (99.9%) | 0 / 475 (0.0%) | no data | no data | 0 / 4,228 (0.0%) |

Other states (no state pick, but a side with no region can reach them):

| State | Sample points | Facilities | Water bodies | Wells | Aquifers | Stream flowlines |
|---|---:|---:|---:|---:|---:|---:|
| Alaska | no data | no data | no data | no data | no data | no data |
| California | 0 / 59 (0.0%) | 13,865 / 3 (100.0%) | no data | no data | no data | no data |
| Colorado | 110 / 23 (82.7%) | 14,127 / 2 (100.0%) | no data | no data | no data | no data |
| Connecticut | 28 / 0 (100.0%) | 4,498 / 0 (100.0%) | 0 / 2,781 (0.0%) | no data | no data | 0 / 8,318 (0.0%) |
| Delaware | no data | 2,220 / 3 (99.9%) | no data | no data | no data | no data |
| Florida | 0 / 8 (0.0%) | 17,888 / 3 (100.0%) | no data | no data | no data | no data |
| Georgia | 0 / 1 (0.0%) | 23,061 / 17 (99.9%) | no data | no data | no data | no data |
| Hawaii | no data | no data | no data | no data | no data | no data |
| Idaho | no data | 4,484 / 5 (99.9%) | no data | no data | no data | no data |
| Iowa | 111 / 7 (94.1%) | 9,590 / 8 (99.9%) | 0 / 3,593 (0.0%) | 0 / 36 (0.0%) | no data | 0 / 43,161 (0.0%) |
| Kentucky | 26 / 8 (76.5%) | 9,654 / 26 (99.7%) | 0 / 2,369 (0.0%) | 0 / 24 (0.0%) | no data | 0 / 41,335 (0.0%) |
| Louisiana | no data | 9,327 / 3 (100.0%) | no data | no data | no data | no data |
| Maryland | 24 / 10 (70.6%) | 13,229 / 173 (98.7%) | 0 / 24 (0.0%) | no data | no data | 0 / 429 (0.0%) |
| Michigan | 130 / 2 (98.5%) | 23,330 / 4 (100.0%) | 0 / 64 (0.0%) | 0 / 40 (0.0%) | no data | 0 / 17 (0.0%) |
| Mississippi | no data | 7,499 / 4 (99.9%) | no data | no data | no data | no data |
| Missouri | 55 / 19 (74.3%) | 13,740 / 11 (99.9%) | 0 / 1,899 (0.0%) | 0 / 30 (0.0%) | no data | 0 / 23,208 (0.0%) |
| Montana | no data | 3,241 / 10 (99.7%) | no data | no data | no data | no data |
| Nebraska | no data | 7,308 / 4 (99.9%) | no data | no data | no data | no data |
| Nevada | 0 / 3 (0.0%) | 3,611 / 6 (99.8%) | no data | no data | no data | no data |
| New Jersey | 0 / 7 (0.0%) | 10,640 / 4 (100.0%) | no data | no data | no data | no data |
| New Mexico | 0 / 1 (0.0%) | 4,813 / 3 (99.9%) | no data | no data | no data | no data |
| New York | 481 / 6 (98.8%) | 19,387 / 5 (100.0%) | 0 / 399 (0.0%) | no data | no data | 0 / 1,885 (0.0%) |
| North Carolina | 55 / 290 (15.9%) | 10,797 / 4 (100.0%) | 0 / 20 (0.0%) | no data | no data | 0 / 906 (0.0%) |
| North Dakota | 0 / 2 (0.0%) | 2,592 / 8 (99.7%) | no data | no data | no data | no data |
| Oklahoma | no data | 12,699 / 3 (100.0%) | no data | no data | no data | no data |
| Oregon | no data | 7,337 / 1 (100.0%) | no data | no data | no data | no data |
| Pennsylvania | 433 / 32 (93.1%) | 15,372 / 5 (100.0%) | 0 / 1,165 (0.0%) | no data | no data | 0 / 21,646 (0.0%) |
| Rhode Island | 14 / 0 (100.0%) | 3,160 / 5 (99.8%) | 0 / 584 (0.0%) | no data | no data | 0 / 1,861 (0.0%) |
| South Dakota | 35 / 7 (83.3%) | 1,803 / 1 (99.9%) | 0 / 707 (0.0%) | no data | no data | 0 / 1,791 (0.0%) |
| Tennessee | 154 / 13 (92.2%) | 10,506 / 18 (99.8%) | 0 / 436 (0.0%) | no data | no data | 0 / 12,900 (0.0%) |
| Texas | no data | 19,405 / 12 (99.9%) | no data | no data | no data | no data |
| Utah | no data | 5,974 / 3 (99.9%) | no data | no data | no data | no data |
| Virginia | 41 / 223 (15.5%) | 11,805 / 62 (99.5%) | 0 / 42 (0.0%) | no data | no data | 0 / 5,562 (0.0%) |
| Washington | no data | 14,724 / 2 (100.0%) | no data | no data | no data | no data |
| West Virginia | 0 / 86 (0.0%) | 3,902 / 6 (99.8%) | 0 / 559 (0.0%) | no data | no data | 0 / 27,578 (0.0%) |
| Wisconsin | 132 / 21 (86.3%) | 7,845 / 6 (99.9%) | 0 / 11,083 (0.0%) | 0 / 85 (0.0%) | no data | 0 / 40,922 (0.0%) |
| Wyoming | no data | 2,186 / 17 (99.2%) | no data | no data | no data | no data |
| District of Columbia | no data | 0 / 1,765 (0.0%) | no data | no data | no data | no data |

What it shows:

- **Aquifers** are fully linked (8,441 of 8,441), and **facilities** are 99.9% linked in every selectable state they appear in. Both still use the cell check, so both can get the #96 wells treatment.
- **Water bodies and stream flowlines** have no link to any administrative region. Their region filter can only be the cell check until the data adds links.
- **Sample points** are partly linked: 99.9% in Maine, 13.9% in Arizona, 0% in Ohio. A subdivision-only check would drop the rest.
- **The app shows less than the graph holds.** Every type is found through its S2 cell, so an entity with no cell never reaches a map, whatever its links:
  - Wells: 462,535 of 532,771. The 70,236 Maine wells with no cell (#96) are hidden, though most of them have a subdivision link.
  - Sample points: 8,730 of 20,345. 4,428 sit in a cell only through `kwg-ont:sfContains`, and the samples bind asks for `spatial:connectedTo`; 5,698 have no geometry.
  - Facilities: 459,877 of 627,188 with an industry code. Beyond those, 4,240,574 of the 4,867,762 `fio:Facility` entities have no NAICS industry code, which the facilities bind requires (Maine: 11,599 linked facilities, 2,902 with a code).
- **Unit for facilities:** typed `fio:Facility`. 853,598 FRS records (`epa-frs:Record`) also carry `fio:ofIndustry`; they have no location and are not facilities. Of the 167,311 facilities with neither a link nor a cell, 9,615 have a geometry.
- **Alabama and Kansas** have no linked facilities (2 and 11 located by cell only), nor do Alaska and Hawaii (none at all). The District of Columbia has 1,765 facilities and no subdivisions, so none is linked.
- **Outside the 13 selectable states** the same pattern holds: facilities are 98.7% (Maryland) to 100% linked, water bodies and flowlines 0%. Sample points are 15.9% linked in North Carolina and 15.5% in Virginia. A side with no region picked can reach these states.
- **Wells**: the 880 counted in Indiana with no link are all Illinois survey (ISGS) wells in Indiana cells that do not touch Illinois, so they sit in Indiana and no subdivision claims them.
- Facilities sit in their cells through `kwg-ont:sfContains`, and 56,992 have no `spatial:connectedTo` to any cell, so the script's cell check accepts either predicate.

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
- Was using wrong type, predicate, endpoint, and label (see DEBUGGING.md #7)
- Now uses: `hyf:HY_WaterBody`, `spatial:connectedTo`, `hydrologykg`, `schema:name`

### Hydrology (`hydrology.ts`) — CORRECT
- Flow path class: `hyf:HY_FlowPath` — confirmed 435K instances
- Tracing predicate: `hyf:downstreamFlowPathTC` — confirmed 408M triples (transitive closure)
- S2 linkage: `spatial:connectedTo` — confirmed
- No `upstreamFlowPathTC` predicate exists; upstream tracing uses `downstreamFlowPathTC` in reverse (correct)
- Note: `hyfo:FlowPath` does not exist; `hyfo:` namespace has zero predicates in hydrologykg (only used for class types like `hyfo:WaterFeatureRepresentation`)

---
