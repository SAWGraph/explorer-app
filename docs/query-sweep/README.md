# Query sweeps

Every run of `npm run query-sweep`, newest first. One CSV per sweep, named
for the day it ran, so `ls` answers "when was this last run", and comparing
two sweeps is a `diff` of two paths.

```
npx tsx engine/scripts/query-sweep.mts M1 init                          # start a sweep (chunking off)
npx tsx engine/scripts/query-sweep.mts M2                               # each later phase
QUERY_SWEEP_CHUNKING=on npx tsx engine/scripts/query-sweep.mts M1 init  # the same, as the app runs
npx tsx engine/scripts/query-sweep.mts --index                          # rebuild this file
```

Both modes run the real engine and write one row per request. `chunking-off`
sends each query once, whole, and is the baseline; `chunking-on` runs it as the
app does (retry, splitting, 300s per step), so its extra rows are the probes and
slices the rescue added. The two diff row for row. Older sweeps (`raw`,
`engine`, and `raw-baseline`) used other formats and are kept as history.

Phases: M1 near, M2 downstream, M3 upstream (all entity pairs), M4 near-hop
distance, M5 dashboard questions, M6 six states, M7 no region, M8 filters,
M9 county scopes, MD flow-distance bounds.

| Sweep | Mode | Commit | Phases | Shapes | Pass | Fail | Since the previous sweep |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| [`2026-09-14`](./2026-09-14-raw-baseline.csv) | raw-baseline | `unrecorded` | M1 to M9 | 124 | 87 | 37 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine.csv) | engine | `unrecorded` | M1 to M9 | 124 | 112 | 9 | _first sweep in this mode_ |
| [`2026-11-06`](./2026-11-06-chunking-off-c13831e.csv) | chunking-off | `c13831e` | M1 to M9, MD | 156 | 110 | 46 | _first sweep in this mode_ |
| [`2026-09-20`](./2026-09-20-raw-e84a11f.csv) | raw | `e84a11f` | MD | 32 | 12 | 20 | **2 broke** (facilities upstream(30km) samples [ME on C] step1, samples downstream(30km) facilities [ME on A] step1) |
| [`2026-09-20`](./2026-09-20-raw-ec221d9.csv) | raw | `ec221d9` | MD | 32 | 14 | 18 | 3 fixed |
| [`2026-09-20`](./2026-09-20-raw-002e529.csv) | raw | `002e529` | MD | 32 | 11 | 21 | _first sweep in this mode_ |
| [`2026-09-14`](./2026-09-14-engine-contaminated-9128aa9.csv) | engine-contaminated | `9128aa9` | M1 to M9 | 124 | 94 | 29 | _first sweep in this mode_ |

## Notes

**[`2026-09-14-raw-baseline.csv`](./2026-09-14-raw-baseline.csv)**: **The pre-Phase-2 baseline, in raw mode.** Each step's SPARQL posted straight
to the endpoint, one row per step, before splitting and merging existed. It is
the reference that `docs/DEBUGGING.md` and `docs/ARCHITECTURE.md` say to diff
against, and the only full raw sweep. It predates the `commit` column, so the
code it measured is unrecorded. Like `2026-09-14-engine.csv`, its 25 `upstream`
rows measured the mirror question (trace-direction bug, fixed 2026-09-16).

**[`2026-09-14-engine.csv`](./2026-09-14-engine.csv)**: **The 25 `upstream` rows measured the wrong question.** Every upstream shape
traced the relation backwards until 2026-09-16 (`docs/DEBUGGING.md`,
2026-09-16), so their status, timing and row counts describe the mirror
question. They are not a baseline: the corrected direction is materially more
expensive where block C is unfiltered. See `docs/QUERY-SWEEP.md` Part 9, and
re-sweep.

The other 99 rows (62 `near`, 37 `downstream`) are unaffected, and are the control when
diffing this file against the next sweep.

**[`2026-09-20-raw-e84a11f.csv`](./2026-09-20-raw-e84a11f.csv)**: **The file name and the `commit` column disagree.** The name says `e84a11f`,
the commit before the seed-side fix (`ec221d9`). Every row's `commit` column
says `4454b80`, a later commit that includes that fix. Which code this measured
is not recorded beyond that; treat the name as the intent and check before
relying on it as the pre-fix half of a comparison.

**[`2026-09-20-raw-002e529.csv`](./2026-09-20-raw-002e529.csv)**: **Cold. Do not diff this against a later sweep on its own.** This was the first
MD sweep ever run, so every query in it missed the engine's cache, and the three
sweeps taken after it were all warm. One row moves on that difference alone:
`facilities upstream samples [ME on A] step1` times out here and answers in 15s
warm, with the generated SPARQL byte-identical (1,950 chars either side of
`ec221d9`). Read against `2026-09-20-raw-e84a11f.csv`, which re-runs the same
pre-fix engine warm, and is the honest before-half of that comparison.

**[`2026-09-14-engine-contaminated-9128aa9.csv`](./2026-09-14-engine-contaminated-9128aa9.csv)**: **Do not read the 29 failures as real.** This sweep measured its own load.

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


Generated 2026-11-06.
