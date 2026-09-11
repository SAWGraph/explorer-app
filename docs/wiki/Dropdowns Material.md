# Material dropdown

Picks what the sample was taken from: groundwater, soil, tissue, and so on. Multi select.
Leaving it empty means "any material".

![Material dropdown](images/dropdown_material.png)

## What it does

It sits directly under the Substance dropdown in the query editor, and appears whenever the
entity type is **Samples**, inside **+ Add Filters**.

Like Substance, the list comes from the data rather than a fixed list, sorted by how many
observations use each material, with the count in brackets: `GROUNDWATER (609,496)`.
Unfiltered it returns 171 distinct material types across the whole graph. Labels come
straight from the graph, so they arrive in whatever case the source used. Maine data shouts
in uppercase (`GROUNDWATER`, `WASTE WATER`), water quality portal data is title case
(`Tissue`, `Water`). That inconsistency is upstream, not a rendering bug.

Those 171 are not shown as one long list. They sit under five headings, and each heading is
itself a checkbox you can tick to take everything beneath it, and an arrow you can click to
fold it away. That matters because the distribution is lopsided: 131 of the 171 are
individual fish species, all under Biota.

| Group | Unfiltered | Maine | Cumberland County |
|---|---|---|---|
| Water | 14 | 13 | 12 |
| Biota | 131 | 26 | 7 |
| Solid Material | 15 | 9 | 3 |
| Air | 1 | — | — |
| Other | 10 | 6 | 3 |
| **Total** | **171** | **54** | **25** |

The list is region aware in the same way Substance is. Pick Cumberland County in Maine and
it narrows from 171 entries to 25. Air disappears entirely below the national level: there
are no air samples in Maine.

## Where the five groups come from

The graph has no notion of "Water samples" as a category of material type. The grouping is
computed in the discovery query itself, by `MATERIAL_BUCKET_VALUES` in `regions.ts`: each
sample is left joined to the four direct subclasses of `coso:MaterialSample`, each tagged
with a priority, and `MIN(?prio)` picks one.

```
coso:BiotaSample          1
coso:SolidMaterialSample  2
coso:WaterSample          3
coso:AirSample            4
```

The tie break exists because the data is not cleanly disjoint — 171 material types produce
178 type-to-bucket links, so seven of them sit under more than one subclass and `MIN` picks
the lowest number. Anything that matches no subclass has no `?bucketPrio` at all and the hook
drops it into **Other**.

Two consequences worth holding on to:

* Because `MIN` forces exactly one bucket per material type, the groups partition the list.
  That is what makes a group's count exactly the sum of its children's counts. Verified for
  Maine: Water shows 556,269, and its thirteen children sum to 556,269.
* The priority order is a judgement call baked into the query, not something the ontology
  says. A material type sampled as both biota and solid material is filed under Biota.

**Ticking a group changes nothing about the SPARQL.** The group headings are a display
concept with no URI behind them. Selecting one expands to its children's real material type
URIs before anything is stored, so the query the pipeline sends is identical to the one you
would get by ticking every child by hand. Internally the headings carry synthetic codes like
`__group:Water`, and those are stripped before the selection is saved.

Two quirks worth knowing about before you trust what you see:

* **"Material" is looser than it sounds.** The query keeps anything a sample was recorded as
  being made of, which in the water quality portal data includes biological taxa. Selecting
  Cumberland County surfaces `Mytilus edulis`, the blue mussel, sitting in the list next to
  `GROUNDWATER`. That is what the graph says, and the filter only excludes URIs outside the
  `http://w3id.org/` namespace.
* **Material type URIs live in the root namespace, not the `-data` one.** The August 2026
  reload split the graph in two directions at once. Instance data — individual samples and
  sample points — moved to `v2/me-egad-data#` and `v2/us-wqp-data#`. The controlled
  vocabulary went the other way, out of `-data` and into the plain roots `v1/me-egad#` and
  `v1/us-wqp#`. A material type is vocabulary, so it is always the root form. Source of
  truth is `pfas-kg`, `datasets/maine/egad/controlledVocab/sample_type.ttl`, which declares
  `@prefix me_egad: <http://w3id.org/sawgraph/v1/me-egad#>` and defines 47 terms. Checked
  live on 2026-09-11: `v1/me-egad#sampleMaterialType.GW` has 46,110 triples and all three
  other spellings have none.

## The SPARQL query

Endpoint is `sawgraph` with no region, `federation` once a state is picked. Unlike the
Substance query, the two variants are not the same query with a pattern spliced in. They are
written separately, and the difference matters.

### Without a region

