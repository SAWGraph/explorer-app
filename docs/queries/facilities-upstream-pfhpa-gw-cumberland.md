# Facilities Upstream from PFHpA Groundwater Samples in Cumberland County

> Identify facilities located upstream of groundwater sample points that tested positive for PFHpA (10-1000 ng/L) in Cumberland County, Maine. Traces upstream hydrology flow paths.

**ID**: `facilities-upstream-pfhpa-gw-cumberland`

## Analysis Question

| Part | Configuration |
|------|--------------|
| **Block A** (target) | Samples in Maine (state FIPS: 23), Cumberland County (23005), filtered to: substance PFHpA (`me_egad_data:parameter.PFHPA_A`), material type Groundwater (`me_egad_data:sampleMaterialType.GW`), concentration 10-1000 ng/L |
| **Relationship** | Upstream |
| **Block C** (anchor) | Facilities — no filters (all facilities) |

## Pipeline Steps

| # | Step Type | Endpoint | Description |
|---|-----------|----------|-------------|
| 1 | `GET_S2_FOR_ANCHOR` | sawgraph | Find S2 cells containing PFHpA groundwater samples in Cumberland County |
| 2 | `EXPAND_S2_NEAR` | spatialkg | Expand to neighboring S2 cells (captures nearby flow paths) |
| 3 | `TRACE_UPSTREAM` | hydrologykg | Trace upstream flow paths from expanded cells |
| 4 | `FIND_TARGET_ENTITIES` | federation | Find facilities in the upstream area |
| 5 | `GET_ANCHOR_DETAILS` | sawgraph | Get sample details for map display |
| 6 | `GET_REGION_BOUNDARIES` | spatialkg | Load Maine county boundaries |

**Note**: Upstream queries start from **Block A** (samples), not Block C. The planner reverses the direction: it finds sample S2 cells first, traces upstream, then finds facilities in the upstream area. Block C (facilities) has no filters, so all facilities in upstream cells are returned.

## SPARQL Queries

### Step 1: Find Sample S2 Cells

**Endpoint**: `sawgraph`
**Template**: `buildSampleS2Query(sampleFilters, "23005")`

This query applies all sample filters: substance, material type, and concentration range.

```sparql
SELECT DISTINCT ?s2cell WHERE {
  ?sp rdf:type coso:SamplePoint ;
      spatial:connectedTo ?s2cell .
  ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
  ?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.23005 .
  ?observation rdf:type coso:ContaminantObservation ;
      coso:observedAtSamplePoint ?sp ;
      coso:ofSubstance ?substance ;
      coso:analyzedSample ?sample ;
      coso:hasResult ?result .
  ?sample coso:sampleOfMaterialType ?matType .
  ?matType rdfs:label ?matTypeLabel .
  ?result coso:measurementValue ?result_value ;
      coso:measurementUnit ?unit .
  VALUES ?substance { me_egad_data:parameter.PFHPA_A }
  VALUES ?matType { me_egad_data:sampleMaterialType.GW }
  FILTER (?result_value > 10)
  FILTER (?result_value < 1000)
} GROUP BY ?s2cell
```

**Notes**:
- Region filter `23005` (Cumberland County) is baked into the query
- `me_egad_data:parameter.PFHPA_A` = PFHpA (a PFAS compound)
- `me_egad_data:sampleMaterialType.GW` = groundwater samples
- Concentration range: 10-1000 ng/L (strict inequality: `> 10` and `< 1000`)

### Step 2: Expand to Neighboring S2 Cells

**Endpoint**: `spatialkg`
**Template**: `buildNearExpansionQuery(s2ValuesString)`

```sparql
SELECT DISTINCT ?s2cell WHERE {
  VALUES ?s2neighbor { <s2cells from step 1> }
  ?s2neighbor kwg-ont:sfTouches | owl:sameAs ?s2cell .
  ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
}
```

### Step 3: Trace Upstream Flow Paths

**Endpoint**: `hydrologykg`
**Template**: `buildUpstreamTraceQuery(s2ValuesString)`

Uses the transitive closure property `hyf:downstreamFlowPathTC` in reverse: finds all flow paths whose downstream closure includes the anchor cells.

```sparql
SELECT DISTINCT ?s2cell WHERE {
  ?downstream_flowline rdf:type hyf:HY_FlowPath ;
      spatial:connectedTo ?s2cellds .
  ?upstream_flowline hyf:downstreamFlowPathTC ?downstream_flowline .
  VALUES ?s2cellds { <s2cells from step 2> }
  ?s2cell spatial:connectedTo ?upstream_flowline ;
          rdf:type kwg-ont:S2Cell_Level13 .
}
```

**Notes**:
- Reverses the downstream trace: `?upstream_flowline hyf:downstreamFlowPathTC ?downstream_flowline`
- "If upstream flows downstream to downstream, then upstream is upstream of downstream"
- Returns S2 cells of all upstream flow paths

### Step 4: Find Facilities in Upstream Area

**Endpoint**: `federation`
**Template**: `buildFacilityDetailsQuery(undefined, s2Cells)`

No facility filters — returns all facilities found in upstream S2 cells.

```sparql
SELECT DISTINCT ?facility ?facWKT ?facilityName ?industryCode ?industryName ?s2cell WHERE {
  VALUES ?s2cell { <s2cells from step 3> }
  ?s2cell kwg-ont:sfContains ?facility .
  ?facility fio:ofIndustry ?industryGroup ;
            fio:ofIndustry ?industryCode ;
            geo:hasGeometry/geo:asWKT ?facWKT ;
            rdfs:label ?facilityName .
  ?industryCode a naics:NAICS-IndustryCode ;
                fio:subcodeOf ?industryGroup ;
                rdfs:label ?industryName .
}
```

**Returns**: All facilities with their name, geometry, and NAICS codes — no industry filter applied.

### Step 5: Get Sample Details

**Endpoint**: `sawgraph`
**Template**: `buildSampleRetrievalQuery(s2ValuesString, sampleFilters)`

Retrieves detailed sample data with the same filters applied.

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
  VALUES ?s2cell { <sample s2cells from step 1> }
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
  VALUES ?substance { me_egad_data:parameter.PFHPA_A }
  VALUES ?matType { me_egad_data:sampleMaterialType.GW }
  FILTER (?result_value > 10)
  FILTER (?result_value < 1000)
  BIND((CONCAT(str(?result_value), " ", ?unit_sym)) as ?subVal)
} GROUP BY ?sp ?spWKT ?s2cell
```

### Step 6: Load Region Boundaries

**Endpoint**: `spatialkg`
**Template**: `buildRegionBoundaryQuery("23")`

```sparql
SELECT ?region ?regionName ?regionWKT WHERE {
  ?region kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.23 ;
          rdfs:label ?regionName ;
          geo:hasGeometry/geo:asWKT ?regionWKT .
}
```

**Returns**: All counties in Maine with boundary geometries.
