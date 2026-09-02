# Substance dropdown

Picks which PFAS chemicals a sample query looks for. Multi select. Leaving it empty means
"any substance".

![Substance dropdown](images/dropdown_substance.png)

## What it does

It appears in the query editor whenever the entity type is **Samples**, inside
**+ Add Filters**, above the Material dropdown.

The list is built from the data rather than hardcoded. It shows every substance that has at
least one contaminant observation behind it, sorted by how many observations mention it,
with that number in brackets after the name, like `PFOA (15217)`. Labels prefer the short
acronym and fall back to the full chemical name when a substance has no acronym recorded.

The list is region aware. Pick a state or some counties in the Region selector and it
narrows to substances actually observed there, with the counts moving to match. Maine, for
example, returns 71 substances. Changing the region triggers a refetch, and each region gets
its own cache entry.

When the query returns nothing, two things can happen:

* **No region selected.** You get seven hardcoded PFAS substances and no counts, so the
  dropdown is never empty on a cold start.
* **A region is selected.** You get an empty list, on purpose. "No PFAS data for this county"
  is real information, and quietly showing national defaults there would be misleading.

> **Known issue.** As of the last check the no region query returns zero rows, so the
> unfiltered dropdown always shows the seven item fallback. See
> [If it looks wrong](#if-it-looks-wrong) below for why.

## The SPARQL query

Two endpoints, picked by whether a region is set. Without a region it goes to `sawgraph`.
Once a state is chosen it goes to `federation`, because region filtering needs the spatial
graph joined in and only `federation` has both graphs.

```sparql
SELECT ?substance
  (SAMPLE(?_label) AS ?label)
  (SAMPLE(?_short) AS ?short_label)
  (COUNT(DISTINCT ?observation) AS ?num)
WHERE {
  ?observation rdf:type coso:ContaminantObservation ;
               coso:ofDSSToxSubstance ?substance .
  ?substance a comptox:ChemicalEntity ;
             dcterms:alternative ?_label .
  OPTIONAL { ?substance skos:altLabel ?_short . }
} GROUP BY ?substance
ORDER BY DESC(?num) ?label
```

Reading it a line at a time:

* `?observation rdf:type coso:ContaminantObservation` is every recorded measurement in the graph.
* `coso:ofDSSToxSubstance ?substance` is the chemical that measurement was for.
* `?substance a comptox:ChemicalEntity` keeps only real chemical entities.
* `dcterms:alternative ?_label` is the full name, like "Perfluorooctanoic acid".
* `OPTIONAL { skos:altLabel ?_short }` is the acronym, like "PFOA". Not every substance has
  one, which is why it is optional rather than required.
* `COUNT(DISTINCT ?observation)` is the number shown in brackets.

`SAMPLE()` is used on both labels because a substance can carry more than one of each and
the dropdown only has room for one. Any of them will do.

### With a region selected

A region pattern gets spliced in, restricting observations to sample points inside the
chosen state or counties:

```sparql
SELECT ?substance
  (SAMPLE(?_label) AS ?label)
  (SAMPLE(?_short) AS ?short_label)
  (COUNT(DISTINCT ?observation) AS ?num)
WHERE {
  ?sp rdf:type coso:SamplePoint .
  ?sp spatial:connectedTo ?_region .
  ?_region rdf:type kwg-ont:AdministrativeRegion_3 ;
           kwg-ont:administrativePartOf+ ?_regionRoot .
  VALUES ?_regionRoot { kwgr:administrativeRegion.USA.23 }
  ?observation rdf:type coso:ContaminantObservation ;
               coso:observedAtSamplePoint ?sp ;
               coso:ofDSSToxSubstance ?substance .
  ?substance a comptox:ChemicalEntity ;
             dcterms:alternative ?_label .
  OPTIONAL { ?substance skos:altLabel ?_short . }
} GROUP BY ?substance
ORDER BY DESC(?num) ?label
```

`administrativeRegion.USA.23` is Maine, FIPS 23. County selections put five digit county
FIPS codes in that same `VALUES` slot instead, so Cumberland County becomes
`administrativeRegion.USA.23005`.

The `AdministrativeRegion_3` hop plus `administrativePartOf+` is what makes one state code
cover everything underneath it. Sample points connect to small regions, and the query walks
up the containment chain until it reaches the state you picked.

Sub county selections, meaning codes longer than five digits, take a different route
entirely. They join with `kwg-ont:sfWithin|kwg-ont:sfTouches` against a Data Commons `geoId`
URI rather than walking the administrative hierarchy.

Verified against the live endpoints. The Maine query returns 71 substances, topped by
PFOA at 15217 observations, PFOS at 15098, PFBS at 14922.

## How it is wired up

* The control is a shared `FlatSelect`, rendered at
  [`SampleFilters.tsx:35`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L35).
* Its options come from
  [`useSubstances(region)`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L97),
  called at
  [`SampleFilters.tsx:19`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L19).
* The query text is built by
  [`buildDiscoverSubstancesQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L71),
  and the region part by
  [`buildSamplePointRegionPattern()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L46).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4),
  against the URLs in
  [`endpoints.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/endpoints.ts).
* Prefixes come from
  [`prefixes.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/prefixes.ts).
* The fallback list is
  [`FALLBACK_SUBSTANCES`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/substances.ts#L9).

React Query caches under `['substances', <region key>]` with `staleTime: Infinity`, so it is
one fetch per region per session, and `retry: 1`. `FALLBACK_SUBSTANCES` doubles as
`placeholderData`, which is why the dropdown shows the default PFAS list while a real query
is still in flight.

The label shown in the list is `shortLabel || label`, with the count appended by `withCount()`
at [`SampleFilters.tsx:14`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L14).
Selecting an option stores both the substance URI and its display label on the question, so
the Analysis Question sentence can say "PFOA" instead of a DSSTox URI.

## If it looks wrong

**Exactly seven PFAS substances and no counts.** You are looking at `FALLBACK_SUBSTANCES`.
Either the endpoint failed, or the query genuinely returned zero rows.

**The unfiltered list is always the fallback.** This is the current state of things. The
`sawgraph` endpoint has 944541 `coso:ofDSSToxSubstance` triples and 101 `comptox:ChemicalEntity`
subjects, but zero `dcterms:alternative` triples. Substances there carry `rdfs:label` instead.
`dcterms:alternative` only exists on `federation`, which is why the region scoped version
works and the unfiltered one does not. Whoever fixes this should either point the no region
query at `federation` too, or relax the label pattern to accept `rdfs:label`.

**Empty after picking a county.** There genuinely are no observations there. Expected, not a bug.

**Briefly shows the national list, then empties.** `placeholderData` is unconditional, so the
fallback flashes while the region scoped query resolves and is then replaced by the real
result, empty or otherwise.

**Full chemical names instead of acronyms.** Those substances have no `skos:altLabel` in the
graph. Nothing to fix in the app.

**Stale after changing region.** The region is not reaching the hook. Check the `region` prop
chain into `SampleFilters`, since the cache key is derived from it.

## See also

* [Dropdowns](Dropdowns), the index of all filter controls
* [Dropdowns Material](Dropdowns%20Material), which shares the same region pattern
* [`docs/SCHEMA.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/SCHEMA.md) for the wider predicate inventory
