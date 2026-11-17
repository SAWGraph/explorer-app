# Option counts

Not a dropdown of its own. These are the numbers next to each option in the
[Industry](Dropdowns%20Industry), Feature Type, Aquifer Type and Well classification
dropdowns, and they all come from one query shape, so they share this page. (Substance and
Material count observations with their own queries, on their own pages.)

![Industry counts](images/dropdown_industry_counts.png)

## What it does

Each option shows how many entities picking it would find. With a state or counties
selected, the count is for that region. With none, it is nationwide. An option the region
has none of shows no number and is dimmed in the tree dropdowns.

A count previews the answer, so it has to find exactly what the run finds. It is the run's
own count step (`buildEntityCountQuery`, the step that opens every run) with the filter left
open and grouped by option. That matters most for types whose region check looks at the
entity as well as its S2 cell. Wells in Hancock County, Maine (2026-11-17):

| Region check | Wells |
|---|---|
| Subdivision link only | 11,644 |
| S2 cell only | 7,428 |
| Both, as the run checks wells | 7,296 |

A count built any other way would promise one number and the map would show another.

Tree dropdowns roll counts up: a parent shows the sum of its children, computed on the
client by `rollupCounts()`. That is sound because the children partition the parent (an
FTYPE value or a NAICS code belongs to one parent only).

There is **no fallback**. A failed count leaves the dropdown working, with no numbers.

## The SPARQL query

Endpoint `federation` for every type. Built by `buildOptionCountQuery(type, regionCodes)`.
Industry in Hancock County:

```sparql
SELECT ?option (COUNT(DISTINCT ?facilityP) AS ?count) WHERE {
  ?s2probe rdf:type kwg-ont:S2Cell_Level13 .
  ?s2probe spatial:connectedTo kwgr:administrativeRegion.USA.23009 .
  ?facilityP spatial:connectedTo ?_regionLinkP .
  ?_regionLinkP kwg-ont:administrativePartOf* kwgr:administrativeRegion.USA.23009 .
  ?s2probe kwg-ont:sfContains ?facilityP .
  ?facilityP fio:ofIndustry ?option .
  ?option a naics:NAICS-IndustryCode .
} GROUP BY ?option
```

* The three lines after the S2 cell line are the run's region check for this type, taken from
  the same code (`regionClause` and the type's `regionCheck`). With no region they are
  absent and the count is nationwide.
* The last lines are what the type binds when one option is picked, with the option left
  open in `?option`. Each type's module in `engine/entities/` supplies it as
  `options.bind`:

| Dropdown | Type | `?option` is |
|---|---|---|
| Industry | facilities | `fio:ofIndustry`, a NAICS code IRI. No geometry check, as when an industry is picked |
| Feature Type | waterBodies, streams | `nhdplusv2:hasFTYPE`, e.g. `"LakePond"` |
| Aquifer Type | aquifers | `saw_water:aquiferType`, a raw value such as `"sand_gravel"` |
| Well classification | wells | Illinois `wellPurpose`, Maine `ofWellType` or `hasUse`, an IRI |

### What comes back, and how it is keyed

One row per option, `?option` and `?count`. `optionCountsFrom()` keys them the way each
dropdown keys its options, using the type's `options.key`:

* Industry: the IRI is cut to the bare code (`NAICS-111110` to `111110`).
* Aquifer Type: raw values are summed into the two options through `AQUIFER_TYPE_VALUES`.
  Sand & gravel covers `sand and gravel`, `coarse-grain_materials` and `sand_gravel`.
* Well classification: keyed by IRI. An Illinois entry stands for an active and a plugged
  purpose, so `wellTokenCount()` sums the IRIs in the entry's token.
* Feature Type: the FTYPE value as is.

### Measured

Live, 2026-11-17, first run unless noted:

| Region | Feature Type (water bodies / flowlines) | Aquifer Type | Wells | Industry |
|---|---|---|---|---|
| Nationwide | 0.33s / 0.14s | 0.22s | 0.22s | 0.15s |
| Maine | 0.31s / 0.17s | 0.40s | 0.43s | 1.42s |
| Hancock | 0.18s / 0.24s | 0.36s | 0.43s | 0.35s |
| Illinois | 0.17s / 0.54s | 30.1s cold, 0.46s rerun | 0.66s | 1.74s |

Illinois aquifers are slow cold because the subdivision check touches every Illinois
subdivision an aquifer overlaps. The run's own count step for the same block took 25.8s
cold.

Sample counts from the same run: nationwide Lake / Pond 60,083, Stream / River 353,003;
Hancock Lake / Pond 348, sand & gravel aquifers 181, Maine bedrock wells 7,236.

## How it is wired up

* `useOptionCounts(type, region)` in `ui/hooks/useDiscoveryQueries.ts` runs the query and
  returns `Record<string, number>`. Cached under `['optionCounts', type, <region key>]` with
  `staleTime: Infinity`, so each type and region is fetched once a session. The region key
  sorts the county codes, so the same counties in another order reuse the cache.
* It runs when the dropdown mounts: Feature Type as soon as the Type is Surface Water (both
  water bodies and flowlines are counted, since the tree holds both), the others once
  "+ Add Filters" is open.
* `FacilityFilters` and `SurfaceWaterFilters` pass the counts to `HierarchicalSelect` as its
  `counts` prop. `AquiferFilters` and `WellFilters` put them in the label with `withCount()`.
* Well classification lists its options from `hydrologykg` with counts for the whole of
  Illinois or Maine. Those are not shown; the region counts replace them.

## If it looks wrong

**No numbers anywhere.** The count query failed, or has not come back yet. Check the
network tab for a `federation` request with `GROUP BY ?option`.

**Numbers on some options but not others.** The region has none of those. Zero is not
returned, so nothing shows.

**A count does not match the map.** Compare the region lines of the count with the run's
count step for the same block. `engine/tests/optionCounts.test.ts` asserts they are the same
for every type and region form.

**Numbers vanish after switching from a state to counties.** New cache key, new fetch.

## See also

* [Dropdowns Industry](Dropdowns%20Industry), the tree these numbers decorate
* [Dropdowns](Dropdowns), the index of all filter controls
