# Workflow

## Before you start

- Read the matching doc in `docs/` first (index in `CLAUDE.md`). Most pipeline
  and SPARQL questions are already measured there, and the answer usually
  contradicts the obvious guess. Bugs: `docs/DEBUGGING.md`. Slow or failing
  queries: `docs/QUERY-MATRIX.md`. When did it break: `docs/health/STATUS.md`.
- Any change to a SPARQL query or pipeline step: run the real query against the
  live endpoint and show the result (rows, time, status) before proposing the
  plan. Theoretical correctness is not enough.
- Plans follow `docs/plans/README.md` (drafts, active, done).

## Branches

- Feature branches start from `development` and PR into `development`, never
  `main`. Name them `feat/...`, `docs/...`, `refactor/...`, `test/...`, `bug/...`, `docs/...`, `chore/...`, `perf/...`.

## Before you finish

Run these and report the output. Do not call a task done with a failure you
did not mention.

```bash
npm run build   # tsc -b && vite build
npm test        # Vitest, includes the SPARQL golden-file snapshot
npm run lint    # advisory: 15 pre-existing errors in components, add none
```

Also, when it applies:

- Touched query generation and the snapshot moved on purpose: `npx vitest run -u`,
  then read the diff of `tests/__snapshots__/query-shapes.txt` before committing.
- Changed a query shape's performance: `npm run query-matrix` (slow, live).
- Changed a prebuilt dashboard question: `npm run health-check -- <ref>`.
- Fixed a bug: add a regression test (see `testing.md`) and a
  `docs/DEBUGGING.md` entry with root cause and fix.
