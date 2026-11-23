# Engine redesign: one stage, one file

**Status**: active
**Created**: 2026-11-05
**Completed**:

## Problem

Every question the engine runs goes through the same 4 to 6 steps (find the
target side, find the anchor side, stream lines for traces, details for each
side, region boundaries). The jobs inside those steps are spread across files,
so a fix in one place misses another and the engine is hard to predict:

| Job | Files that hold part of it today |
|---|---|
| Map block A/C to anchor/target | planner, executor, ui hooks |
| Judge how narrow a side is | scope, fusedQueries, sparqlErrors (three definitions) |
| Split after a refusal | planner, executor, scope, sparqlErrors |
| Remove duplicates | executor (twice), fusedQueries, resultTransformer |
| Error wording | sparqlErrors, executor, sparqlClient, two UI components |

Measured on 2026-11-05 (live, `c12b335`):

- Discovery runs the same fused join twice, once per side.
- Wells details re-run the whole join (21.6s of a 29.6s run).
- Probing happens only after the server refuses a query.
- Region boundaries cost 24.8s of a 39.1s run, though they need only the state.
- `transformFacilitiesToFeatures` keeps the first row per facility and drops
  the other industry codes (Indiana: 882 rows for 415 facilities).
- No test imports `executor`, `scope`, `sparqlErrors` or `sparqlClient`.

## Approach

Seven stages, each in its own file. Stages 1 to 3 run once per question,
stages 4 to 6 repeat for every plan step, stage 7 runs once at the end.

| # | Stage | File | Owns |
|---|---|---|---|
| 1 | Normalise | `question.ts` | A/C to anchor/target once; drop filter slots that don't match the block type; feeds `cacheKey` |
| 2 | Assess | `sides.ts` | Offline rank per side (pinned, region, filter, nothing) and live counts |
| 3 | Strategy | `planner.ts` | Family to steps; each step names what it waits for |
| 4 | Slice | `slicing.ts` | Request-size chunks (1,000 IRIs), splitting after a refusal, probes |
| 5 | Run | `executor.ts` | Dependency-driven loop, budget, retry, the chunking flag |
| 6 | Merge | `merge.ts` | Exact copies across slices; IRIs passed to later steps |
| 7 | Shape | `shape.ts` | One feature per entity, rows combined; result by block |

Around the stages:

- `run.ts`: `runQuestion(question, options)`, the one entry point. Options:
  `endpoint`, `chunkOnRefusal` (default on), `countSides` (default on),
  `signal`, `onProgress`. `planPipeline` stays exported for the golden snapshot
  and `query-sweep`'s per-step mode (the UI's SPARQL view reads
  `result.queries`, not a plan).
- `errors.ts`: one catalogue of outcome codes (`timeout`, `out-of-memory`,
  `too-large`, `busy`, `network`, `empty`, `partial`, `unknown`). Failures
  carry code, step, block, slices and raw server text. The UI only displays.
- `endpoint.ts`: the endpoint is an input. Three versions: QLever over HTTP,
  an in-memory fake for tests, a recording wrapper for `query-sweep`.
- `entities/<type>.ts`: one module per entity type. Stages ask the module
  instead of switching on type. Each module binds one row per (entity, cell)
  in the join and defines what counts as a drawable entity, for discovery and
  details alike.
- `templates/`: SPARQL text only.

### Decisions

