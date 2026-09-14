# Trim the stream layer to reaches that actually connect

**Status**: done — partially. The connectivity trim was measured and rejected;
distance bounding shipped instead.
**Created**: 2026-09-14
**Completed**: 2026-09-14

## Problem

Downstream and upstream questions drew the entire river network they traced. A
question about facilities upstream from PFOS samples in three Maine counties
covered most of southern Maine in blue: 15,782 reaches for 616 facilities and
372 samples.

`buildFusedFlowlineQuery` took the resolved anchors, expanded to their S2 cells
plus neighbours, and emitted the whole `hyf:downstreamFlowPathTC` closure. The
target entities appeared nowhere in it, so a reach was drawn whether or not it
ever reached a matched sample. Three costs: unreadable maps, payloads past the
25 MB cache limit, and ~64,000 React elements at 21,000 reaches.

## What shipped

**PR #41** — rebased and merged the stream-distance work that had been open as
#32 since 2026-08-28. Optional `maxDistanceKm` (5–100 km) on traces, plus
streams as an answerable entity type. On the PFOS question a 30 km bound cut
reaches by 77% and payload from 22.3 MB to 7.1 MB while keeping every facility.

**PR #42** — fixed the cache-key collision that #41 exposed: a bounded and an
unbounded question hashed identically. See `docs/DEBUGGING.md`.

## What was rejected, with the measurement

Bounding by **terminus** — keeping only reaches that reach a matched sample —
was the original intent and does not work:

| Query | Result |
| --- | --- |
| current (no terminus) | 16s, 4,661 reaches |
| terminus-bounded | **429 timeout at 70s** |

A second `hyf:downstreamFlowPathTC` join over 408M triples exceeds what the
endpoint will do, even with all 1,172 target IRIs pinned. **Do not rebuild this
as specified.** The untested remainder is applying the constraint only on the
distance-bounded path, where `boundedTrace` has already shrunk the candidate set
— that would only help questions that set a distance.

## Not done

**The rendering safety net.** `StreamLayer.tsx` still maps 1:1 to
`<Polyline>` + `<Popup>` + `<Tooltip>` with no cap, no simplification and no
zoom awareness, and `parseWKTLineString` keeps every vertex. Independent of the
query, no correctness risk, and still worth doing — a distance bound reduces the
count but does not bound it.

## Notes

Facts established while measuring, kept in `docs/QUERY-MATRIX.md` Part 8:
`hyf:downstreamFlowPathTC` is reflexive; `A TC B` means B is downstream of A;
and the network has genuine two-way connectivity in braided channels, so a
single pair cannot be used to reason about trace direction.

A suspicion that the upstream branch was inverted was investigated and **not
substantiated** — two attempts failed to produce a clean answer. It is recorded
here only so the next person does not re-raise it without a better method than
comparing population means or sampling one pair.
