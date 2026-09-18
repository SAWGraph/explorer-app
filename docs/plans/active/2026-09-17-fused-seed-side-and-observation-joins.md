# Seed the fused trace from the constrained side, and only join the observation detail a filter needs

**Status**: active
**Created**: 2026-09-17

## Problem

Two independent defects in `src/engine/templates/fusedQueries.ts`, both found while
running "What facilities are upstream from PFOS samples in York and Cumberland
counties (Maine)?" (facilities block empty, samples block PFOS + ME + two counties,
include non-detects on).

**P1, seed side.** `buildFusedWhereBody` always emits the anchor block first, and
for an upstream question the planner puts block A on the anchor side
(`planner.ts:215`). Block A here has no region and no industry filter, so the query
starts from every facility in the graph and traces the national flowline network to
look for samples in two Maine counties. Measured: the pipeline fails at step 1 after
116.3s with `500 out-of-memory` ("tried to allocate 204.8 MB, only 159.3 MB
available"), retries as two county slices, and both slices fail the same way.
Wrapping the constrained side (samples + region + substance) in a sub-SELECT and
joining outward returns the answer in 18.6s cold. Full pipeline with the fix:
100.0s cold, 8.9s warm, complete.

**P2, observation joins.** `bindEntityInCell` returns the full observation chain for
a samples block whenever `hasSampleFilters` is true, regardless of which filters are
set: `analyzedSample`, `hasResult`, `sampleOfMaterialType`, the material label, and
`coso:measurementUnit`. A substance-only filter needs two triples. Worse, the unit
join is a silent filter: a non-detect has no `coso:measurementUnit` (documented at
`samples.ts:11`, and the by-IRI templates already gate it behind `needsUnitJoin`), so
fused discovery drops non-detects even when the user asked to include them. Measured
on Cumberland PFOS observations: 1,688 observation rows, 914 with a unit, 774
non-detect with no unit. At sample-point level on a pinned comparison case
(Cumberland, NAICS 5622) the shipped query returns 23 sample points and 13
facilities; without the unneeded joins it returns 32 and 15, a superset with zero
losses either way.

## Approach

**P1: write the constrained side first in the flat body. No sub-SELECT.**

`buildFusedWhereBody` emits the anchor block, then the trace, then the target block.
When the anchor side has no region, no block filters and no IRI pin and the target
side has at least one of those, emit the target block, then the trace, then the
anchor block. Same triples, same variables, different textual order. Nothing else
changes: no sub-SELECT, no new option on the builders, no executor retry.

Two earlier designs were measured and rejected, in this order:

1. *Wrap the constrained side in a sub-SELECT.* Rescues 5 shapes, breaks 7 that work
   today, all `500 out-of-memory`. A sub-SELECT is an optimiser barrier in QLever: it
   has to be materialised before anything joins to it and the planner cannot reorder
   across it, so it forces one plan and forbids every other.
2. *Keep the sub-SELECT but project only the distinct cells, re-joining the target
   entity last.* Same 7 shapes still fail, three of them degrading from OOM into 60s
   timeouts. Entity multiplicity through the trace was not the cause either.

What the measurements actually point at is that **textual triple order changes
QLever's plan for these bodies**. They run 12 to 14 triples, past the point where the
planner searches join orders exhaustively, so it falls back on something that follows
the query text. Writing the unconstrained side first is what produces the bad plan;
moving the constrained side to the top is the entire fix.

Volume is not the discriminator, which is worth recording so nobody re-derives it.
Rows materialised through the trace, Cumberland seeds: samples + PFOS 872,385;
facilities 681,299; wells 4,183,432. The samples seed materialises more than the
facilities seed and succeeds where it fails.

**P2: emit only the joins the active filters read.**

Replace the all-or-nothing `hasSampleFilters` gate with a per-filter requirement set
for the IRI-finding queries:

| filter set | joins needed |
| --- | --- |
| `substances` | `?observation coso:observedAtSamplePoint`, `coso:ofDSSToxSubstance` |
| `materialTypes` | the above + `coso:analyzedSample`, `coso:sampleOfMaterialType` |
| `minConcentration` / `maxConcentration` | + `coso:hasResult`, `qudt:quantityValue`, `coso:measurementUnit` |
| `includeNondetects: false` | + `coso:hasResult` and the non-detect binds |
| none | no observation joins (today's `sampleObservations: false`) |

The material *label* join (`?matType rdfs:label`) is never needed for filtering, only
for display, so it goes in every discovery case. Hydrate queries keep the full block:
they project `?matTypeLabel`, `?unit` and `?result_value`.

While in there, fix the adjacent `near` wart this exposed: `buildFusedNearQuery`
passes `anchorSampleObservations: opts.project !== 'anchor'`, so the *non-projected*
samples side keeps the whole chain even with zero filters. Verified: anchor samples
with no filters, `project: 'target'` emits the chain and the unit join. The same
per-filter rule removes it.

## Tasks

- [x] `fusedQueries.ts`: `sideIsConstrained` (region / block filters / IRI pin per side) and the target-first hydrology body when the anchor is unconstrained
- [x] `fusedQueries.ts`: replace the `hasSampleFilters` gate in `bindEntityInCell` with `sampleJoinsNeeded`, per-filter; hydrate callers keep the full block
- [x] `buildFusedNearQuery`: drop the `project !== side` heuristic, pass `false` for both sides
- [x] `buildEntityProbeQuery`: same lean bind, so the probe sees what discovery sees (the probe list becomes the chunk membership)
- [x] `buildSampleDetailByIriQuery`: the unit join moved after `resultValueClauses()` with the symbol lookup nested inside, so popups stop hiding non-detects
- [x] `scripts/check-query-joins.mts` (265 checks): join order across all 72 hydrology shapes x 2 projections, the pinned and distance-bounded exceptions, the per-filter join rule on hydrology and near, and that no prebuilt reorders. Wired into `package.json` and `.github/workflows/checks.yml`
- [x] `docs/DEBUGGING.md`: both bugs, with the measurements and the two rejected designs
- [ ] re-run `npm run health-check` and record the row-count movement in `docs/health/STATUS.md`
- [ ] `npm run query-matrix` sweep, then `--index`, to price both fixes across the shape space
- [ ] update `docs/QUERY-MATRIX.md` (error catalogue: the OOM that this removes)
- [ ] decide on the retry variant below

## Verified after implementing (2026-09-17)

`check-trace-direction` (2,068 checks), `check-step-labels` (651),
`check-cache-key` (19), `check-substance-labels` (13) and the new
`check-query-joins` (265) all pass. `tsc -b` clean; `npm run lint` still reports
the same 15 pre-existing component errors as the unmodified tree.

Live, through the real builder, single-county spot checks matched the sweep
exactly where the sweep was comparable: `facilities <- facilities` 4 rows,
`waterBodies <- facilities` 146, `wells <- aquifers` 7,434. The two samples
shapes returned 307 and 351 rather than the sweep's 339 and 384, which is P2
working: sweep 2's flat variant predated it and dropped the substance filter
entirely, so its counts were unfiltered. 307 and 351 match sweep 1, which
applied the filter.

Popup detail on sample point 64220: **3,334 rows, 2,860 non-detect, 8.8s**, up
from 474 rows.

**The screenshot question now answers, but not quickly.** End to end through the
pipeline: **245.5s, status success**, where before it was a hard error. It is
slow because the two-county query still exceeds the budget as one flat request
(62s timeout, reproducible), so the executor rescues it by slicing into the two
counties, and each county takes 15-16s per projection. The slices now succeed,
which is why the run completes at all; before the fix they inherited the
anchor-first order and failed too.

## The retry variant, measured and not implemented

The sub-SELECT was rejected as a *default* because it breaks 7 shapes. As a
*retry after a splittable failure* it cannot regress anything that succeeds, and
on this question it is worth a great deal:

| Query | Time | Rows |
| --- | --- | --- |
| flat reorder, both counties | 62.0s timeout | fails |
| sub-SELECT, both counties | **7.3s** | 503 |
| flat reorder, Cumberland only | 15.2s | 307 |
| sub-SELECT, Cumberland only | **1.4s** | 307 |

That is 245.5s of slice-and-retry versus one 7.3s request. It needs a
`buildRetryQuery` hook on `PipelineStep` and one branch in the executor's
failure path, ahead of `chooseAxis`. Deliberately left out of this change: it is
a new execution mechanism rather than a template fix, and it should be measured
across the shape space on its own.

## Measured regression sweep (2026-09-17)

All 36 hydrology entity-type pairs, two configurations each (region + filters on the
target side with the anchor wide open, and the mirror), `project: 'target'`,
Cumberland County, unbounded trace. Shipped query versus proposed query, comparing
IRI sets and time. 72 comparisons per sweep, run twice: once for the rejected
sub-SELECT design, once for the flat reorder that this plan now proposes.

| | sub-SELECT (rejected) | flat reorder (proposed) |
| --- | ---: | ---: |
| Shipped succeeded | 66 | 66 |
| Proposed succeeded | 70 | **71** |
| Rescues (shipped failed, proposed worked) | 5 | **5** |
| Regressions (shipped worked, proposed failed) | **7** | **0** |
| Comparisons that lost a row | 0 | **0** |
| Median time change where both succeed | +48% | +9% |

The +48% on the rejected design is inflated: several of its "wins" are shapes it then
broke. The flat reorder is faster in 50 of 66 comparable runs.

The 5 rescues are the same in both sweeps, and they are the screenshot shape:
`samples <- facilities / waterBodies / wells / aquifers / streams [target-scoped]`.
Shipped OOMs or times out at 28.1s to 69.3s; the flat reorder answers in 7.9s to
12.8s.

One shape fails both ways and is untouched by this plan: `wells <- wells
[target-scoped]`, ~80s timeout on both.

The 7 shapes the sub-SELECT broke, all of which the flat reorder leaves working with
identical row sets: `facilities <- facilities`, `facilities <- aquifers`, `facilities
<- streams`, `waterBodies <- facilities`, `waterBodies <- aquifers`, `wells <-
facilities`, `wells <- aquifers`.

Sweep 1 also confirmed P2 independently: every `X <- samples [anchor-scoped]` row
gained rows and lost none (+599 wells, +129 streams, +42 samples, +19 facilities,
+13 water bodies, +13 aquifers), which is the recovered non-detects.

**What the sweeps do not cover**, and what the tasks above therefore still call for:
one run per combination against a memory-pressured endpoint, a single county scope,
one filter configuration, `project: 'target'` only, and no `maxDistanceKm`. Several
passing shapes land at 15-25s, close enough to the 30s ceiling that load decides the
outcome. Distance-bounded traces route through `boundedTrace`, which embeds the body
a second time and was not measured here.

## Impact on other query shapes

**P1 reaches 72 of the 108 shapes, but reorders almost none of them in practice.**
The edit is in the `mode !== 'near'` branch, shared by `buildFusedHydrologyQuery`,
`buildFusedWellQuery` and (via the duplicated seed) `boundedTrace`, so it covers all
36 downstream and all 36 upstream shapes including the well and flowline layers. The
36 `near` shapes take the other branch and are untouched. Whether a given question
actually changes depends on its filters, not its shape: I evaluated all eight
prebuilt dashboard questions and **none of them reorder**, because every one has a
constrained anchor (`facilities` with an industry filter, or a county). The reorder
fires for user-built questions that leave one side wide open, which is exactly the
screenshot case.

**P2 reaches every shape with samples on a filtered side, `near` included.**
`bindEntityInCell` is shared by all three builders. Of the 108 shapes, 33 have
samples on at least one side. Row counts move upward wherever a substance-only or
material-only filter is set, because those questions stop dropping non-detects. Of
the prebuilt questions only `facilities-upstream-pfhpa-gw-cumberland` carries sample
filters, and it sets a 10-1000 ng/L range, so it keeps the unit join and its counts
should not move at all. The `near` cleanup was measured on
`samples-near-agchem-maine`: 5 facilities shipped, 5 facilities trimmed, 8.05s vs
7.74s, so no movement there either.

**P2 does not reintroduce the OOM the old note feared.** The `ponytail` comment at
`fusedQueries.ts:90` says dropping the unit join "triples the matched rows and the
endpoint OOMs on statewide pipelines". Re-measured on a statewide Maine PFOS
downstream question: shipped asks for 825.6 MB (project=target) / 712.1 MB
(project=anchor) and OOMs; trimmed asks for 409.6 MB and still OOMs. Trimming
*lowers* the peak allocation. The statewide shape fails either way, which is a
chunking problem, not this one. The comment should be replaced with these numbers.

**Chunking behaviour is unchanged.** Both fixes are template-level. `chooseAxis`,
`halve` and the step budget keep working as they do now; P1 only makes the whole
query succeed more often, so slicing runs less.

## Are we making the P2 mistake anywhere else?

Audited every site that touches the sample observation chain.

1. **`downstreamSamples.ts:97`, `buildSampleDetailByIriQuery` (popup detail): yes,
   same bug, larger effect.** `?result coso:measurementUnit ?unit .` is required, so
   the observation table in a sample popup silently omits every non-detect. Measured
   on `me-egad-data#d.egad.samplePoint.64220`: **474 rows as shipped, 3,334 rows with
   the unit join made optional, of which 2,860 are non-detects**. The naive fix
   (`OPTIONAL { ?result coso:measurementUnit ?unit }` in place) OOMs at 819.7 MB.
   Moving the join after `resultValueClauses()` and nesting the symbol lookup inside
   it works at the same cost as today: 6.88s vs 6.59s, 3,334 rows. Worth doing in
   this plan or immediately after it.
2. **`downstreamSamples.ts:40`, `buildSampleRetrievalByIriQuery` (sample hydration):
   correct already.** Gated behind `needsUnitJoin(filters)`. Its other required joins
   are legitimate: hydration lost exactly 1 of 547 discovered sample points in the
   measured run, and that point has no `geo:asWKT` at all, so it cannot be drawn.
3. **`regions.ts` discovery queries (substance, material, county, industry dropdowns):
   clean.** None of them join `coso:measurementUnit` or `coso:hasResult`; the
   substance and material counts shown in the dropdowns are not deflated.
4. **`hydrate.ts` facility / water body / stream / aquifer queries: no observation
   joins.** `buildFacilitiesByIri` does require `rdfs:label` on both the facility and
   its industry code, which would drop an unlabelled facility; not observed in this
   run and out of scope here.

## The same class of bug elsewhere (measured 2026-09-17)

Beyond the observation chain, every required (non-`OPTIONAL`) join in the templates
was checked against live per-entity coverage in Cumberland County and statewide
Maine. Three findings, one of them larger than P2.

**1. The facility layer shows about a quarter of the facilities it could.**
`buildFacilitiesByIri` (`hydrate.ts:15`) and the facilities branch of
`bindEntityInCell` both require `fio:ofIndustry` and `?industryCode a
naics:NAICS-IndustryCode`, whether or not the user picked an industry. Maine, cells
to layer:

| Required joins, cumulative | Facilities |
| --- | ---: |
| `fio:Facility` in ME S2 cells | 11,954 |
| + `geo:asWKT` (legitimate, cannot map without it) | 10,164 |
| + `rdfs:label` | 10,164 |
| + `fio:ofIndustry` | 3,601 |
| + `?ic a naics:NAICS-IndustryCode` | 2,718 |
| + `?ic rdfs:label` (what we ship) | 2,718 |

So the industry-code requirement costs **7,446 of 10,164 mappable Maine facilities,
73%**. Cumberland alone: 2,595 in cells, 2,203 mappable, 603 shipped. The excluded
ones are not junk records: sampling them returns SEBAGO LAKE WATER TREATMENT
FACILITY, AMERICOLD LOGISTICS PLANT # 80573, KOCH MATERIALS. A water treatment plant
is exactly what a PFAS question is looking for.

Both label joins are free (100% of geometry-carrying facilities have them), so they
are waste rather than a filter, and the NAICS type assertion costs a further 883 on
its own. Fixing this is a bigger behaviour change than P2 and deserves its own plan,
but it is the same mistake: a join added for display or for a filter that is not set.

**2. `?s2cell` is projected by three hydrate queries and read by nothing.**
`buildFacilitiesByIri`, `buildSampleRetrievalByIriQuery` and `buildWaterBodiesByIri`
all select it; grep finds no consumer outside `templates/` and `engine/scope.ts`.
Its join is required, so it filters, and because it appears in `DISTINCT` /
`GROUP BY`, an entity touching several cells is returned several times.

**3. Two suspects came back clean, worth recording so nobody re-checks them.**
Flowline `nhdplusv2:hasFTYPE` and geometry are at **434,501 of 434,501** graph-wide,
so requiring them costs nothing. Sample-side labels are complete too: of 576
Cumberland sample points, 575 have geometry, 571 have an observation, and all 571
have the lab-sample label, material type, material label and `coso:fromSamplePoint`
that the hydrate and detail queries require. The one sample point the pipeline drops
has no `geo:asWKT` at all.

## Notes

- Equivalence evidence for P1: on a pinned case the current template survives
  (Cumberland, NAICS 5622), current and reordered return identical IRI sets both ways
  when the observation joins are held constant (23 samples / 13 facilities, zero
  diff). That is the check to re-run after implementing, since it separates P1 from
  P2.
- Endpoint capacity is volatile. One repeat of the two-county query OOM'd trying to
  allocate 1.6 MB, and York alone measured 9.5s standalone but 2.4s after Cumberland
  warmed the shared sub-results. Treat single cold timings as plus or minus 10s, and
  re-measure warm and cold separately.
- The screenshot question returns 3,013 facilities for two counties because block A
  has no industry filter. Correct, but it is also 4 flowline batches and 37s of the
  100s cold run. Not part of this plan.
