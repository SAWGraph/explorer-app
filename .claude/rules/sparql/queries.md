---
paths:
  - "engine/**"
  - "scripts/**"
  - "docs/wiki/**"
---
# SPARQL and the query pipeline

## Building queries

- Prefixes come from `PREFIXES` in `engine/constants/prefixes.ts`. Never inline
  `PREFIX` lines in a template.
- Templates are plain functions returning SPARQL strings. Query shapes live in
  `engine/templates/`; what one entity type contributes (its IRI variable, cell
  bind, filters, region check, details query) lives in its module in
  `engine/entities/`. No query builder library.
- Never interpolate user or endpoint values raw. Go through the helpers:
  `wrapUri`, `buildIndustryValues`, `buildSampleFilterClauses`.
- The planner decides the strategy, the executor runs it. Between steps only
  entity IRIs travel (`context.targetIris`, `context.anchorIris`). S2 cells are
  variables inside one fused query (`fusedQueries.ts`), not step outputs. See
  `docs/ARCHITECTURE.md`, Key Design Decision 2.

## Endpoints (`engine/constants/endpoints.ts`)

| Need | Endpoint |
| --- | --- |
| Samples, substances, material types | `sawgraph` |
| NAICS industry discovery | `fiokg` |
| Facility spatial joins, anything with `kwg-ont:sfContains`, cross-graph joins | `federation` |
| S2 cells, regions, county boundaries | `spatialkg` |
| Water bodies, flowlines, up/downstream tracing | `hydrologykg` |

`fiokg` alone lacks the spatial index, so facility queries using
`kwg-ont:sfContains` must go to `federation`.

## Reading failures

QLever reports its 30s timeout as `429 Too Many Requests`. It is a query that
did too much work, not rate limiting, so the fix is a smaller query, not
backoff. `engine/errors.ts` already classifies it and decides retry
or split (`isRetryable`, `isSplittable`); reuse that. `docs/QUERY-SWEEP.md`
Part 4 is the full catalogue.

## When you change a query

1. Run it against the live endpoint first and record rows, time and status.
2. `npm test`. If `tests/__snapshots__/query-shapes.txt` moves, confirm every
   changed shape was meant to, then re-record with `npx vitest run -u`.
3. Discovery queries (`templates/regions.ts`): update the matching
   `docs/wiki/` page in the same PR with what the query really returns.
4. Hydrology traces must go downstream from the seed
   (`engine/tests/traceDirection.test.ts`, run by `npm test`).
