# Industry counts

Not a dropdown of its own. These are the facility counts shown next to each entry in the
[Industry dropdown](Dropdowns%20Industry), and they come from a separate query against a
different endpoint, so they get their own page.

![Industry counts](images/dropdown_industry_counts.png)

## What it does

Once a state or some counties are selected, each node in the industry tree picks up a number:
how many facilities of that kind actually exist in that region. It turns an abstract list of
5596 NAICS codes into something you can steer by, because you can see at a glance which
industries are worth filtering on and which will return nothing.

With no region selected there are no counts at all. The query is gated behind having a state,
because counting every facility in the country is both slow and not useful for picking a
filter.

Counts roll up the tree. A leaf shows what the endpoint returned for that exact code. A
parent shows the sum of itself and everything beneath it, computed on the client by
`rollupCounts()`. So a sector node showing 400 means four hundred facilities spread across
its descendants, not four hundred facilities tagged with the bare sector code.

There is **no fallback**. If the query fails you get an empty object and the tree simply
shows no numbers. Nothing breaks, you just lose the guidance.

## The SPARQL query

Endpoint is `federation`, not `fiokg`. This is the important detail: the industry list comes
from `fiokg` but the counts cannot, because counting facilities per region needs the industry
graph and the spatial graph joined together, and only `federation` has both.

```sparql
SELECT ?industryCode (COUNT(DISTINCT ?facility) AS ?num) WHERE {
  VALUES ?_regionRoot { kwgr:administrativeRegion.USA.23 }
  ?s2 rdf:type kwg-ont:S2Cell_Level13 ;
      spatial:connectedTo ?_regionRoot ;
      kwg-ont:sfContains ?facility .
  ?facility fio:ofIndustry ?industryCode .
  ?industryCode a naics:NAICS-IndustryCode .
} GROUP BY ?industryCode
```

Line by line:

* `VALUES ?_regionRoot { ... }` is the selected region. One entry for a whole state, or one
  per county when counties are picked. `23` is Maine.
* `?s2 rdf:type kwg-ont:S2Cell_Level13` brings in S2 cells, the grid the whole app uses for
  spatial joins. Each cell covers roughly 1.2 square kilometres.
* `spatial:connectedTo ?_regionRoot` keeps only the cells inside the chosen region.
* `kwg-ont:sfContains ?facility` gets the facilities inside those cells.
* `?facility fio:ofIndustry ?industryCode` is what kind of facility it is, and the
  `naics:NAICS-IndustryCode` line keeps only real NAICS codes rather than any other
  classification hanging off the same predicate.
* `COUNT(DISTINCT ?facility)` per code. `DISTINCT` matters, because a facility sitting on a
  cell boundary can be reached more than once.

Note the route through S2 cells rather than asking directly which facilities are in Maine.
That is the standard pattern across this app: everything spatial goes through S2 Level 13
cells. See [`docs/ARCHITECTURE.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/ARCHITECTURE.md)
for why.

Verified against the live endpoint. Maine returns 664 distinct industry codes with counts,
from single facility codes like `111110` Soybean Farming through to the busier ones.

### What comes back

Full URIs, not bare codes:

```
http://w3id.org/fio/v1/naics#NAICS-111110   1
http://w3id.org/fio/v1/naics#NAICS-11121    4
```

Unlike the industry list query, this one does not strip the prefix in SPARQL. The hook does
it, splitting on `#` or `/` and then removing the leading `NAICS-`. The result has to match
the bare codes the tree is keyed on, so if either side changes shape the numbers silently
stop appearing.

## How it is wired up

* There is no control of its own. The numbers are passed into `HierarchicalSelect` as a
  `counts` prop at
  [`FacilityFilters.tsx:24`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/FacilityFilters.tsx#L24).
* The data comes from
  [`useIndustryCounts(region)`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L76),
  called at
  [`FacilityFilters.tsx:13`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/FacilityFilters.tsx#L13).
* The query text is built by
  [`buildIndustryCountsQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L14).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4)
  against the `federation` URL in
  [`endpoints.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/endpoints.ts).
* The rollup is
  [`rollupCounts()`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/useNaicsTree.ts#L148),
  now shared with the [Material](Dropdowns%20Material) dropdown. Summing children into a
  parent is only sound when the children partition the parent. That holds for NAICS by
  construction, and for material types because `MIN(?bucketPrio)` forces each one into
  exactly one group. It would not hold for a set of overlapping categories.

Cached under `['industryCounts', <region key>]` with `staleTime: Infinity` and gated by
`enabled: !!region?.stateCode`. The region key sorts the county codes before joining them, so
picking the same counties in a different order reuses the cache instead of refetching.

The hook returns a plain `Record<string, number>` keyed by bare code, which is what
`rollupCounts()` expects as its leaf counts.

## If it looks wrong

**No numbers anywhere.** Either no state is selected, which is expected, or the `federation`
query failed. There is no fallback, so failure looks exactly like "not selected yet". Check
the network tab to tell them apart.

**Numbers appear on some nodes but not others.** Those codes have no facilities in the
selected region. Zero is not returned, so nothing shows.

**A parent shows a bigger number than the sum of its visible children.** Expected when a
child code exists in the counts result but not in the industry list, or when the tree is
flatter than NAICS because of a missing intermediate code. The rollup only sums nodes that
are in the tree.

**Numbers vanish after switching from a state to counties.** New cache key, new fetch. If
they do not come back, one of the county codes is not resolving to a region root.

**Counts look too high for a small county.** Facilities on S2 cell boundaries can appear in
cells belonging to more than one region. `COUNT(DISTINCT ?facility)` dedupes within a single
result, but the cell to region join is inclusive by design.

## See also

* [Dropdowns Industry](Dropdowns%20Industry), the tree these numbers decorate
* [Dropdowns](Dropdowns), the index of all filter controls
