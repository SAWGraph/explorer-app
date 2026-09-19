# Include non-detects

A checkbox in the Samples filter panel. Ticked by default. It decides whether the answer
counts clean results as well as contaminated ones, and it moves the numbers more than any
other filter on the page, because **non-detects are most of the data**.

## What a non-detect is

A non-detect is a measurement, not a gap. The lab tested for the substance and found less
than it is able to see. The record carries the detection limits instead of a value:

| | A detect | A non-detect |
| --- | --- | --- |
| `coso:measurementUnit` | `NanoGM-PER-L` | **absent** |
| numeric value | `0.632` | absent |
| `methodDetectionLimit` | `0.486 ng/L` | `0.449 ng/L` |
| `reportingLimit` | `1.93 ng/L` | `1.78 ng/L` |
| typed `coso:NonDetectQuantityValue` | no | yes |

The missing unit is the important row. There is nothing to put a unit on, because no
quantity was measured. That absence used to delete the record from every query. See
[Debugging](https://github.com/SAWGraph/explorer-app/blob/main/docs/DEBUGGING.md),
2026-09-17.

How common they are, measured on `federation`:

| Scope | Detects | Non-detects | Non-detect share |
| --- | ---: | ---: | ---: |
| York County, all substances | 7,110 | 16,420 | **70%** |
| Maine, all substances | 134,572 | 453,476 | **77%** |

## What the checkbox does

It filters at **two** levels, and both matter.

1. **Which sample points appear on the map.** A point survives only if it has at least one
   detection left.
2. **Which rows appear inside a popup.** Points that survive still lose their non-detect
   rows.

York County, no substance selected:

| | Ticked (default) | Unticked |
| --- | ---: | ---: |
| Sample points on the map | **451** | **367** |
| Observations in popups | **23,530** | **7,110** |
| Points with at least one detect | 451 includes all 367 | 367 |
| Points where everything came back clean | 70 shown | dropped |
| Points with no measurements in the graph | 14 shown | dropped |
| Non-detect readings | 16,420 shown | none shown |

The second row is the one people miss. The 367 surviving points hold 21,822 observations
between them, but unticking shows only the 7,110 detects among those. A well with 30
readings of which 2 were detections shows 2 rows, not 30.

With a substance selected the same thing happens inside that substance. York County PFOS:
361 points ticked, 230 unticked.

## What a dot on the map means

This is the part worth saying out loud, because the two readings of the map are different
claims:

* **Ticked**: a dot means *someone sampled here*.
* **Unticked**: a dot means *PFAS was found here*.

The misleading part is the absence of a dot. With the box unticked, 70 York County
locations that were tested and came back clean look exactly like ground nobody ever
visited. For a contamination map that is usually the wrong default, which is why the box
starts ticked.

## Every sample point, classified

Mutually exclusive, York County, all substances:

| State | Points | In the answer when unticked? |
| --- | ---: | --- |
| No measurements in the graph at all | 14 | no |
| Tested, everything was a non-detect | 70 | no |
| Mixed: some detects, some non-detects | 366 | yes |
| Only detects | 1 | yes |
| **Total** | **451** | 367 |

The 14 with no measurements are real registered locations, not bad rows. They are all soil
sampling points (`SB-*`, `SS-*`, `YO-*` in EGAD) with coordinates, a parent site and a
feature type of `SOIL AUGER`, whose lab results are not in the graph. At their parent site
every drinking-water and monitoring well has 24 to 30 observations and every soil point has
zero, so the gap is systematic rather than random. They currently render with an empty
popup.

There is a fourth possible result state in the code, `"non-quantified"`, a result that is
neither a number nor typed as a non-detect. It is defensive: zero occurrences in York
County and zero across Maine.

## Opening the filter panel changes nothing

The checkbox only exists once **+ Add Filters** is expanded, but expanding it is a
display-only action:

```tsx
<button className="btn-link" onClick={() => setShowFilters(true)}>
  + Add Filters
</button>
```

`setShowFilters` is local component state and never touches the question. The box draws as
ticked because it reads `value?.includeNondetects !== false`, and with no filters set at all
that is `true`. The emitted SPARQL is byte-identical before and after, and **Apply** stays
disabled.

## The SPARQL

Ticked, with no other sample filter, the whole samples block is two lines. Nothing asks
about measurements, so nothing can filter on them:

```sparql
?spC rdf:type coso:SamplePoint ;
     spatial:connectedTo ?s2target .
```

Unticked adds the result chain and one explicit filter:

```sparql
?observationC coso:observedAtSamplePoint ?spC .
?observationC coso:hasResult ?resultC .
OPTIONAL { ?resultC qudt:quantityValue/qudt:numericValue ?numericResultC }
OPTIONAL { ?resultC qudt:quantityValue ?_qvC .
           ?_qvC rdf:type coso:NonDetectQuantityValue .
           BIND(true AS ?nonDetectC) }
BIND(COALESCE(STR(?numericResultC),
       IF(BOUND(?nonDetectC), "non-detect", "non-quantified")) AS ?result_valueC)
FILTER(BOUND(?numericResultC))
```

`FILTER(BOUND(?numericResultC))` is the exclusion. Note it is written as an explicit filter
rather than achieved by requiring a field non-detects lack, which is what the old code did
by accident.

Two details that bite anyone writing these by hand:

* **Do not use `coso:measurementValue`.** It is multi-valued on non-detects, returning both
  `"non-detect"` and `"non-quantified"`, which duplicates every non-detect row and makes
  `MAX()` return a string. The app derives its displayed value from `qudt:quantityValue`
  instead.
* **Do not require `coso:measurementUnit` unless a concentration range needs it.** Requiring
  it is indistinguishable from unticking this box, except silent.

## If the numbers look wrong

* **Counts jumped up after a deploy.** Expected. Before 2026-09-17 the checkbox did nothing
  in either position: a required unit join removed non-detects regardless. Any figure taken
  off the app before that understates PFAS presence.
* **A popup is empty.** Likely one of the 14 points with no measurements in the graph.
* **Unticking removed more than expected.** It removes readings, not just points. Check the
  popup row counts, not only the dot count.

## In the code

[`SampleFilters.tsx`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/SampleFilters.tsx)
renders the checkbox.
[`fusedQueries.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/fusedQueries.ts)
decides which joins each filter needs, in `sampleJoinsNeeded`.
[`samples.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/samples.ts)
holds `needsUnitJoin` and `resultValueClauses`.
`scripts/check-query-joins.mts` asserts the rule across all 108 question shapes in CI.
