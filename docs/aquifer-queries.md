# Aquifer exploration queries

Scratch queries run against FRINK endpoints while scoping "add aquifers to the explorer".
Results are as of 2026-08 (ME + IL data only). Run with:

```bash
curl -s -H "Accept: application/sparql-results+json" \
  --data-urlencode "query=$Q" \
  https://frink.apps.renci.org/<ENDPOINT>/sparql
```

Key namespaces (note: gwml2 is `gwml2.org`, NOT the OGC `opengis.net/def/gwml`):

| Prefix | IRI |
|--------|-----|
| `gwml2:` | `http://gwml2.org/def/gwml2#` |
| `saw_water:` | `http://sawgraph.spatialai.org/v1/saw_water#` |
| `spatial:` | `http://purl.org/spatialai/spatial/spatial-full#` |
| `coso:` | `http://w3id.org/coso/v1/contaminoso#` |

Perf note: full-scan `FILTER(CONTAINS(...))` + `GROUP BY` over all types times out (30s).
Discover IRIs with a plain `SELECT ... LIMIT n` (no `DISTINCT`, no aggregation) — QLever stops early.

---

## Instance counts by class (hydrologykg)

```sparql
SELECT (COUNT(?s) AS ?n) WHERE { ?s a <http://gwml2.org/def/gwml2#GW_Aquifer> }
```

Verified: `GW_Aquifer` = **8,441** · `GW_AquiferSystem` = **1,941** ·
`GW_AquiferUnit` = 0 · `GW_HydrogeoUnit` = 0.

## Count by source graph / state (hydrologykg)

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?src (COUNT(?s) AS ?n) WHERE {
  ?s rdf:type <http://gwml2.org/def/gwml2#GW_Aquifer> .
  BIND(REPLACE(STR(?s), '#.*', '') AS ?src)
} GROUP BY ?src ORDER BY DESC(?n)
```

Verified — GW_Aquifer: ME (`me_mgs_data`) 4,972 · IL (`il_isgs_data`) 3,469.
GW_AquiferSystem: ME 1,502 · IL 439.

## Aquifer type distribution (federation)

```sparql
SELECT ?t (COUNT(?a) AS ?n) WHERE {
  ?a <http://sawgraph.spatialai.org/v1/saw_water#aquiferType> ?t
} GROUP BY ?t ORDER BY DESC(?n)
```

Verified: `sand and gravel` 4,972 · `coarse-grain_materials` 3,367 ·
`sand_gravel` 88 · `bedrock` 14. (~99% surficial. Vocab is inconsistent across
states — `sand and gravel` [ME] vs `coarse-grain_materials` [IL] are the same thing.)

## Aquifer attributes (federation)

One aquifer, non-spatial predicates:

```sparql
SELECT ?p ?o WHERE {
  <http://sawgraph.spatialai.org/v1/il_isgs_data#d.ISGS-Aquifer.BR0001> ?p ?o
  FILTER(!STRSTARTS(STR(?p),'http://purl.org/spatialai'))
}
```

Verified: only `il-isgs:ilSawAqId` (e.g. `BR0001`) and `saw_water:aquiferType`.
No name, no label, no polygon geometry.

## Spatial footprint = S2 cells only (render-load check)

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX spatial: <http://purl.org/spatialai/spatial/spatial-full#>
SELECT (COUNT(*) AS ?links) (COUNT(DISTINCT ?s2) AS ?cells) WHERE {
  ?aq rdf:type <http://gwml2.org/def/gwml2#GW_Aquifer> .
  ?s2 spatial:connectedTo ?aq .
}
```

Verified: 305,821 links, **146,361 distinct S2 cells** for all aquifers.
A single bedrock aquifer alone touches ~69K cells. S2-cell geometry lives in
`spatialkg`, not `hydrologykg` — drawing extent needs a second cross-graph fetch.

## Aquifer type + S2 cells in one endpoint (join feasibility)

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT (COUNT(DISTINCT ?aq) AS ?naq) WHERE {
  ?aq rdf:type <http://gwml2.org/def/gwml2#GW_Aquifer> ;
      <http://sawgraph.spatialai.org/v1/saw_water#aquiferType> ?t .
  ?s2 <http://purl.org/spatialai/spatial/spatial-full#connectedTo> ?aq ;
      rdf:type <http://stko-kwg.geog.ucsb.edu/lod/ontology/S2Cell_Level13> .
}
```

Verified 8,441 in both `hydrologykg` and `federation` — type filter + S2 join
work in a single endpoint. This is the binding the "aquifer as C-side filter"
UI would use (`?s2 connectedTo ?aquifer` + optional aquiferType filter),
mirroring the existing wells pattern.

## No direct well→aquifer link (federation)

```sparql
SELECT ?p (COUNT(*) AS ?n) WHERE {
  ?well ?p ?aq . ?aq a <http://gwml2.org/def/gwml2#GW_Aquifer> .
} GROUP BY ?p
```

Verified: aquifers are reached only via S2 cells (`spatial:connectedTo`,
`sfWithin`, `sfOverlaps`, `sfContains`) and `gwml2:gwAquiferSystemPart` (8,339)
+ `owl:sameAs` (8,441). No well/sample predicate points at an aquifer —
association is purely spatial (shared S2 cells).
