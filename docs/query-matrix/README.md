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
| [`2026-09-14`](./2026-09-14-engine-9128aa9.csv) | engine | `9128aa9` | 124 | 94 | 29 | **25 broke** (waterBodies downstream facilities [ME], waterBodies downstream wells [ME], …) · 5 fixed |
| [`2026-09-14`](./2026-09-14-raw-baseline.csv) | raw-baseline | `unrecorded` | 124 | 87 | 37 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine.csv) | engine | `unrecorded` | 124 | 112 | 9 | _first sweep in this mode_ |

## Notes

**[`2026-09-14-engine-9128aa9.csv`](./2026-09-14-engine-9128aa9.csv)** — **Do not read the 29 failures as real.** This sweep measured its own load.

M4 (the multi-hop distance sweep) ran for **eight hours on twenty queries**,
recording 1348-2095s each against a 300s step ceiling — recorded time equals
wall time, so those are genuine elapsed seconds, not a suspended process. Every
phase after M4 inherited a degraded endpoint: M5 failed two *dashboard*
questions at 1101s and 490s that `docs/health/history.jsonl` shows succeeding at
**14s and 19s** the evening before.

What this sweep is good for: it proved engine mode had been crashing on its
first query since `partialSlices` was split into failed/skipped, and it is the
evidence that the 300s ceiling does not hold. Both are worth more than the CSV.

What it is not good for: any pass/fail or timing comparison. Re-run once the
ceiling is fixed, under `caffeinate -i` or in Actions so it is not hostage to
one laptop, and let the new file supersede this one.

The sweep also split across two files at UTC midnight — `runAt` is UTC while the
runner logged local time — and was merged back by hand. The runner should fix
the output path once and export it, as the warm-sweep runner does.


Generated 2026-09-15.
