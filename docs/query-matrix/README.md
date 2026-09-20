# Query matrix sweeps

Every run of `npm run query-matrix`, newest first. One CSV per sweep, named
for the day it ran — so `ls` answers "when was this last run", and comparing
two sweeps is a `diff` of two paths.

```
QUERY_MATRIX_MODE=engine npx tsx scripts/query-matrix.mts M1 init   # start a sweep
QUERY_MATRIX_MODE=engine npx tsx scripts/query-matrix.mts M2        # each later phase
npx tsx scripts/query-matrix.mts --index                            # rebuild this file
```

`raw` posts each step's SPARQL directly and writes one row per step; `engine`
runs the real pipeline, one row per query, and is the mode to use after an
engine change. The two are not comparable row for row.

| Sweep | Mode | Commit | Shapes | Pass | Fail | Since the previous sweep |
| --- | --- | --- | ---: | ---: | ---: | --- |
| [`2026-09-20`](./2026-09-20-raw-e84a11f.csv) | raw | `e84a11f` | 32 | 12 | 20 | **2 broke** (facilities upstream(30km) samples [ME on C] step1, samples downstream(30km) facilities [ME on A] step1) |
| [`2026-09-20`](./2026-09-20-raw-ec221d9.csv) | raw | `ec221d9` | 32 | 14 | 18 | 3 fixed |
| [`2026-09-20`](./2026-09-20-raw-002e529.csv) | raw | `002e529` | 32 | 11 | 21 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-raw-baseline.csv) | raw-baseline | `unrecorded` | 124 | 87 | 37 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine.csv) | engine | `unrecorded` | 124 | 112 | 9 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine-contaminated-9128aa9.csv) | engine-contaminated | `9128aa9` | 124 | 94 | 29 | _first sweep in this mode_ |

## Notes

**[`2026-09-20-raw-002e529.csv`](./2026-09-20-raw-002e529.csv)** — **Cold. Do not diff this against a later sweep on its own.** This was the first
MD sweep ever run, so every query in it missed the engine's cache, and the three
sweeps taken after it were all warm. One row moves on that difference alone:
`facilities upstream samples [ME on A] step1` times out here and answers in 15s
warm, with the generated SPARQL byte-identical (1,950 chars either side of
`ec221d9`). Read against `2026-09-20-raw-e84a11f.csv`, which re-runs the same
pre-fix engine warm, and is the honest before-half of that comparison.

**[`2026-09-14-engine.csv`](./2026-09-14-engine.csv)** — **The 25 `upstream` rows measured the wrong question.** Every upstream shape
traced the relation backwards until 2026-09-16 (`docs/DEBUGGING.md`,
2026-09-16), so their status, timing and row counts describe the mirror
question. They are not a baseline: the corrected direction is materially more
expensive where block C is unfiltered. See `docs/QUERY-MATRIX.md` Part 9, and
re-sweep.

The other 99 rows (62 `near`, 37 `downstream`) are unaffected, and are the control when
diffing this file against the next sweep.


Generated 2026-09-20.
