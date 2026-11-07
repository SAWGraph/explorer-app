# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Layout

This repo (`explorer/`) is a React 19 + TypeScript + Vite 7 SPA for querying the SAWGraph knowledge graph (PFAS contamination data) via SPARQL endpoints, plus a small Express + Postgres API in `server/`.

The parent folder also holds `figma/` (design assets) and `python notebooks/` (exploratory analysis). They are not part of this git repo.

## Commands

All commands run from `explorer/`:

```bash
npm run dev          # Start dev server (Vite, dynamic port)
npm run build        # TypeScript check + Vite build (tsc -b && vite build)
npm run lint         # ESLint
npm test             # Vitest (tests/)
npm run preview      # Preview production build

npm run health-check -- <ref>   # Run every dashboard question, record the results
npm run query-sweep            # Re-measure every query shape (slow)
npm run flow-distance-check     # Bounded downstream trace vs the UC1_CQ2c notebook (live)
npm run warm-cache              # Precompute dashboard results (needs CACHE_WRITE_TOKEN)
npm run build-thumbnails        # Re-render prebuilt card thumbnails (live queries, ~4 min)
npm run contrast-check          # WCAG contrast report for map and UI colours (report only)
```

Scripts live with what they serve: `engine/scripts/` (live measurement), `ui/scripts/` (UI assets), `scripts/ops/` (writes to the live cache).

Install dependencies with `npm install --legacy-peer-deps` (react-leaflet has a peer dep mismatch with React 19). Tests are Vitest (`npm test`, files in `engine/tests/` and `ui/tests/`). One file: `npx vitest run engine/tests/queryGeneration.test.ts`; one test: add `-t "<name>"`. `engine/tests/__snapshots__/query-shapes.txt` is a golden file of the SPARQL every question generates: re-record with `npx vitest run -u` after an intended change and read its diff. The rule tests (`traceDirection`, `flowlineScope`, `cacheKey`, `stepLabels`, `substanceLabels`, `queryJoins`) assert properties across the whole question space. See `.claude/rules/common/testing.md`.

## Architecture

### Core Data Model

The app builds an **AnalysisQuestion** (`src/types/query.ts`) composed of three parts:

- **Block A** (target entity) and **Block C** (anchor entity): each one of `samples`, `facilities`, `waterBodies`, `wells`, `aquifers`, `streams`, with a region and type-specific filters
- **Relationship**: `near`, `downstream`, `upstream` or `within`. Traces take an optional cumulative flowpath distance bound (km); unset means the full transitive closure.

### Query Pipeline (`src/engine/`)

Questions execute through a pipeline, run by `runQuestion` (`engine/run.ts`), the one entry point the app and scripts call:

1. **Planner** (`planner.ts`) — converts AnalysisQuestion → array of PipelineStep
2. **Executor** (`executor.ts`) — starts each step once the steps it waits for are done (`after` in `planner.ts`): the main steps one at a time, decoration (boundaries, stream lines) alongside them. It threads the entity IRIs the discovery steps found (`targetIris` / `anchorIris`) between steps, and stops as empty when a side counts 0 (the two count steps open every plan) or the target side finds nothing. S2 cells are not carried between steps: they used to be, but since the fused-query refactor they are variables inside a single query (see `explorer/docs/ARCHITECTURE.md`, Key Design Decision 2).
3. **Templates** (`templates/`): SPARQL query builders per spatial operation; what each entity type contributes (its IRI variable, cell bind, filters, region check, how its details load) lives in `entities/`, one module per type. All spatial joins use **S2 Level 13 cells** as the bucketing mechanism.
4. **endpoint.ts**: executes SPARQL against remote endpoints, transforms bindings to flat rows
5. **shape.ts**: converts SPARQL rows to `MapFeature[]` by parsing WKT geometries; deduplicates by URI

A query the endpoint refuses (timeout, out of memory, payload too large) is split into smaller slices and merged (`slicing.ts`); `errors.ts` classifies the failure, decides retry or split, and words the failed, empty and incomplete-result messages.