| # | Decision |
|---|---|
| 1 | Three families keyed by relationship: near, unbounded trace, bounded trace. Upstream is downstream with anchor and target swapped. Streams and wells quirks live in their entity modules. |
| 2 | Seven stages as above. The result cache stays with the caller (the engine stays headless). |
| 3 | The chunking flag covers splitting after a refusal only. Request-size chunks and the one retry after a timeout stay on. With the flag off, a refused query fails with its error. |
| 4 | The flag is a run option `chunkOnRefusal`, default on. The app reads a `VITE_` build setting. |
| 5 | One `errors.ts` catalogue, structured failures, no error wording in the UI. A timeout with chunking off says so. |
| 6 | Count both sides live before every question. Run option `countSides`, default on. |
| 7 | Counts give: an early `empty` when a side is 0, the error advice ("block C matches 459,877 facilities"), and the slice axis. |
| 8 | Start side: rank first; within the same rank level, the side with the clearly smaller count. Every choice records its reason in plain words. |
| 9 | The count rule applies to both trace families first. A `query-sweep` sweep sets the "clearly smaller" ratio (start at 3x). |
| 10 | Keep two discovery queries. Confirmed 2026-11-07: QLever's cache already shares the join between them (the second query took 0.6s to 3.3s after a first of 3.9s to 6.4s), so a paired query saves about one query, and on traces it returns 20 to 700 times more rows (Lake County: 49,447 pairs against 1,190 IRIs). |
| 11 | ~~Wells load by IRI in 1,000-IRI chunks like samples.~~ Dropped 2026-11-06: wells keep re-deriving the join in one request. Measured after the one-row change, by IRI tied or lost on 5 of 6 wells questions and took 51 requests (158.7s) for 50,174 wells, where re-deriving took 56.9s; a statewide set (800,000 wells) would be 800 requests. |
| 12 | Decoration (stream lines, boundaries) runs alongside the main steps, started as soon as what it waits for is done. |
| 13 | Keep the boundaries query. Static county outlines are a later UI job. |
| 14 | Merge removes exact copies across slices; Shape makes one feature per entity and combines its rows. |
| 15 | A run returns `blockA`, `blockC`, `decoration`, `startSide`, `partial`, `queries`. `WIRE_VERSION` bumps and `warm-cache` reruns. |
| 16 | Normalise owns orientation. The `direction` parameter and the six unreachable upstream branches in `fusedQueries.ts` are deleted. |
| 17 | The endpoint is an input (HTTP, fake, recording wrapper). |
| 18 | One file per stage; `runQuestion` is the entry point. |
| 19 | One module per entity type under `engine/entities/`. |
| 20 | Three phases, one PR per item, into `development`. |
| 21 | A count that fails or takes over 10s is dropped; the side falls back to rank and the reason says so. |
| 22 | Keep the breadth warning (`queryBreadth.ts`) until counts can replace it with a measured threshold. |
| 23 | Every entity module binds one row per (entity, cell); multi-valued fields join only in details. A rule test checks every shape. |
| 24 | Wells hotfix now; #94 stays closed and its fix lands as decision 23 in Phase 1. |

## Tasks

**Now**

