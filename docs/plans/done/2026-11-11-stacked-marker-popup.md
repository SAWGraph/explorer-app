# Markers that share a point open one list

**Status**: done
**Created**: 2026-11-11
**Completed**: 2026-11-11

## Problem

Markers at identical coordinates are drawn on top of each other and only the
top one can be clicked (#153). Measured live on 2026-11-11:

- Cook County streams question: 402 facilities on 390 points, 12 pairs. The
  squares are the same size, so the bottom one of each pair can never be
  opened (Willow Springs Terminal under Jones Chemicals, for one).
- Penobscot and Knox samples question: 60 samples on 57 points, 3 pairs. Each
  pair is a big circle under a small one, so the big one is reachable only
  through a 3 to 7 px ring, and only because of row order.

The issue's figures for Penobscot (43 points, 13 on the busiest, 17 never
reachable) do not hold for exact coordinates. They look like on-screen overlap
at a zoomed-out view, which zooming in resolves and which is out of scope.

## Approach

List popup, chosen over spiderfy. Group each layer's features by identical
`[lat, lon]` at draw time. Every marker is still drawn as today (same size,
pane and order). A marker whose point holds two or more markers opens one
popup listing all of them; picking one shows its usual popup with a link back
to the list. A single marker opens its popup directly, as now. The tooltip of
a stacked marker adds "+N more at this point".

No engine, SPARQL, cache key or wire change.

## Tasks

- [x] `groupByPoint` in `ui/components/Map/stackedPoints.ts`
- [x] `StackedPopupContent` in `ui/components/Map/StackedPopup.tsx`
- [x] Use it in `SampleLayer`, `FacilityLayer`, `WellLayer`
- [x] Styles in `ui/App.css` from existing tokens
- [x] `ui/tests/stackedPoints.test.ts`, `ui/tests/stackedPopup.test.tsx`
- [x] Check the Willow Springs and Bangor airport pairs in `npm run dev`
- [x] `npm run build`, `npm test`, `npm run lint`

## Notes

- Sample observation rows still load only for the sample picked from the list
  (`useSampleDetails` is enabled by the open popup of that one feature).
- Leaflet measures a popup once on open, so switching between list and detail
  calls `popup.update()`, as `SamplePopup` does when its rows arrive.
- Findings page: https://app.superset.sh/page/stacked-map-markers-153-gqadbg
- Checked on localhost against the live endpoints: the Willow Springs pair opens
  "2 facilities at this point" and both entries open their popups; the 140235 /
  140248 sample pair lists both, and picking 140235 loads its measurements
  (PFOS 790 ng/L).
