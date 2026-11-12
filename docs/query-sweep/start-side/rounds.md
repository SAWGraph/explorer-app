# Start-side test rounds

One line per round of `engine/scripts/start-side-test.mts` (map #133, #137). "Other jobs" are this repo's GitHub Actions jobs that query the graph, read at the start; other users of apps.okn.us are not visible.

| Round | Started (UTC) | Ended (UTC) | Commit | CSV | federation cache before | after | Other jobs | Row mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-10T17:14 | 2026-11-10T17:53 | 94c272a | [2026-11-10-r1-94c272a.csv](./2026-11-10-r1-94c272a.csv) | 47 entries, 15.1 GB | 69 entries, 15.0 GB | none | waterBodies downstream(30km) facilities [ME both]: anchor-led 1861, target-led 1857; samples downstream(30km) facilities [ME both]: anchor-led 2394, target-led 2390 |
| 2 | 2026-11-11T18:30 | 2026-11-11T18:45 | 0a9262e | [2026-11-11-r2-0a9262e.csv](./2026-11-11-r2-0a9262e.csv) | 1000 entries, 0.4 GB | 69 entries, 15.0 GB | none | waterBodies downstream(30km) facilities [ME both]: anchor-led 1861, target-led 1857; samples downstream(30km) facilities [ME both]: anchor-led 2394, target-led 2390 |
| 3 | 2026-11-12T22:49 | 2026-11-12T23:24 | 49eaf5e | [2026-11-12-r3-49eaf5e.csv](./2026-11-12-r3-49eaf5e.csv) | 26 entries, 0.0 GB | 69 entries, 15.0 GB | none | waterBodies downstream(30km) facilities [ME both]: anchor-led 1861, target-led 1857; samples downstream(30km) facilities [ME both]: anchor-led 2394, target-led 2390 |
