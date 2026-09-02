# SAWGraph Query Editor — Coding Conventions

Standards and patterns to follow (and avoid) in this codebase.

---

## Dependencies

- Use `npm install --legacy-peer-deps` for all installs — react-leaflet has a peer dep mismatch with React 19

---

## TypeScript

- Use explicit `MapFeature | null` return types in `.map()` callbacks — avoids TypeScript type predicate issues with `.filter(Boolean)`
- Prefer explicit interfaces over `type` aliases for object shapes

---

## SPARQL Templates

- All SPARQL prefixes are centralized in `src/constants/prefixes.ts` — import `PREFIXES` constant, never inline prefixes in template strings
- Each entity type has its own template file in `src/engine/templates/`
- Template functions return raw SPARQL strings — no query builder library
- Build `VALUES` clauses with helper functions (`s2CellsToValuesString`, `buildIndustryValues`) to avoid string injection
- Changing a discovery query (`src/engine/templates/regions.ts`) means updating its page in `docs/wiki/` in the same PR — run the query against the live endpoint first and document what it actually returns

---

## State

- Global state (question, pipeline results, UI mode) lives in Zustand: `src/store/queryStore.ts`
- Async data for dropdowns (substances, materials, industries) uses React Query: `src/hooks/useDiscoveryQueries.ts`
- Don't put dropdown/discovery data in Zustand — it's async/cached, belongs in React Query

---

## Region Data

- US states with data coverage live in `src/constants/regions.ts` — limited to 13 states (AL, AZ, AR, IL, IN, KS, ME, MA, MN, NH, OH, SC, VT)
- Region codes are numeric FIPS codes (e.g. `'23'` for Maine, `'01'` for Alabama), not state abbreviations

---

## Map Components

- Leaflet components that use `useMap()` must be children of `MapContainer` — use the controller component pattern for anything that needs to manipulate the map view
- Coordinate order: WKT uses `lon lat`, Leaflet uses `[lat, lon]` — the result transformer handles this conversion. Don't flip coordinates elsewhere.

---

## Pipeline

- The planner (`engine/planner.ts`) decides the query strategy — the executor (`engine/executor.ts`) just runs whatever it's given
- S2 cells are the join key between pipeline steps — they flow through `context.s2Cells`
- `anchorS2Cells` = cells from the initial entity lookup (saved at `GET_S2_FOR_ANCHOR`)
- `targetS2Cells` = cells extracted from target entity results (saved at `FIND_TARGET_ENTITIES`)
- Early-exit on empty S2 cells is handled by `S2_PRODUCING_STEPS` set in executor.ts
- Facility queries must use `federation` endpoint (not `fiokg`) when they include `kwg-ont:sfContains` — fiokg alone doesn't have the full spatial index

---

## Endpoint Selection

| What you need | Use |
|--------------|-----|
| Facility S2 cells or facility details via S2 | `federation` |
| Sample retrieval | `sawgraph` |
| S2 adjacency, region filtering, boundaries | `spatialkg` |
| Water bodies, flow paths, hydrology tracing | `hydrologykg` |
| Cross-graph joins | `federation` |
