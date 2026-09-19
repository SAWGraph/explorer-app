# Apply the one-cell widening to both sides of a hydrology trace, not whichever side is written second

**Status**: draft
**Created**: 2026-09-19

## Problem

Entities link to S2 Level-13 cells (~1 km square). Flowlines link to cells. To
connect a facility or a sample to the river network, a flowline has to be in
that entity's cell. Frequently there is none: the sample sits 400 m from the
river, on the far side of a cell boundary.

`buildFusedWhereBody` papers over this with a one-ring expansion,
`kwg-ont:sfTouches | owl:sameAs`. The defect is that it applies the expansion to
**exactly one side**, and which side is an artefact of query construction rather
than a modelling decision. Whichever side is not widened silently loses every
entity whose own cell happens to contain no flowline.

Measured in York County (federation, 2026-09-19):

| Side | Total | Flowline in own cell | Within one ring | Lost if not widened |
| --- | ---: | ---: | ---: | ---: |
| PFOS sample points | 361 | 282 (78%) | 360 (99.7%) | **78 (22%)** |
| Facilities | 1,639 | 1,343 (82%) | 1,632 (99.6%) | **289 (18%)** |

So roughly one entity in five, on each side, is invisible to the trace without
the expansion. The gap is about the same size on both sides, which is why the
choice of side moves the answer so hard.

Measured on "What facilities are upstream from PFOS samples?" (block A
facilities, unconstrained; block C samples, PFOS, York County ME), with the
observation chain trimmed on both variants so the non-detect bug of
`2026-09-17-fused-seed-side-and-observation-joins.md` is not confounding it:

| Variant | Sample points | Facilities |
| --- | ---: | ---: |
| Widen the sample side | **324** | 1,060 |
| Widen the facility side (shipped) | 200 | **1,497** |
| Union of the two | **330** | **1,507** |

Each variant rescues its own widened side and drops about a fifth of the other.

The sample-side variant is the form the project's PI independently arrived at
while trying to fix an unrelated symptom, so this is not a hypothetical
preference: two people writing the same query reached for the expansion on
different sides, which is the clearest evidence that the current placement is
undocumented and accidental.

## What the missing data actually is

Of the 130 sample points the shipped query drops:

| | Extra 130 | Shipped 200 |
| --- | ---: | ---: |
| Points with quantified PFOS detections | **82** | 132 |
| Detect observations | **139** | 370 |
| Points with non-detects | 58 | n/a |
| Max concentration | 2,200 ng/L | 7,400 ng/L |

Sample points carrying a confirmed PFOS detection go from **132 to 214, up
62%**. The dropped points do not hold the single highest reading, but 2,200
ng/L is roughly 110x Maine's 20 ng/L interim drinking water standard, so these
are not marginal traces.

On the facility side the union adds only 10, because that side is already the
widened one. Effectively all of the recovery is on samples.

Worth stating plainly for review: the 1 km approximation is **already
accepted** on the facility side. Applying it to the sample side introduces no
new assumption, it applies the existing one consistently.

## Approach

Run both variants and union the results. This is an **executor** change, not a
template fix: the SPARQL text of each variant already works, what is missing is
a pipeline that issues both and merges.

The executor already merges slice results as a set, deduping on
`JSON.stringify(row)` (`src/engine/scope.ts`), so the merge path exists. What is
new is issuing a second variant of the same step deliberately rather than as a
failure retry.

Sketch, to be firmed up during implementation:

- `buildFusedWhereBody` takes a `widen: 'anchor' | 'target'` option. Default
  `'anchor'`, which is today's behaviour, so nothing moves until the executor
  asks for the second form.
- `PipelineStep` gains a way to declare a second query variant for the same
  step, distinct from `initialScopes` (which splits one query) and from the
  deferred `buildRetryQuery` hook (which replaces a failed query).
- The executor issues both, unions the row sets, and reports one step.

## Tasks

1. Add the `widen` option to `buildFusedWhereBody` and thread it through
   `buildFusedHydrologyQuery` and `buildFusedWellQuery`. Default preserves
   current output; assert that in `scripts/check-query-joins.mts`.
2. Decide the variant mechanism on `PipelineStep` and whether it shares
   machinery with the deferred retry hook. See "Sequencing" below.
3. Executor: issue both variants, union, single step report. Partial failure of
   one variant should degrade to the other's rows rather than failing the step,
   matching how the flowline layer is already `optional`.
