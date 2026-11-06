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
  and `query-matrix`'s per-step mode (the UI's SPARQL view reads
  `result.queries`, not a plan).
- `errors.ts`: one catalogue of outcome codes (`timeout`, `out-of-memory`,
  `too-large`, `busy`, `network`, `empty`, `partial`, `unknown`). Failures
  carry code, step, block, slices and raw server text. The UI only displays.
- `endpoint.ts`: the endpoint is an input. Three versions: QLever over HTTP,
  an in-memory fake for tests, a recording wrapper for `query-matrix`.
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
| 9 | The count rule applies to both trace families first. A `query-matrix` sweep sets the "clearly smaller" ratio (start at 3x). |
| 10 | Keep two discovery queries. A sweep decides whether one paired query replaces them. |
| 11 | Wells load by IRI in 1,000-IRI chunks like samples. A sweep sets the size above which they re-derive the join. |
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

- [x] Endpoint as an input, the in-memory fake, executor tests that pin today's behaviour (the recording wrapper for `query-matrix` moves to the stage-files item)
- [x] `errors.ts` catalogue (same wording, one file). The edit modal's Apply error is left for Phase 1, since moving it changes its wording
- [x] Normalise: orientation in one place; delete the dead upstream branches (five were dead, not six: `fringePath`'s upstream arm is live for target-seeded bounded traces)
- [x] Entity modules, query side (`engine/entities/`): IRI variable, cell bind, filters, region check, details, flowline, label. Not in this item: the one-row and drawable rules (Phase 1, they change SPARQL), rows to features (`resultTransformer.ts`, the Shape stage), the wells query builder (planner, until wells load by IRI) and the streams form of the trace (`fusedQueries.ts`)
- [x] Entity modules, sentence wording: each module's `describe(block, totals)` (P0.4b). `questionGenerator.ts` keeps the sentence, the region and the relationship
- [x] Stage files: `endpoint.ts`, `sides.ts`, `slicing.ts` (with the planner's by-IRI helpers), `merge.ts`, `shape.ts`, and "near or trace" as one `kind` from `normalise` (P0.5a)
- [x] `runQuestion(question, options)` as the one entry point; the app, the scripts and the edit-modal UI test call it (P0.5b). `planPipeline` stays the way to see a plan (the snapshot, and `query-matrix` runs part of one), in place of a separate `planQuestion`

**Phase 1: behaviour changes.** Each with a regression test, a
`docs/DEBUGGING.md` entry, and `npm run health-check` before merge.

- [x] Chunking flag: `chunkOnRefusal` run option (default on), `VITE_CHUNK_ON_REFUSAL=false` in the app; off, a refusal in a step the answer needs fails the run (even one batch of several), a refused optional step shows in the incomplete notice, and either message says so
- [ ] Recording endpoint replaces `query-matrix`'s raw mode (its own copy of the run loop) with the real engine and the flag off (moved from P0.5: without the flag, routing raw mode through the engine would make it split shapes it measures whole today)
- [ ] Decoration alongside, with the dependency-driven loop
- [ ] Live counts: early empty, advice, slice axis
- [ ] One row per (entity, cell) before the join for samples, wells and facilities, plus the rule test and the shared drawable rule. Bar to match: #94's 626s to 23.6s (#82 question) and 74.3s to 15.7s (Penobscot landfills)
- [ ] Fixes: combine facility industry codes; leftover filter slots; the non-detect tick counted as a filter in the advice
- [ ] Result by block, `WIRE_VERSION` bump, `warm-cache`
- [ ] Structured failures (code, step, block, slices, raw text) in `errors.ts`, and the edit modal's Apply error worded there instead of in the UI
- [ ] Question wording: more than three picks reads "4 stream types streams" and "4 industries facilities" (the noun is said twice). Found by the P0.4b fixtures; changes copy, so needs sign-off

**Phase 2: a `query-matrix` sweep decides each one before it ships.**

- [ ] Wells by IRI and its size limit (measured after the one-row change)
- [ ] Start side from counts for traces, and the ratio
- [ ] One paired discovery query

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