### Result Cache and API (`server/`)

The API stores computed results in Postgres so dashboard questions load instantly (`/api/results`) and serves shareable published views (`/api/publish`). The client asks the cache first (`useQueryPipeline.ts`, `src/api/resultCacheClient.ts`); "run fresh" passes `skipCache`. Results are keyed by `src/engine/cacheKey.ts` and serialised by `src/engine/wire.ts`: a new `AnalysisQuestion` field that changes results must change the key, a change to the stored result shape must bump `WIRE_VERSION`, and a data reload bumps `DATA_VERSION` (both in `cacheKey.ts`). `npm run warm-cache` fills the cache for the prebuilt questions.

### SPARQL Endpoints (`src/constants/endpoints.ts`)

All at `apps.okn.us`:

| Endpoint      | Used for                                        |
| ------------- | ----------------------------------------------- |
| `sawgraph`    | Sample data, substances, material types         |
| `fiokg`       | Facility industry codes (NAICS discovery)       |
| `federation`  | Facility spatial queries (`kwg-ont:sfContains`) |
| `spatialkg`   | S2 cell lookups, region/county boundaries       |
| `hydrologykg` | Upstream/downstream tracing                     |

### State Management

- **Zustand** store (`src/store/queryStore.ts`) — holds AnalysisQuestion, pipeline progress, results, view state (dashboard vs editor), and modal state
- **React Query** hooks (`src/hooks/useDiscoveryQueries.ts`) — populate filter dropdowns from SPARQL. Cached with `staleTime: Infinity`. All have hardcoded fallback constants if endpoints fail.

### UI Flow

Dashboard (prebuilt queries) → Editor view → Run pipeline → Map renders layers.

- Initial data load runs automatically (`pendingAutoRun` flag) when navigating from Dashboard; handled in `MainContent`, not `EditModal`
- Edit modal opens with a snapshot of the current question; Apply is disabled until the question changes; on success it auto-closes after 800ms
- Full-screen blocking overlay (`PipelineProgressStrip`) prevents interaction during initial load

Components in `src/components/` organized by: `Dashboard/`, `QueryEditor/`, `Map/`, `Pipeline/`, `Layout/`.

### Filter Dropdowns

| Dropdown         | Source                                                                    |
| ---------------- | ------------------------------------------------------------------------- |
| Industry (NAICS) | Live SPARQL → `fiokg`, fallback to `FALLBACK_NAICS`                       |
| Substance        | Live SPARQL → `sawgraph`, fallback to `FALLBACK_SUBSTANCES`               |
| Material type    | Live SPARQL → `sawgraph`, fallback to `FALLBACK_MATERIAL_TYPES`           |
| State            | Static — all 50 states; `AVAILABLE_STATE_FIPS` marks which are selectable |
| County           | Live SPARQL → `spatialkg`, fetched lazily on state selection              |

The Industry dropdown is a custom **HierarchicalSelect** (tree checkboxes, portal dropdown). All others use the shared **FlatSelect** component.

### Map Rendering

Uses react-leaflet. Result type is detected by row shape (`spWKT` sample, `facWKT` facility, `wbWKT` water body, `wellWKT` well, `flowlineWKT` stream, `regionWKT` region). Each type has a dedicated layer component. `MapCenterController` auto-fits bounds after each successful pipeline run.

## Key Conventions

Coding standards live in `.claude/rules/` and load automatically (`common/` always, the rest by file path). Index: `docs/CONVENTIONS.md`.

## Documentation

Everything is under `explorer/docs/`. Read the relevant one before investigating
a pipeline or SPARQL issue — most questions here have already been measured, and
the answer usually contradicts the obvious guess.

**The knowledge graph**

