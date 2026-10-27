# Dropdowns

Every filter control in the query editor, and where its options come from.

Five of them ask the knowledge graph what to offer. The rest are fixed lists in the code.
This page is the index; the five query backed ones each have their own page.

## Populated by SPARQL

**[Substance](Dropdowns%20Substance)**
Which PFAS chemicals to look for. Shown for Samples. Endpoint `sawgraph` with no region,
`federation` once a state is picked. Falls back to seven hardcoded PFAS substances.

**[Material](Dropdowns%20Material)**
What the sample was taken from. Shown for Samples. Same endpoint switch as Substance.
Grouped into Water, Biota, Solid Material, Air and Other, and those headings are
themselves tickable and collapsible. Falls back to six material types.

**[Industry](Dropdowns%20Industry)**
NAICS codes, as a searchable tree. Shown for Facilities. Endpoint `fiokg`. Falls back to
eight codes covering the prebuilt questions.

**[Industry counts](Dropdowns%20Industry%20Counts)**
The facility counts shown on each industry tree node. Endpoint `federation`. No fallback,
and nothing at all until a state is selected.

**[County](Dropdowns%20County)**
Narrows to counties inside the selected state. Endpoint `spatialkg`. No fallback, on purpose.

All five follow the same shape. A hook in
[`useDiscoveryQueries.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts)
calls a query builder in
[`templates/regions.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts)
and runs it through
[`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts).
Results are cached by React Query with `staleTime: Infinity`, so each one fetches at most
once per region per session.

## Fixed lists in the code

These never touch an endpoint. Listed here so the coverage above is unambiguous.

**Type**, the entity a block is about. Grouped into Samples (Sample Results), Features
(Facilities, Surface Water, Ground Water (Aquifers), Wells), and two groups that only hold a
disabled "Coming soon" row for now, Environmental Variables and Model Output. Surface Water is
one entry for two engine types, `waterBodies` and `streams`; Feature Type picks between them.
[`EntityTypeSelector.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/EntityTypeSelector.tsx)

**Relationship**. Near, Downstream of, Upstream from.
[`RelationshipSelector.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/RelationshipSelector.tsx)

**Distance**, shown only when the relationship is Near. Zero to four miles, which map to S2
cell expansion hops rather than real distances.
[`RelationshipSelector.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/RelationshipSelector.tsx)

**State**. All fifty are listed, but only the ones in `AVAILABLE_STATE_FIPS` are selectable.
The rest render disabled, which is deliberate: it shows what the graph does not cover yet
instead of pretending those states do not exist.
[`RegionSelector.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/RegionSelector.tsx),
[`constants/regions.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/regions.ts)

**Feature Type**, shown whenever the Type is Surface Water, not behind "+ Add Filters". A tree
with two parents, Surface Water Bodies (Lake or Pond, Swamp or Marsh, Reservoir) and Streams
and Flowlines (Stream or River, Artificial Path, Canal or Ditch, Connector, Pipeline). Only one
parent can hold ticks at a time, and that parent sets the block's type. It starts with Surface
Water Bodies ticked; unticking everything shows an empty tree, and applying it empty runs
Surface Water Bodies. A whole parent is stored as no filter, so it sends the same query as an unfiltered block. NHDPlus
FTYPEs that are rare or absent in the source files (Inundation Area, Estuary, Ice Mass, Playa,
Drainageway, Underground Conduit) are left out (#70).
[`SurfaceWaterFilters.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SurfaceWaterFilters.tsx),
[`constants/featureTypes.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/featureTypes.ts)

**Well Source**. Illinois Wells and Maine Wells. Each is tied to one state, and picking a
source that contradicts the selected state raises a warning.
[`WellFilters.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/WellFilters.tsx)

**Basemap**, on the map itself. Five tile layers.
[`basemaps.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/Map/basemaps.ts)

**Export**. One entry, "As JPG".
[`ExportDropdown.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/Layout/ExportDropdown.tsx)

## The two select components

Everything on this page is one of two controls.

[`FlatSelect`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/FlatSelect/FlatSelect.tsx)
is the flat one: a searchable list rendered through a portal, single or multi select, with
support for disabled options and a loading state. It can show group headings, but they are
plain text — you cannot tick or collapse them.

Multi select lists are headed by a Select all row, which carries the number of options it
would tick, like `Select all (79)`. That number counts what the checkbox actually toggles, so
it excludes disabled options and narrows to the matches while a search term is typed. Counts
are comma formatted throughout, both on the Select all row and on individual options.

[`HierarchicalSelect`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/HierarchicalSelect/HierarchicalSelect.tsx)
is the tree: every node carries a checkbox and, if it has children, a fold arrow. Ticking a
parent takes everything under it, partial selections show an indeterminate box, and counts
roll up from the leaves.

Which one a dropdown gets comes down to whether its options have a hierarchy worth
navigating. **Industry** uses the tree because NAICS codes nest and a flat list of 5,596 is
unusable. **Material** uses it because 171 options are lopsided — 131 of them are fish
species — and being able to say "all water samples" in one click, or fold Biota away, is the
difference between usable and not. **Feature Type** uses it because its two parents are a
real choice between two kinds of water. Everything else is a flat list.

The two arrive at their tree differently. Industry has no explicit parent in the data, so
the tree is derived from NAICS code prefixes. Material passes an explicit parent, because a
material type URI says nothing about which bucket it belongs to. `buildTree` handles both.

## Filters that are not dropdowns

For completeness, the Samples filter panel also has Min and Max concentration number inputs
in ng/L, and an "Include non-detects" checkbox. None of them query anything; they are applied
inside the pipeline queries.

The non-detects checkbox is ticked by default and moves the answer more than any dropdown on
this page, because non-detects are 70 to 77% of the observations. It filters both which
sample points appear and which rows appear inside their popups. See
[Include non-detects](Samples%20Non%20Detects).
[`SampleFilters.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx)
