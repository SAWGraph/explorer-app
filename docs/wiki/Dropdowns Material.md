# Material dropdown

Picks what the sample was taken from: groundwater, soil, tissue, and so on. Multi select.
Leaving it empty means "any material".

![Material dropdown](images/dropdown_material.png)

## What it does

It sits directly under the Substance dropdown in the query editor, and appears whenever the
entity type is **Samples**, inside **+ Add Filters**.

Like Substance, the list comes from the data rather than a fixed list, sorted by how many
observations use each material, with the count in brackets: `GROUNDWATER (609496)`.
Unfiltered it returns 171 distinct material types across the whole graph. Labels come
straight from the graph, so they arrive in whatever case the source used. Maine data shouts
in uppercase (`GROUNDWATER`, `WASTE WATER`), water quality portal data is title case
(`Tissue`, `Water`). That inconsistency is upstream, not a rendering bug.

The list is region aware in the same way Substance is. Pick Cumberland County in Maine and
it narrows from 171 entries to 25.

Two quirks worth knowing about before you trust what you see:

* **"Material" is looser than it sounds.** The query keeps anything a sample was recorded as
  being made of, which in the water quality portal data includes biological taxa. Selecting
  Cumberland County surfaces `Mytilus edulis`, the blue mussel, sitting in the list next to
  `GROUNDWATER`. That is what the graph says, and the filter only excludes URIs outside the
  `http://w3id.org/` namespace.
* **The URIs used to change with the region, and no longer do.** `sawgraph` and
  `federation` once named groundwater differently, `me-egad#sampleMaterialType.GW` against
  `me-egad-data#sampleMaterialType.GW`, so a selection made before picking a state stopped
  matching after. Fixed upstream: controlled vocabulary now lives in the root namespaces,
  `me-egad#` and `us-wqp#`, and both endpoints agree. Verified 2026-09-09, all six fallback
  material types return identical counts on both.

## The SPARQL query

Endpoint is `sawgraph` with no region, `federation` once a state is picked. Unlike the
Substance query, the two variants are not the same query with a pattern spliced in. They are
written separately, and the difference matters.

### Without a region

```sparql
SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num)
WHERE {
  ?observation rdf:type coso:ContaminantObservation ;
               coso:analyzedSample ?sample .
  ?sample coso:sampleOfMaterialType ?matType .
  OPTIONAL { ?matType rdfs:label ?_label . }
  FILTER(STRSTARTS(STR(?matType), "http://w3id.org/"))
} GROUP BY ?matType
ORDER BY DESC(?num) ?label
```

Line by line:

* `?observation rdf:type coso:ContaminantObservation` is every recorded measurement.
* `coso:analyzedSample ?sample` is the physical sample that measurement was run on. This is
  the extra hop compared to Substance, which reads the chemical straight off the observation.
* `?sample coso:sampleOfMaterialType ?matType` is what that sample was made of.
* `OPTIONAL { rdfs:label }` because not every material type has a label. Ones that do not
  fall back to the tail of their URI, done in the hook rather than in SPARQL.
* The `FILTER` drops anything outside the `w3id.org` namespace, which is the crude way this
  query keeps out URIs from source vocabularies that were never meant to be shown.

Note that this variant never touches sample points at all. It walks observation to sample to
material and stops.

### With a region

```sparql
SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num)
WHERE {
  ?sp rdf:type coso:SamplePoint .
  ?sp spatial:connectedTo ?_region .
  ?_region rdf:type kwg-ont:AdministrativeRegion_3 ;
           kwg-ont:administrativePartOf+ ?_regionRoot .
  VALUES ?_regionRoot { kwgr:administrativeRegion.USA.23005 }
  ?observation rdf:type coso:ContaminantObservation ;
               coso:observedAtSamplePoint ?sp ;
               coso:analyzedSample ?sample .
  ?sample coso:sampleOfMaterialType ?matType .
  OPTIONAL { ?matType rdfs:label ?_label . }
  FILTER(STRSTARTS(STR(?matType), "http://w3id.org/"))
} GROUP BY ?matType
ORDER BY DESC(?num) ?label
```

The added part is the same region pattern the Substance dropdown uses, plus the
`coso:observedAtSamplePoint` hop that connects an observation to a place. `23005` is
Cumberland County, Maine. A whole state selection uses the two digit code instead, and the
`administrativePartOf+` walk covers everything underneath it either way.

Verified against the live endpoints. Unfiltered returns 171 material types, led by
`GROUNDWATER` at 609496 observations, then `Tissue` at 96272 and `Water` at 95779.
Cumberland County returns 25.

## How it is wired up

* The control is a shared `FlatSelect`, rendered at
  [`SampleFilters.tsx:52`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L52).
* Its options come from
  [`useMaterialTypes(region)`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L120),
  called at
  [`SampleFilters.tsx:20`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L20).
* The query text is built by
  [`buildDiscoverMaterialTypesQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L94),
  and the region part by
  [`buildSamplePointRegionPattern()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L46).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4).
* The fallback list is
  [`FALLBACK_MATERIAL_TYPES`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/materialTypes.ts#L8),
  six entries covering groundwater, drinking water, surface water, soil, sludge and leachate.

Cached under `['materialTypes', <region key>]` with `staleTime: Infinity` and `retry: 1`, so
one fetch per region per session. As with Substance, the fallback doubles as
`placeholderData`, and the empty result handling is asymmetric: with no region the fallback
is returned, with a region an empty list is.

The missing label fallback happens in the hook, at
[`useDiscoveryQueries.ts:132`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L132),
by splitting the URI on `#` or `/` and taking the tail.

## If it looks wrong

**Exactly six materials with tidy title case labels and no counts.** That is
`FALLBACK_MATERIAL_TYPES`. Real results shout in uppercase and carry counts.

**A selection stops matching after picking a state.** Historic, fixed upstream in the
September 2026 rebuild. The two endpoints used to name the same material differently and the
stored selection is a URI, so it stopped matching. Both now use the root `me-egad#`
namespace. If you see this again, compare the material URIs the two endpoints return before
assuming it is an app bug.

**Species names in a materials list.** Genuinely in the graph, under
`http://w3id.org/sawgraph/v1/us-wqp#biologicalTaxon.*`. The namespace filter does not exclude
them. If they should not be offered, the filter needs to be narrower than
`http://w3id.org/`.

**Labels that are URI tails, like `sampleMaterialType.WW`.** That material has no
`rdfs:label`, so the hook fell back to the URI tail.

**Empty after picking a county.** No observations recorded there. Expected.

## See also

* [Dropdowns](Dropdowns), the index of all filter controls
* [Dropdowns Substance](Dropdowns%20Substance), which shares the region pattern and the same fallback behaviour
