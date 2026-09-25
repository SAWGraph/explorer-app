# Industry dropdown

Picks which kinds of industrial facilities a facility query looks for, by NAICS code.
Multi select, and the only dropdown in the app that is a tree rather than a flat list.

![Industry dropdown](images/dropdown_industry.png)

## What it does

It appears in the query editor whenever the entity type is **Facilities**, inside
**+ Add Filters**.

NAICS is a hierarchy. Codes get longer as they get more specific: `31` is Manufacturing,
`3253` is Pesticide, Fertilizer and Other Agricultural Chemical Manufacturing, `325320` is
Pesticide and Other Agricultural Chemical Manufacturing specifically. The dropdown mirrors
that, as an expandable tree of checkboxes. Tick a branch and everything under it is
selected. Tick some of a branch and the parent shows an indeterminate state.

The full list is large, 5596 rows from the endpoint, which is why it is a searchable tree
rather than a list you scroll. Typing filters the tree and auto expands whatever matched.

Each node also shows how many facilities of that kind exist in the currently selected region.
Those numbers come from a completely separate query, documented in
[Dropdowns Industry Counts](Dropdowns%20Industry%20Counts).

### How the tree gets built

The important thing to understand is that **the endpoint does not return the tree**. It
returns a flat list of codes, each tagged with its two digit sector. The `?groupCode` column
is always a sector: `11` for agriculture, `31` for manufacturing. It is not the four digit
parent you might expect.

So the app builds the hierarchy itself, in
[`useNaicsTree.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/useNaicsTree.ts),
purely from the code strings. It sorts by code length so parents are created before children,
then for each code trims one character off the end at a time until it finds a code that
already exists, and attaches itself there. `325320` looks for `32532`, then `3253`, and stops
at the first hit. Anything that never finds a parent becomes a root.

`buildTree` has a second mode, used by the Material dropdown: an item may name its `parent`
outright, and an explicit parent wins over prefix trimming. When any item does that, the
caller's ordering is kept as given rather than sorted by code length — material types arrive
sorted by observation count and sorting them by URI would throw that away. Industry supplies
no explicit parents, so it takes the trimming path and the sort exactly as described above.

This is why the tree structure depends entirely on which codes happen to be present. If an
intermediate code is missing from the data, its children attach to whatever ancestor does
exist, and the tree is a little flatter than the real NAICS hierarchy at that point.

The hook that fetches the data does its own flattening first, in two passes: one collecting
unique sector codes as entries in their own right, one collecting the individual codes, then
sorting shortest first. Both passes feed the same list, which is what gives the tree its
sector level roots.

## The SPARQL query

Endpoint is `fiokg`, the facility and industry graph. This query takes no arguments and does
not vary with the region, which is why it is cached once per session under a fixed key.

```sparql
SELECT DISTINCT ?code ?label ?groupCode ?groupLabel WHERE {
  ?industryCode a naics:NAICS-IndustryCode ;
      rdfs:label ?label ;
      fio:subcodeOf ?group .
  ?group rdfs:label ?groupLabel .
  BIND(REPLACE(STR(?industryCode), STR(naics:NAICS-), "") AS ?code)
  BIND(REPLACE(STR(?group), STR(naics:NAICS-), "") AS ?groupCode)
} ORDER BY ?groupCode ?code
```

Line by line:

* `?industryCode a naics:NAICS-IndustryCode` is every NAICS code in the graph.
* `rdfs:label ?label` is its human name, "Soybean Farming".
* `fio:subcodeOf ?group` is the sector it belongs to, and `?group rdfs:label ?groupLabel`
  names that sector.
* The two `BIND(REPLACE(...))` lines strip the `naics:NAICS-` URI prefix off both, turning
  `http://w3id.org/fio/v1/naics#NAICS-111110` into the bare string `111110`. Doing it in
  SPARQL keeps the string surgery out of the app, and the bare code is what the tree builder
  needs anyway.

Verified against the live endpoint. It returns 5596 rows, beginning with `11111` Soybean
Farming under sector `11`, Agriculture, Forestry, Fishing and Hunting.

Two things the results show that the query does not make obvious. Both five digit and six
digit versions of the same industry come back, `11111` and `111110` both labelled
"Soybean Farming", which is how NAICS itself works and is why the tree ends up deep. And
some labels carry trailing whitespace straight from the source data.

## How it is wired up

* The control is `HierarchicalSelect`, shared with the Material dropdown, rendered at
  [`FacilityFilters.tsx:19`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/FacilityFilters.tsx#L19).
  Its parts are
  [`HierarchicalSelect.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/HierarchicalSelect.tsx),
  [`TreeNode.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/TreeNode.tsx)
  and
  [`useNaicsTree.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/useNaicsTree.ts).
* Its options come from
  [`useIndustries()`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L25),
  called at
  [`FacilityFilters.tsx:12`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/FacilityFilters.tsx#L12).
* The query text is built by
  [`buildDiscoverIndustriesQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L32).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4)
  against the `fiokg` URL in
  [`endpoints.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/endpoints.ts).
* The fallback list is
  [`FALLBACK_NAICS`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/naics.ts#L9),
  eight codes chosen because they cover the prebuilt questions: agricultural chemicals, waste
  treatment, landfills, national security, metal coating, paper mills, chemical wholesalers.

Cached under the fixed key `['industries']` with `staleTime: Infinity` and `retry: 1`.
`FALLBACK_NAICS` doubles as `placeholderData`, so the tree is never empty on first paint.

Worth knowing about the tree helpers, since they are where the behaviour actually lives:

* `expandSelections()` turns a ticked branch into every descendant code, which is what goes
  into the pipeline query.
* `collapseSelections()` does the reverse for display, so a fully ticked branch shows as one
  chip rather than forty.
* `getCheckState()` returns checked, unchecked, or indeterminate by counting selected
  descendants.
* `rollupCounts()` sums the facility counts up the tree so a parent shows the total of
  everything beneath it.

## If it looks wrong

**Exactly eight industries, no tree depth.** You are looking at `FALLBACK_NAICS`. The
`fiokg` endpoint failed or returned nothing.

**A code is missing.** It has no `fio:subcodeOf` triple in `fiokg`, so the query never
returned it. The query requires that predicate rather than treating it as optional.

**The hierarchy looks wrong or too flat.** The tree is inferred from code prefixes, not from
the data. A missing intermediate code makes its children attach further up. Compare against
what the query actually returned before assuming the tree builder is broken.

**Labels with odd trailing spaces.** Source data. They come through as is.

**No counts next to anything.** No region is selected, or the counts query failed. See
[Dropdowns Industry Counts](Dropdowns%20Industry%20Counts).

**Selecting a parent does not match the facilities you expected.** Selections are expanded to
descendant codes, so a parent only covers children that exist in this list. If the facility
you want carries a code absent from `fiokg`, no amount of parent ticking will reach it.

## See also

* [Dropdowns](Dropdowns), the index of all filter controls
* [Dropdowns Industry Counts](Dropdowns%20Industry%20Counts), the numbers shown on each node
