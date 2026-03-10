# Samples Downstream of Waste Treatment Facilities in Indiana

> Trace downstream flow paths from Waste Treatment and Disposal facilities (NAICS 5622) in Indiana to find PFAS sample points in potentially affected areas.

**ID**: `samples-downstream-waste-indiana`

## Analysis Question

| Part | Configuration |
|------|--------------|
| **Block A** (target) | Samples in Indiana (state FIPS: 18) |
| **Relationship** | Downstream |
| **Block C** (anchor) | Facilities — NAICS 5622 (Waste Treatment and Disposal) |

## Pipeline Steps

| # | Step Type | Endpoint | Description |
|---|-----------|----------|-------------|
| 1 | `GET_S2_FOR_ANCHOR` | federation | Find S2 cells containing waste treatment facilities in Indiana |
| 2 | `EXPAND_S2_NEAR` | spatialkg | Expand to neighboring S2 cells (captures nearby flow paths) |
| 3 | `TRACE_DOWNSTREAM` | hydrologykg | Trace downstream flow paths from expanded cells |
| 4 | `FIND_TARGET_ENTITIES` | sawgraph | Find samples in downstream area |
| 5 | `GET_ANCHOR_DETAILS` | federation | Get facility details for map display |
| 6 | `GET_REGION_BOUNDARIES` | spatialkg | Load Indiana county boundaries |

**Note**: The downstream pipeline does **not** include a `FILTER_ANCHOR_TO_NEARBY_TARGETS` step (unlike near queries). All anchor facilities are shown on the map regardless of whether downstream samples exist near them. The pre-trace expansion (Step 2) ensures flow paths adjacent to facility cells are captured.

## SPARQL Queries

### Step 1: Find Facility S2 Cells

**Endpoint**: `federation`
**Template**: `buildFacilityS2Query(filters, "18")`

NAICS 5622 is a 4-digit code, so it's treated as a **grouping**.

```sparql
SELECT DISTINCT ?s2cell WHERE {
  ?s2cell rdf:type kwg-ont:S2Cell_Level13 ;
          kwg-ont:sfContains ?facility .
  ?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.18 .
  ?facility fio:ofIndustry ?industryGroup ;
            fio:ofIndustry ?industryCode .
  ?industryCode a naics:NAICS-IndustryCode ;
                fio:subcodeOf ?industryGroup ;
                rdfs:label ?industryName .
  VALUES ?industryGroup { naics:NAICS-5622 }
} GROUP BY ?s2cell
```

### Step 2: Expand to Neighboring S2 Cells

**Endpoint**: `spatialkg`
**Template**: `buildNearExpansionQuery(s2ValuesString)`

This expansion before tracing captures flow paths that pass through adjacent cells to the facility.

```sparql
SELECT DISTINCT ?s2cell WHERE {
  VALUES ?s2neighbor { <s2cells from step 1> }
  ?s2neighbor kwg-ont:sfTouches | owl:sameAs ?s2cell .
  ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
}
```

### Step 3: Trace Downstream Flow Paths

**Endpoint**: `hydrologykg`
**Template**: `buildDownstreamTraceQuery(s2ValuesString)`

Uses the transitive closure property `hyf:downstreamFlowPathTC` to follow the entire downstream flow network from the anchor cells.

```sparql
SELECT DISTINCT ?s2cell WHERE {
  ?upstream_flowline rdf:type hyf:HY_FlowPath ;
      spatial:connectedTo ?s2cellus ;
      hyf:downstreamFlowPathTC ?downstream_flowline .
  VALUES ?s2cellus { <s2cells from step 2> }
  ?s2cell spatial:connectedTo ?downstream_flowline ;
          rdf:type kwg-ont:S2Cell_Level13 .
}
```

**Notes**:
- `hyf:downstreamFlowPathTC` is a transitive closure — it follows the full downstream path, not just one step
- Returns S2 cells connected to all downstream flow lines
- Can produce a large set of cells depending on how far downstream the network extends

### Step 4: Find Samples in Downstream Area

**Endpoint**: `sawgraph`
**Template**: `buildSampleRetrievalQuery(s2ValuesString, undefined)`

No sample filters applied.

```sparql
SELECT
  (COUNT(DISTINCT ?subVal) as ?resultCount)
  (MAX(?result_value) as ?max)
  (GROUP_CONCAT(DISTINCT ?substance; separator="; ") as ?substances)
  (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator="; ") as ?materials)
  ?sp ?spWKT ?s2cell
WHERE {
  ?sp rdf:type coso:SamplePoint ;
      spatial:connectedTo ?s2cell ;
      geo:hasGeometry/geo:asWKT ?spWKT .
  VALUES ?s2cell { <s2cells from step 3> }
  ?observation rdf:type coso:ContaminantObservation ;
      coso:observedAtSamplePoint ?sp ;
      coso:ofSubstance ?substance ;
      coso:analyzedSample ?sample ;
      coso:hasResult ?result .
  ?sample rdfs:label ?sampleLabel ;
      coso:sampleOfMaterialType ?matType .
  ?matType rdfs:label ?matTypeLabel .
  ?result coso:measurementValue ?result_value ;
      coso:measurementUnit ?unit .
  ?unit qudt:symbol ?unit_sym .
  BIND((CONCAT(str(?result_value), " ", ?unit_sym)) as ?subVal)
} GROUP BY ?sp ?spWKT ?s2cell
```

### Step 5: Get Facility Details

**Endpoint**: `federation`
**Template**: `buildFacilityDetailsQuery(filters, anchorS2Cells)`

```sparql
SELECT DISTINCT ?facility ?facWKT ?facilityName ?industryCode ?industryName ?s2cell WHERE {
  VALUES ?s2cell { <facility s2cells from step 1> }
  ?s2cell kwg-ont:sfContains ?facility .
  ?facility fio:ofIndustry ?industryGroup ;
            fio:ofIndustry ?industryCode ;
            geo:hasGeometry/geo:asWKT ?facWKT ;
            rdfs:label ?facilityName .
  ?industryCode a naics:NAICS-IndustryCode ;
                fio:subcodeOf ?industryGroup ;
                rdfs:label ?industryName .
  VALUES ?industryGroup { naics:NAICS-5622 }
}
```

### Step 6: Load Region Boundaries

**Endpoint**: `spatialkg`
**Template**: `buildRegionBoundaryQuery("18")`

```sparql
SELECT ?region ?regionName ?regionWKT WHERE {
  ?region kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.18 ;
          rdfs:label ?regionName ;
          geo:hasGeometry/geo:asWKT ?regionWKT .
}
```

**Returns**: All counties in Indiana with boundary geometries.
