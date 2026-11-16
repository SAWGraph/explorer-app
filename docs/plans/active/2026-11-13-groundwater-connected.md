# Groundwater-connected: entities that sit on the same aquifer

**Status**: active
**Created**: 2026-11-13
**Completed**:

Issue: [#121](https://github.com/SAWGraph/explorer-app/issues/121). Source
question: notebook `UC1_CQ3b,5_(2026_08_25_Update).ipynb` (in the parent
`python notebooks/` folder), "What water wells in Maine are potentially
hydrologically connected to PFAS contaminated private water supply wells?"

## Problem

The app joins two blocks through one relationship (near, downstream,
upstream). It can ask "samples near aquifers" and "wells near aquifers", but
not chain them: "wells on the same aquifer as these contaminated samples". No
well or sample links to an aquifer directly. The only link is a shared S2
cell (`?s2 spatial:connectedTo ?aquifer`, see `docs/aquifer-queries.md`).

## Approach

A new relationship type, **groundwater-connected** (see `GLOSSARY.md`). The
two blocks stay as they are. The aquifer is the link, not a third block.

```
sample ──own cell──▶ GW_Aquifer ◀──own cell── well
```

### Decisions

Settled in a grilling session on 2026-11-13.

| # | Decision |
|---|---|
| 1 | A new relationship type `groundwaterConnected` between the two existing blocks. No three-block question. |
| 2 | Samples, facilities and wells can be on either side. Water bodies, streams and aquifers cannot. Build and test wells and samples first. |
| 3 | Each side reaches the aquifer through its own cell only (no one-ring widening), and the same rule applies to both sides, so swapping the sides cannot change the answer (the defect in `2026-09-19-symmetric-cell-widening.md`). |
| 4 | The link is one `gwml2:GW_Aquifer`. Sharing an aquifer system (`gwml2:gwAquiferSystemPart`) is not enough. |
| 5 | The result returns the linking aquifers, and the map outlines only those. They are context: they do not count in the result totals. |
| 6 | The sample filters stay as they are today. No forced groundwater material, and no sample point type filter (`me_egad:samplePointType`, the notebook's `PWSW`). That filter is a separate issue. |
| 7 | Each side's region applies to that side only. The aquifer has no region check and can cross county lines. |
| 8 | The link skips regional aquifers (over 1,000 cells, about 1,000 km²). The result says how many it skipped. No user setting. |
| 9 | When both sides have the same type, an entity counts only if it links to a different entity on the other side (no self-matches). |
| 10 | No aquifer type filter on the link in this issue. The `aquiferFilters` slot is there if one is needed later. |
| 11 | Wording, below. The hedge ("may share groundwater") is in the editor description only. |
| 12 | A new prebuilt question, below. |
| 13 | The linking aquifers' outlines come from the graph (`geo:hasGeometry/geo:asWKT`) by IRI, as the aquifer details step. The existing aquifer overlay keeps `aquifers.geojson` for now. |
| 14 | The aquifer popup adds one line, "Links N samples ↔ M wells". The well and sample popups do not change. |

### Wording

| Place | Text |
|---|---|
| Editor label (`RelationshipSelector.tsx`) | `Groundwater-connected to` |
| Editor description | `on the same aquifer as the feature(s) below, so they may share groundwater` |
| Step text (`RELATIONSHIP_PREPOSITION`) | `Finding wells groundwater-connected to samples` |
| Prebuilt title | `Wells Groundwater-Connected to PFOA Groundwater Contamination in Kennebec County` |

### Prebuilt question

- Block A: wells, all types, no region.
- Relationship: groundwater-connected.
- Block C: samples in Kennebec County (23011), PFOA, over 100 ng/L, material
  type Groundwater.

No region on the wells side is enough: Maine aquifers lie only in Maine, so
the link cannot reach other wells, and a state region would add a region join
for nothing.

## Measurements

All live on 2026-11-13, `federation` unless noted, hand-written SPARQL (not
yet the engine's).

**Reach rule (decision 3).** Entities that reach any aquifer:

| Reach | Sample points (ME + IL) | Maine wells (of 153,275) |
|---|---:|---:|
| Own cell | 1,390 | 20,471 (13%) |
| Own cell + one ring | 2,841 | 40,080 (26%) |

The one ring doubles both sides. 87% of Maine wells sit on no aquifer: Maine's
mapped aquifers are all sand and gravel, and most Maine wells are drilled
bedrock wells.

**Aquifer systems (decision 4, `hydrologykg`).** Maine: 906 aquifers alone in
their system, 4,066 in 591 shared systems, largest 354. Illinois: 372 alone,
2,995 in 66 shared systems, largest 2,719.

**The notebook's question (decision 6).** Kennebec, PFOA over 100 ng/L:

| Sample side | Sample points | Aquifers | Wells | Time |
|---|---:|---:|---:|---:|
| Point type PWSW (notebook) | 20 | 5 | 57 | 1.6s |
| Material Groundwater (prebuilt) | 22 | 6 | 92 | 1.5s |

In Maine, Groundwater material covers 4,472 PWSW points, 1,242 monitoring
wells (MW) and about 150 points of other types.

**Aquifer size (decision 8).** Aquifers by cell count:

| Cells | Maine | Illinois |
|---|---:|---:|
| 1 to 10 | 4,521 | 561 |
| 11 to 100 | 449 | 2,556 |
| 101 to 1,000 | 2 (max 103) | 339 |
| 1,001 to 10,000 | 0 | 11 |
| Over 10,000 | 0 | 2 (max 69,292, `ISGS-Aquifer.BR0001`, bedrock) |

All Illinois sample points on an aquifer, linked to Illinois wells (379,496 in
the state):

| Link aquifers | Sample points | Aquifers | Wells |
|---|---:|---:|---:|
| Bedrock | 54 | 2 | 240,038 |
| Sand and gravel | 52 | 12 | 158,970 |
| Coarse-grain | 73 | 73 | 62,399 |
| All, regional aquifers skipped | 62 | 78 | 52,646 (1.2s) |

The cap skips 13 Illinois aquifers (0.15% of all) and no Maine aquifer.

**Aquifer polygons (decision 13).** All 8,441 aquifers have a WKT polygon. The
prebuilt question's 6 aquifers are 67 KB in total (1.8s). Average polygon:
Maine 7.3 KB, Illinois 6.0 KB. Largest: Illinois 1.0 MB, Maine 235 KB.

**Throwaway prototype (2026-11-13).** The prebuilt question through the real
engine found the same 22 sample points, 6 aquifers and 92 wells, in 24.7s
against 1.5s for the hand-written query. Most matches sit just outside the
aquifer outlines, in edge cells (decision 3, kept after seeing the map):

| | Total | Inside an outline | Outside | Median distance outside | Max |
|---|---:|---:|---:|---:|---:|
| Wells | 83 | 11 | 72 | 0.51 km | 1.24 km |
| Sample points | 22 | 3 | 19 | 0.82 km | 1.18 km |

## Tasks

- [x] Find where the engine's 24.7s goes (counts, two discovery queries,
      details, boundaries) against the 1.5s single query. Answer: the county
      outlines. The answer itself was in at 13.7s; `GET_REGION_BOUNDARIES` for
      Maine's 16 counties ran from the start and took 24.6s on a cold cache,
      0.4s warm. Warm, the whole run took 5.9s (2026-11-16)

- [x] Run the engine's version of the prebuilt question live (rows, time,
      status) before writing templates; compare with the 22 / 6 / 92 above
- [x] Measure the regional cap two ways: a `GROUP BY ... HAVING` subquery in
      the join, and a fixed list of the 13 regional aquifer IRIs (bump
      `DATA_VERSION` on reload). Pick the faster; both must also count the
      skipped aquifers for the note
- [x] `engine/types/query.ts`: add `groundwaterConnected` to
      `SpatialRelationship['type']`
- [x] Planner: a fourth family next to near and the two traces
      (`2026-11-05-engine-redesign.md`, decision 1). Start side keeps the
      existing rank rule
- [x] Template in `engine/templates/`: both sides bind with their own
      `bindInCell`, both cells `connectedTo` one `gwml2:GW_Aquifer`, the
      regional cap, and `FILTER(?a != ?c)` when both sides have the same type
- [x] Result: the linking aquifer IRIs and the pair counts per aquifer, plus
      the skipped count. Bump `WIRE_VERSION` (`w3` to `w4`); the cache key
      already carries the relationship type (`cacheKey.ts:75`)
- [x] Aquifer details with WKT, drawn as
      outlines for this relationship only, with the "Links N samples ↔ M
      wells" popup line
- [x] Skipped-aquifer note through `errors.ts`, like the other result notes
- [x] Editor: the new option in `RelationshipSelector.tsx`; only samples,
      facilities and wells can be picked with it (a block of another type
      disables the option)
- [x] Wording: `RELATIONSHIP_PREPOSITION`, `questionGenerator.ts`
- [x] Prebuilt question in `engine/constants/prebuiltQueries.ts`, thumbnail
      (`npm run build-thumbnails`)
- [x] Tests: a `representative.ts` entry for wells and samples, facilities and
      wells, and wells and wells; re-record the golden snapshot and read its
      diff; extend the rule tests (`queryJoins`, `stepLabels`, `cacheKey`) to
      the new type; a test that swapping the blocks gives the same join; a test
      that a same-type question excludes self-matches; a test that the cap is
      in every groundwater-connected query
- [x] Fix the stale docs: `docs/aquifer-queries.md` ("No name, no label, no
      polygon geometry") and the comment on `buildAquifersByIri` in
      `engine/templates/aquifers.ts`; add the relationship to
      `docs/ARCHITECTURE.md` and `docs/SCHEMA.md`
- [ ] `npm run build`, `npm test`, `npm run lint`; a query sweep for the new
      shapes; `npm run health-check`; `npm run warm-cache` after merge

## Notes

Deferred on purpose:

- A loose option: one-ring reach and the aquifer system as the link (decisions
  3 and 4).
- A strict option: test each point against the aquifer polygon instead of its
  cells (the prototype result would shrink to 11 wells and 3 samples).
- A distance bound ("wells within X km on the same aquifer"), the better fix
  for regional aquifers than the cap.
- A sample point type filter (`PWSW`, `MW`), to match the notebook exactly.
- An aquifer type filter on the link.
- A "linked through" line on each well and sample popup (needs per-entity
  link data in the result).
- Moving the aquifer overlay from `aquifers.geojson` to the graph polygons,
  which would also fix Illinois scoping (`AquiferBoundaryLayer.tsx:53`).

## Implementation notes (2026-11-16)

Live, through the engine (`runQuestion`), the prebuilt question:

| Run | Wells | Samples | Link aquifers | Regional skipped | Time |
|---|---:|---:|---:|---:|---:|
| Cold | 92 | 22 | 6 | 0 | 24.7s (13.7s without the county outlines) |
| Warm | 92 | 22 | 6 | 0 | 5.9s |

- The regional cap is counted in the query (`REGIONAL_AQUIFER_CELLS` in
  `fusedQueries.ts`), not listed: the same time as a list of the 13 (Kennebec
  2.5s against 2.7s, Illinois 12.2s against 11.0s), and no upkeep on a data
  reload.
- The size count reads cells only (`rdf:type kwg-ont:S2Cell_Level13`), found
  in review: 16,872 county subdivision links also point at aquifers. Same rows
  after the change, live: Kennebec 92 wells, 22 samples, 6 aquifers, 0 skipped;
  Illinois 52,492 wells, the same 9 skipped. Back to back, the cells-only cap
  was no slower (Illinois regional check 9.2s against 14.2s, Kennebec wells
  1.7s against 2.0s).
- The link outlines come from a step of their own (`GET_LINK_AQUIFERS`), which
  re-derives the join like the wells details step, rather than through
  `buildAquifersByIri`: a statewide well side is too big to send as a list.
- The popup line names block C first, as decision 14 reads for the prebuilt
  question ("Links 13 samples ↔ 16 wells").
- The rule tests that loop over the shape space (`stepWaits`, `stepDivide`,
  `oneRowPerCell`, `filterSlots`) now include the 9 point-type pairs
  (`engine/tests/support/shapes.ts`). `stepLabels` and `queryJoins` keep their
  three relationships; `groundwaterConnected.test.ts` holds the step set,
  labels, symmetric join, cap, self filter and refusal rules.
- Open edge case: when every link is a regional aquifer, discovery finds
  nothing and the run ends empty, so the regional note never shows. The empty
  message could say so.
- Thumbnail rendered (114 points). Still to do: a query sweep for the new
  shapes, `npm run health-check`, `npm run warm-cache` after merge.

Caveat for the wording and the wiki: a match means the two entities sit on
the same mapped aquifer, not that water flows between them. Two wells on one
aquifer can draw from layers that do not mix.