- [x] Wells details no longer split into identical queries (PR #103)

**Phase 0: restructure, same behaviour.** The golden SPARQL snapshot stays
byte-identical in every PR.

- [x] Endpoint as an input, the in-memory fake, executor tests that pin today's behaviour (the recording wrapper for `query-sweep` moves to the stage-files item)
- [x] `errors.ts` catalogue (same wording, one file). The edit modal's Apply error is left for Phase 1, since moving it changes its wording
- [x] Normalise: orientation in one place; delete the dead upstream branches (five were dead, not six: `fringePath`'s upstream arm is live for target-seeded bounded traces)
- [x] Entity modules, query side (`engine/entities/`): IRI variable, cell bind, filters, region check, details, flowline, label. Not in this item: the one-row and drawable rules (Phase 1, they change SPARQL), rows to features (`resultTransformer.ts`, the Shape stage), the wells query builder (planner, until wells load by IRI) and the streams form of the trace (`fusedQueries.ts`)
- [x] Entity modules, sentence wording: each module's `describe(block, totals)` (P0.4b). `questionGenerator.ts` keeps the sentence, the region and the relationship
- [x] Stage files: `endpoint.ts`, `sides.ts`, `slicing.ts` (with the planner's by-IRI helpers), `merge.ts`, `shape.ts`, and "near or trace" as one `kind` from `normalise` (P0.5a)
- [x] `runQuestion(question, options)` as the one entry point; the app, the scripts and the edit-modal UI test call it (P0.5b). `planPipeline` stays the way to see a plan (the snapshot, and `query-sweep` runs part of one), in place of a separate `planQuestion`

**Phase 1: behaviour changes.** Each with a regression test, a
`docs/DEBUGGING.md` entry, and `npm run health-check` before merge.

- [x] Chunking flag: `chunkOnRefusal` run option (default on), `VITE_CHUNK_ON_REFUSAL=false` in the app (build setting only). Off: no retry, no splitting, no 300s step limit, and any failure in any step fails the run with the first error; request-size batches and the 60s request limit stay on. Settled in a second design session on 2026-11-06
- [x] "Run again" button on the error strip, for every failed run (PR #114)
- [x] `query-sweep` runs on the real engine through a recording endpoint: `QUERY_SWEEP_CHUNKING=off` (default) or `on`, one CSV row per request, the engine's error kinds, `requestBytes` instead of response bytes; raw mode's own loop is gone (item 1b; renamed from `query-matrix` first)
- [x] `.github/workflows/query-sweep.yml`: sweeps run in CI (push `sweep/chunking-off` or `sweep/chunking-on`), opening a PR with the CSV; two laptop attempts were ruined by the Mac sleeping
- [x] Record the new baseline: a full chunking-off sweep (M1 to M9, MD) on `development`, from the workflow (PR #118: 156 shapes, 110 passed, 46 failed)
- [x] Decoration alongside, with the dependency-driven loop: each step names what it waits for (`after`); boundaries start with the run, stream lines once both sides are found. The main steps still run one at a time
- [x] Live counts: early empty, advice, slice axis. Two count steps (`COUNT_TARGET`, `COUNT_ANCHOR`) open every plan, 10s cap, dropped on failure in both chunking modes; a side at 0 ends the run naming the block; the advice gives both counts and names the bigger block; slicing skips probes a count says would be full, order unchanged
- [x] One row per (entity, cell) before the join for samples, wells and facilities, plus the rule test and the shared drawable rule. Bar to match: #94's 626s to 23.6s (#82 question) and 74.3s to 15.7s (Penobscot landfills). Met: #82 41.7s to 23.7s (best of 2); Penobscot landfills is 3.4s to 5.9s either way today. Facilities collapse only under a prefix code or no code filter; water bodies downstream of wells left for wells by IRI (Phase 2)
- [x] Fixes: combine facility industry codes (one feature per facility, every matching code, coloured by the lowest); leftover filter slots (each type reads only its own slot, label maps are not filters, normalise and the cache key drop the rest). (The non-detect tick counted as a filter in the advice: fixed with the live counts)
- [x] Result by block, `WIRE_VERSION` bump: a run returns `blockA`, `blockC`, `decoration` (`boundaries`, `streamLines`), `partial`, `queries`, `counts`; results stored by step are still read (published views). `startSide` waits for Phase 2, where it gets counts and a reason
- [x] `warm-cache` on development after the merge (run from GitHub, 2026-11-07: all 8 dashboard questions cached by block); production at the next release
- [x] Structured failures (code, step, block, slices, raw text) in `errors.ts`, and the edit modal's Apply error worded there instead of in the UI. Codes keep the classifier's names (`payload-too-large`, `sibling-failure`) so sweep CSVs stay comparable
- [x] Question wording: more than three picks reads "4 stream types streams" and "4 industries facilities" (the noun is said twice). Now "streams of 4 types", "facilities in 4 industries" (wells and water bodies "of 4 types"); signed off 2026-11-06

**Phase 2: a `query-sweep` sweep decides each one before it ships.**

- [x] ~~Wells by IRI and its size limit~~: dropped, see decision 11. Live, re-derived vs by IRI: 751 wells 4.4s vs 5.4s; 2,431 wells 3.9s vs 13.4s; 2,597 wells 13.0s vs 13.9s and 13.8s vs 6.2s; 758 wells 6.0s vs 5.4s; 50,174 wells 56.9s vs 158.7s (51 requests). Water bodies downstream of wells is slow in discovery (633s, then 366s), not in the wells step. Its 50,174 against 74,348 wells was a partial discovery (the 300s step limit skipped slices); a full discovery found the same 74,348 the wells step re-derives. When discovery's wells side is partial, the re-derived wells step still loads every well, so the map can show more wells than the partial notice implies
- [ ] Start side from counts for traces, and the ratio
- [x] One paired discovery query: rejected, see decision 10. Live on 10 fresh shapes (5 near, 5 traces), order alternated, QLever `cache_status` read on every step. Not measured: both lists in one request as a `UNION` of two `SELECT DISTINCT` subqueries (same rows as today, worth at most one round trip per question)

## Notes

- Deferred on purpose: near questions starting from the narrower side (needs
  new SPARQL and its own measurement; issue #82's own example is a near
  question, so revisit it after Phase 2); static county outlines; a count-based
  breadth warning; the `within` relationship.
- #94 (closed, unmerged) is the reference for decision 23. Its numbers were
  measured on its branch and are the bar for Phase 1.
- Measurement scripts used for this plan lived outside the repo. The figures
  come from live runs on 2026-11-05 against `apps.okn.us` and are affected by
  QLever's cache; the sweeps exist because of that.
- Session pages: how the engine runs a question
  (https://app.superset.sh/page/how-the-engine-runs-a-question-lu1if8) and the
  decisions (https://app.superset.sh/page/engine-redesign-decisions-5wo52j).
