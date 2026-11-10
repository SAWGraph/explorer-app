# Start-side test rounds

One line per round of `engine/scripts/start-side-test.mts` (map #133, #137). "Other jobs" are this repo's GitHub Actions jobs that query the graph, read at the start; other users of apps.okn.us are not visible.

| Round | Started (UTC) | Ended (UTC) | Commit | CSV | federation cache before | after | Other jobs | Row mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-10T17:14 | 2026-11-10T17:53 | 94c272a | [2026-11-10-r1-94c272a.csv](./2026-11-10-r1-94c272a.csv) | 47 entries, 15.1 GB | 69 entries, 15.0 GB | none | waterBodies downstream(30km) facilities [ME both]: anchor-led 1861, target-led 1857; samples downstream(30km) facilities [ME both]: anchor-led 2394, target-led 2390 |
