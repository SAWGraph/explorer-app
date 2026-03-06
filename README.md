# Sawgraph Explorer

![Alt text](./src/assets/sawgraph-explorer-logo.svg)

A web-based interface for querying the [SAWGraph](https://sawgraph.github.io/) knowledge graph — a PFAS contamination dataset linking water samples, industrial facilities, and hydrological features across the United States.

## What it does

The app lets you ask spatial analysis questions in plain English:

> _"What water samples are downstream of [22 - Utilities] facilities in Ohio?"_

It translates those questions into multi-step SPARQL pipelines, executes them against SAWGraph's knowledge graph endpoints, and renders the results on an interactive map.

## Stack

- **React 19** + **TypeScript** + **Vite 7**
- **Zustand** — application state
- **React Query** — filter dropdown data with `staleTime: Infinity`
- **react-leaflet** — map rendering
- **S2 Level 13 cells** — spatial bucketing for all geo queries

## Getting started

```bash
cd sawgraph-query-editor
npm install --legacy-peer-deps   # react-leaflet has a peer dep mismatch with React 19
npm run dev
```

Other commands:

```bash
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build
```

## How queries work

An **Analysis Question** has three parts:

```
[Block A — target entity]  [Relationship]  [Block C — anchor entity]
     water samples            downstream       facilities in Ohio
```

When you click Apply, the query engine:

1. **Plans** the question (`engine/planner.ts`) → array of `PipelineStep`
2. **Executes** steps sequentially (`engine/executor.ts`), threading S2 cell sets between steps
3. **Renders** results as map layers (`resultTransformer.ts` → `MapFeature[]`)

Supported entity types: **samples**, **facilities**, **water bodies**
Supported relationships: **near** (~1–2 km), **downstream**, **upstream**

## SPARQL endpoints

All hosted at `frink.apps.renci.org`:

| Endpoint      | Used for                                        |
| ------------- | ----------------------------------------------- |
| `sawgraph`    | Sample data, substances                         |
| `fiokg`       | Facility industry codes                         |
| `federation`  | Facility spatial queries (`kwg-ont:sfContains`) |
| `spatialkg`   | S2 cell lookups, region/county boundaries       |
| `hydrologykg` | Upstream/downstream tracing                     |

## Filter dropdowns

| Dropdown         | Data source                                                  |
| ---------------- | ------------------------------------------------------------ |
| Industry (NAICS) | Live SPARQL → `fiokg`, fallback to hardcoded list            |
| Substance        | Live SPARQL → `sawgraph`, fallback to hardcoded list         |
| Material type    | Live SPARQL → `sawgraph`, fallback to hardcoded list         |
| State            | Static — all 50 states; 13 with SAWGraph data are selectable |
| County           | Live SPARQL → `spatialkg`, fetched on state selection        |

## Docs

Inside `docs/`:

| File              | Contents                                            |
| ----------------- | --------------------------------------------------- |
| `ARCHITECTURE.md` | System design, module boundaries, data flow         |
| `SCHEMA.md`       | Predicate inventories, class counts, endpoint roles |
| `DEBUGGING.md`    | Documented bugs with root causes and fixes          |
| `CONVENTIONS.md`  | Coding standards, endpoint selection rules          |
| `changelog/`      | Weekly changelogs (`YYYY-Www.md`)                   |
| `plans/`          | Feature planning: `drafts/` → `active/` → `done/`   |