- `SCHEMA.md` — predicate inventories, class counts, endpoint roles, data coverage, template validation. What exists in the graph and where.
- `wiki/` — one page per filter dropdown: what it shows, the SPARQL behind it, and what a wrong-looking result means. Source of truth for the [GitHub Wiki](https://github.com/SAWGraph/explorer-app/wiki); synced by `.github/workflows/wiki-sync.yml`.

**When something is broken or slow**

- `DEBUGGING.md` — bugs that have already been diagnosed, with root causes and fixes.
- `QUERY-SWEEP.md` — every query shape the app can build, measured. Part 2 is the query space; Part 3 the baseline times; **Part 4 the error catalogue** (what each HTTP status really means — note QLever reports a 30s timeout as `429 Too Many Requests`); Part 5 the four root causes; Parts 6–7 the post-fix re-measurement; Part 8 distance-bounded traces, including which county fails and what rescues it.
- `query-sweep/` — one CSV per sweep, named for the day it ran, with a generated `README.md` indexing them: when, which commit, how many shapes passed, what moved since last time. Run a sweep with `npm run query-sweep`, rebuild the index with `npx tsx engine/scripts/query-sweep.mts --index`.
- `health/STATUS.md` — are the dashboard questions working right now, how long they take, and whether their row counts moved. Regenerated weekly by `.github/workflows/health-check.yml`; `health/history.jsonl` is the full time series, one JSON line per question per run. **This is where you date a regression.**

**The code**

- `ARCHITECTURE.md` — how the app works end to end, starting from what a knowledge graph is. The orientation doc for someone new.
- `CONVENTIONS.md`: index of the rules in `.claude/rules/`.

**Working notes**

- `aquifer-queries.md` — scratch queries from scoping aquifer support (ME + IL only, as of 2026-08).
- `plans/` — drafts → active → done (see Planning below).
- `changelog/` — weekly files (see Changelog below).

## Planning

Plans live in `explorer/docs/plans/` with a drafts → active → done workflow. See `docs/plans/README.md` for the full process.

## Testing and Verification

When fixing bugs:

- Reproduce the issue if possible.
- Verify the fix directly.

When adding features:

- Verify expected behavior.
- Verify no obvious regressions were introduced.

When refactoring:

- Preserve behavior unless changes were requested.
- Verify before-and-after behavior when possible.

## Deployment

Deployed on **Railway**, two environments, each with a frontend and an API
service (`explorer/server/`). Build config lives in the Railway dashboard, not
in the repo.

| Environment | Branch        | Frontend                                     | API                                              |
| ----------- | ------------- | -------------------------------------------- | ------------------------------------------------ |
| Production  | `main`        | explorer.sawgraph.com                        | sawgraph-explorer-api.up.railway.app             |
| Development | `development` | sawgraph-explorer-development.up.railway.app | sawgraph-explorer-api-development.up.railway.app |

Feature branches target `development` so they deploy to the development
environment first. The frontend finds the API through `VITE_API_BASE_URL` (baked
in at build time); the API allows that origin via `FRONTEND_ORIGIN`.

## Changelog

Changelogs live in `explorer/docs/changelog/` as weekly files named `YYYY-Www.md` (e.g. `2026-W09.md`). Each file contains a numbered list of changes for that week.

**Important**: Never add a changelog entry automatically. After completing a feature or bug fix, always ask the user first: "Would you like me to add this to the changelog?"

## Code Intelligence

Prefer LSP over Grep/Glob/Read for code navigation:

- `goToDefinition` / `goToImplementation` to jump to source
- `findReferences` to see all usages across the codebase
- `workspaceSymbol` to find where something is defined
- `documentSymbol` to list all symbols in a file
- `hover` for type info without reading the file
- `incomingCalls` / `outgoingCalls` for call hierarchy

Before renaming or changing a function signature, use
`findReferences` to find all call sites first.

Use Grep/Glob only for text/pattern searches (comments,
strings, config values) where LSP doesn't help.

After writing or editing code, check LSP diagnostics before
moving on. Fix any type errors or missing imports immediately.

## Agent skills

### Issue tracker

GitHub Issues on `SAWGraph/explorer-app`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when a term or decision first needs one. See `docs/agents/domain.md`.