```sparql
SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num)
       (MIN(?prio) AS ?bucketPrio)
WHERE {
  ?observation rdf:type coso:ContaminantObservation ;
               coso:analyzedSample ?sample .
  ?sample coso:sampleOfMaterialType ?matType .
  OPTIONAL {
    ?sample rdf:type ?bucketClass .
    VALUES (?bucketClass ?prio) {
      (coso:BiotaSample 1)
      (coso:SolidMaterialSample 2)
      (coso:WaterSample 3)
      (coso:AirSample 4)
    }
  }
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
  query keeps out URIs from source vocabularies that were never meant to be shown. As of
  2026-09-11 it excludes nothing at all — every material type in the graph is already under
  `w3id.org` — so it is dead weight rather than an active filter.
* The `OPTIONAL` bucket block and `MIN(?prio)` are what produce the five groups, covered
  above. Leave them out and you get the same 171 rows, ungrouped.

Note that this variant never touches sample points at all. It walks observation to sample to
material and stops.

### With a region

```sparql
SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num)
       (MIN(?prio) AS ?bucketPrio)
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
  OPTIONAL {
    ?sample rdf:type ?bucketClass .
    VALUES (?bucketClass ?prio) {
      (coso:BiotaSample 1)
      (coso:SolidMaterialSample 2)
      (coso:WaterSample 3)
      (coso:AirSample 4)
    }
  }
  OPTIONAL { ?matType rdfs:label ?_label . }
  FILTER(STRSTARTS(STR(?matType), "http://w3id.org/"))
} GROUP BY ?matType
ORDER BY DESC(?num) ?label
```

The added part is the same region pattern the Substance dropdown uses, plus the
`coso:observedAtSamplePoint` hop that connects an observation to a place. `23005` is
Cumberland County, Maine. A whole state selection uses the two digit code instead, and the
`administrativePartOf+` walk covers everything underneath it either way.

Verified against the live endpoints on 2026-09-11. Unfiltered returns 171 material types,
led by `GROUNDWATER` at 609,496 observations, then `Tissue` at 96,272 and `Water` at 95,779.
Maine returns 54, Cumberland County 25.

## How it is wired up

* The control is `HierarchicalSelect`, the same tree component the Industry dropdown uses,
  rendered at
  [`SampleFilters.tsx:91`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L91).
  It used to be the shared `FlatSelect`, which is why the group headings were plain text.
* The synthetic group rows, the expansion back to real URIs and the derived collapse of a
  fully selected group all live in `SampleFilters` itself, keyed off
  [`GROUP_PREFIX`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L14).
  `HierarchicalSelect` knows nothing about material types; it is handed a flat list of
  `{ code, label, parent }` and builds the tree from that.
* Its options come from
  [`useMaterialTypes(region)`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L143),
  called at
  [`SampleFilters.tsx:28`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx#L28).
  The group string is derived from `?bucketPrio` at
  [`useDiscoveryQueries.ts:157`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L157).
* The query text is built by
  [`buildDiscoverMaterialTypesQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L110),
  with the bucket block at
  [`MATERIAL_BUCKET_VALUES`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L99),
  and the region part by
  [`buildSamplePointRegionPattern()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L46).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4).
* The fallback list is
  [`FALLBACK_MATERIAL_TYPES`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/materialTypes.ts#L19),
  six entries covering groundwater, drinking water, surface water, soil, sludge and leachate.
  It carries no `group`, so every entry lands under "Other" — see below.
* Group counts are summed by
  [`rollupCounts()`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/useNaicsTree.ts#L148),
  shared with the Industry dropdown.

Cached under `['materialTypes', <region key>]` with `staleTime: Infinity` and `retry: 1`, so
one fetch per region per session. As with Substance, the fallback doubles as
`placeholderData`, and the empty result handling is asymmetric: with no region the fallback
is returned, with a region an empty list is.

The missing label fallback happens in the hook, at
[`useDiscoveryQueries.ts:155`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L155),
by splitting the URI on `#` or `/` and taking the tail.

## If it looks wrong

**One "Other" heading containing six title case materials, no counts.** That is
`FALLBACK_MATERIAL_TYPES`, so discovery failed. The giveaway is the shape as much as the
content: the fallback entries carry no `group`, so every one of them defaults to "Other" and
you get a single heading instead of five. Real results shout in uppercase, carry counts, and
spread across Water, Biota, Solid Material, Air and Other.

**A group's count does not match how many results you get.** The number beside a heading is
observations, summed from its children. What comes back from a run is sample points or
samples. They are different units and will not line up.

**A material disappeared from the list but results are still filtered by it.** Chips are
derived from the current option list, so a selection that falls out of that list after a
region change stops being displayed while remaining in the query. Pick a Maine-only species,
switch to Illinois, and the control reads "Any material type..." while quietly returning
nothing. Clear the control and reselect. This predates the tree and applies to the Substance
dropdown too.

**Samples you can see on the map vanish as soon as you pick any material.** Fourteen samples,
carrying 177 observations, have no `coso:sampleOfMaterialType` at all. The filter matches on
that predicate, so anything lacking it is excluded by every possible selection. Nothing to
fix in the app; the upstream data simply does not say what those samples were made of.

**A hardcoded material URI returns an empty map and no error.** This is what broke the
"PFHpA Groundwater Samples Downstream from Facilities in Cumberland County" card until
`ef0c40b`. It pinned `v1/me-egad-data#sampleMaterialType.GW`, which matches zero triples.
The filter that gets built is `VALUES ?matType { <dead-iri> }`, which is perfectly valid
SPARQL — the endpoint answers 200 with no rows, and the app has no way to tell that apart
from "there is genuinely nothing here". A dead URI does not error, it just quietly removes
everything. If a selection returns nothing, count the triples on the URI itself before
looking anywhere else.

**Species names in a materials list.** Genuinely in the graph, under
`http://w3id.org/sawgraph/v1/us-wqp#biologicalTaxon.*`. The namespace filter does not exclude
them. If they should not be offered, the filter needs to be narrower than
`http://w3id.org/`.

**Labels that are URI tails, like `sampleMaterialType.WW`.** That material has no
`rdfs:label`, so the hook fell back to the URI tail. As of 2026-09-11 this does not happen:
all 171 material types carry a label, and `.WW` in particular is `WASTE WATER`. If you do
see a raw tail, a term has been added upstream without a label.

**Empty after picking a county.** No observations recorded there. Expected.

## See also

* [Dropdowns](Dropdowns), the index of all filter controls
* [Dropdowns Substance](Dropdowns%20Substance), which shares the region pattern and the same fallback behaviour
