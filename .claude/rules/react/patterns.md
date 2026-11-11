---
paths:
  - "ui/**"
---
# React, state and map

## State

- Global app state (the question, pipeline progress and results, view mode,
  modals) lives in Zustand: `src/store/queryStore.ts`.
- Async dropdown data (substances, materials, industries, counties) lives in
  React Query: `src/hooks/useDiscoveryQueries.ts`, `staleTime: Infinity`, each
  with a hardcoded fallback constant. Never copy it into Zustand.

## Components

- Props as a named `interface`, destructured in the signature. No `React.FC`.
- Colours come from the CSS custom properties in `src/index.css` and
  `src/App.css`, not hex literals in components.
- Dropdowns reuse `FlatSelect`; the industry tree is `HierarchicalSelect`.
  Don't add a third.

## Map (react-leaflet)

- Anything calling `useMap()` must render inside `MapContainer`. Use the
  controller component pattern (see `MapCenterController`).
- WKT is `lon lat`, Leaflet is `[lat, lon]`. Only `engine/shape.ts`
  converts. Never flip coordinates anywhere else.
- Result type is detected by row shape (`spWKT`, `facWKT`, `wbWKT`); each type
  has its own layer component.

## Panes and popups

- Draw order comes from panes only. Every layer gets its own pane, created
  with a childless `<Pane name="..." />` in `MapPanes` (`ResultsMap.tsx`) and
  named on the layer with its `pane` prop. Layers that share a pane stack in
  the order they were added, so toggling one moves it to the top (#88).
- Never nest layers inside `<Pane>`: their popups and tooltips inherit the
  pane and open under the data (#86). ESLint rejects it.
- A test that renders a layer on its own must render `<MapPanes />` first, or
  the layer has no pane to draw in.
- A custom renderer (`L.canvas()`, `L.svg()`) draws in its own pane, not its
  layers', so pass it `pane`.
- Don't set z-index on Leaflet classes in CSS. Every pane is its own stacking
  context, so such a rule only reorders things within one pane.
- Panes, bottom to top: `tilePane` 200, `aquiferPane` 340, `regionPane` 350,
  `waterAreasPane` 360, `streamsPane` 380, `overlayPane` 400 (water body
  lines), `samplesPane` 410, `wellsPane` 420, `markerPane` 600 (facilities,
  water body points), `measurePane` 640, `tooltipPane` 650, `popupPane` 700.
  `ui/tests/mapPanes.test.tsx` checks this.
- Popups are sized and panned by `FitPopupsToMap` in
  `ui/components/Map/ResultsMap.tsx`: capped to the map and padded clear of
  the banner and open panels (`panelPadding.ts`). Don't size a popup for the
  map in a layer; give it only its own `maxWidth`.
