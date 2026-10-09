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

## Testing

```bash
npm test             # every *.test.ts under src/, offline, a few seconds
npm run test:watch   # the same, rerunning on save
npm test -- -u       # re-record snapshots after an intended change
npm run test:live    # *.live.test.ts, against the real endpoints, about a minute
```

Tests sit next to the code they test (`planner.ts` and `planner.test.ts`). They
use [Vitest](https://vitest.dev) with `node:assert/strict` for assertions, and
CI runs `npm test` on every pull request.

### Every query, in one place

`src/engine/queries/catalog.ts` lists every SPARQL query the app can send: each
dropdown, the sample popup, the probes, and 374 analysis-question shapes. It
calls the same builders the app does, so it cannot list a query the app does
not send. Three things are generated from it:

- `src/engine/queries/__snapshots__/query-shapes.txt`, the golden file.
  `catalog.test.ts` fails when any query changes, and prints which catalog
  entries moved, grouped by relationship, before the raw diff.
- [`docs/QUERIES.md`](docs/QUERIES.md), the readable reference. It is a
  snapshot too, so CI fails when it stops matching the code.
- [`docs/queries/`](docs/queries), one page per dashboard question with its
  steps and SPARQL, also checked as snapshots.
- On every pull request, a "SPARQL blast radius" section on the Checks run's
  summary page, listing which entries the PR changes.

The wiki still quotes SPARQL by hand, so a test checks that every quoted block
is still a query the app sends.

When a change to a query is intended, re-record both files with
`npm test -- -u` and commit them with the code. To see the SPARQL for any
entry, `npm run sparql -- "<name>"`; with no name it lists them all.

A new query belongs in the catalog: dropdown and popup queries go through
`LOOKUPS` in `src/engine/lookupQueries.ts`, which pairs each builder with its
endpoint for both the hooks and the catalog.

### Against the live endpoints

`*.live.test.ts` files query the real endpoints and are skipped unless
`LIVE=1`, which `npm run test:live` sets. They run one file at a time, because
parallel runs measure their own load (docs/DEBUGGING.md).

The Live tests workflow runs the dropdown tests on every pull request. Add the
`live-check` label to a PR to also run the rest, plus every query the PR
changed, on the base branch's version and the PR's, side by side on the run's
summary page. It fails if a query that worked before fails after. Locally:

```bash
git show origin/development:src/engine/queries/__snapshots__/query-shapes.txt > /tmp/base.txt
npx tsx scripts/sparql-live-diff.mts /tmp/base.txt
```

Older docs and changelogs refer to the self-check scripts these tests replaced:

| Old script | Now |
| --- | --- |
| `scripts/check-trace-direction.mts` | `src/engine/planner.test.ts`, "trace direction" |
| `scripts/check-flowline-scope.mts` | `src/engine/planner.test.ts`, "flowline scope" |
| `scripts/check-step-labels.mts` | `src/engine/planner.test.ts`, "step labels" |
| `scripts/check-query-joins.mts` | `src/engine/templates/fusedQueries.test.ts` |
| `scripts/check-cache-key.mts` | `src/engine/cacheKey.test.ts` |
| `scripts/check-substance-labels.mts` | `src/constants/substances.test.ts`, `src/engine/resultTransformer.test.ts` |
| `scripts/check-query-snapshots.mts` | `src/engine/queries/catalog.test.ts` |
| `scripts/flow-distance-check.mjs` | `src/engine/planner.live.test.ts` |

## Deployment

Deployed on **Railway**, two environments, each with a frontend and an API
service. Build config lives in the Railway dashboard, not in this repo — there
is no `railway.json` or `nixpacks.toml` here.

| Environment | Branch | Frontend | API |
| --- | --- | --- | --- |
| Production | `main` | https://sawgraph-explorer.up.railway.app | https://sawgraph-explorer-api.up.railway.app |
| Development | `development` | https://sawgraph-explorer-development.up.railway.app | https://sawgraph-explorer-api-development.up.railway.app |

The frontend reaches the API through `VITE_API_BASE_URL`, baked in at build
time, so each environment's frontend points at its own API. The API allows the
frontend's origin via `FRONTEND_ORIGIN`. Both services share a Postgres
instance per environment.

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

Supported entity types: **samples**, **facilities**, **water bodies**, **wells**, **streams**
Supported relationships: **near** (~1–2 km), **downstream**, **upstream**

Downstream/upstream traces accept an optional cumulative flowpath cutoff
(`Within N km of flow`). Unset, the trace is the full transitive closure.
`src/engine/planner.live.test.ts` verifies the bounded trace against the
live endpoints.

## SPARQL endpoints

All hosted at `apps.okn.us`:

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

| File                | Contents                                                        |
| ------------------- | --------------------------------------------------------------- |
| `ARCHITECTURE.md`   | System design, module boundaries, data flow                     |
| `QUERIES.md`        | Every SPARQL query the app sends, generated from the code       |
| `SCHEMA.md`         | Predicate inventories, class counts, endpoint roles             |
| `QUERY-MATRIX.md`   | Every query shape, measured — plus the error catalogue (Part 4) |
| `health/STATUS.md`  | Weekly dashboard health: working, timings, row-count drift       |
| `query-matrix/`     | One CSV per sweep, dated, with a generated index                |
| `DEBUGGING.md`      | Documented bugs with root causes and fixes                      |
| `CONVENTIONS.md`    | Coding standards, endpoint selection rules                      |
| `wiki/`             | One page per filter dropdown; source of truth for the GitHub Wiki |
| `queries/`          | One page per dashboard question, generated from the code        |
| `changelog/`        | Weekly changelogs (`YYYY-Www.md`)                               |
| `plans/`            | Feature planning: `drafts/` → `active/` → `done/`               |