4. Extend `scripts/check-flowline-scope.mts` or add a sibling check asserting
   both variants are emitted for all 72 hydrology shapes.
5. Re-run `npm run query-matrix` in engine mode and commit a dated CSV. Counts
   will move upward across hydrology shapes; the sweep is how that is recorded
   rather than discovered later.
6. Update `docs/QUERY-MATRIX.md` Part 3.2/3.3 costs, and `docs/SCHEMA.md` with
   the cell-coverage numbers above, which are not currently written down
   anywhere.

## Impact on other query shapes

**72 hydrology shapes. Zero `near` shapes.** Verified by building
`FIND_TARGET_IRIS` for all 108 shapes and grepping the emitted SPARQL: all 72
downstream/upstream shapes emit
`kwg-ont:sfTouches | owl:sameAs ?s2neighbor`, none of the 36 `near` shapes do.
`near` uses the explicit user-chosen hop count (`neighborPath`), a different
mechanism that is not affected.

Counts move **upward only** on the affected shapes, the same direction and for
the same class of reason as the non-detect fix in
`2026-09-17-fused-seed-side-and-observation-joins.md`. Dashboard and prebuilt
numbers will change. That is the fix landing, not a new defect.

## Cost

Three runs of each query, warm endpoint, federation:

| Query | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Shipped, samples | 30.4s | 26.6s | 15.1s |
| Shipped, facilities | 15.4s | 14.4s | 18.1s |
| Sample-widened, samples | 19.2s | **1.4s** | **1.3s** |
| Sample-widened, facilities | 2.3s | **1.2s** | **1.4s** |

Added cost is roughly **2 to 3 seconds**, not double, because the second
variant caches and the shipped one does not. QLever caches result sets up to a
size limit and the shipped form's intermediates appear to exceed it. That
pattern held across three runs of four queries but has not been confirmed
against QLever's cache configuration, so it should not be relied on until
someone checks it deliberately.

## Rejected: widen both sides inside one query

This is the theoretically correct form and it does not run. Two formulations
tried on the York question, both against federation:

1. Flat, expansion on both sides in one body: `500`, "tried to allocate 2.6 GB,
   but only 2.3 GB were available". The facility projection separately timed out
   on "Join on ?s2flcell".
2. Target cell set materialised first in a `SELECT DISTINCT` sub-SELECT, then
   expanded outward: same 2.6 GB allocation failure at 21s.

The cell-by-flowline join is what blows up, and restructuring the query text
does not avoid it. This is why the approach above is a union of two queries
rather than one correct query.

## Open questions

1. **The union is an approximation.** It misses pairs where the sample *and*
   the facility both need widening simultaneously. If the two are independent
   that is roughly 4% of pairs, but this is an estimate and it **cannot be
   validated**, because the true both-sides query does not run. Whether that is
   acceptable is a call for the PI, not the engine.
2. **Is one ring the right radius?** Nothing measured justifies one hop over
   two. One ring reaches 99.7% of samples and 99.6% of facilities in York, so
   the marginal return looks small, but that is one county.
3. **The real fix may be upstream of the app.** Precomputing an
   entity-to-nearest-flowline link in the graph would remove the cell-ring
   guessing entirely and be exact rather than a 1 km approximation. That is a
   graph-build change and a conversation with whoever maintains it, but it would
   retire this plan rather than refine it.

## Sequencing

This is the second executor change queued against the same code path. The other
is the retry hook in
`2026-09-17-fused-seed-side-and-observation-joins.md` ("The retry variant,
measured and not implemented"), which needs `buildRetryQuery` on `PipelineStep`
and one branch in the executor's failure path.

Both add a second query for one step. They should be designed together so the
codebase gets one mechanism rather than two similar ones, even if they ship
separately.

Prerequisite: PR #55 (seed side and observation joins) and PR #56 (flowline
layer bounded at both ends) should merge first. The measurements above were all
taken on top of both.

## Notes

All figures measured against `https://apps.okn.us/federation/sparql` on
2026-09-19, on the branch carrying #55 and #56.

Two measurement traps hit while producing these numbers, both worth knowing
before re-running any of this: QLever returned wrong results for nested
`OPTIONAL` blocks containing a `BIND` (a detect count came back 0 alongside a
non-zero `MAX` over the same variable), and it silently under-reported on an
`OPTIONAL` used to test predicate coverage. Every figure here was re-derived
with flat, separate `COUNT` queries. The same trap is already recorded against
aggregates over `UNION` at `fusedQueries.ts:222`.
