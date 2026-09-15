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
| [`2026-09-14`](./2026-09-14-engine-contaminated-9128aa9.csv) | engine-contaminated | `9128aa9` | 124 | 94 | 29 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-raw-baseline.csv) | raw-baseline | `unrecorded` | 124 | 87 | 37 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine.csv) | engine | `unrecorded` | 124 | 112 | 9 | _first sweep in this mode_ |

Generated 2026-09-15.
