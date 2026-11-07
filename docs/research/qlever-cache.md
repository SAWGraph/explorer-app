# QLever's result cache, and whether a query can skip it

Research for [#134](https://github.com/SAWGraph/explorer-app/issues/134), child of the map [#133](https://github.com/SAWGraph/explorer-app/issues/133). Checked 2026-11-07.

Sources: QLever source at commit [`4b9df11`](https://github.com/ad-freiburg/qlever/tree/4b9df11d36e999e43caf89da26cd912bf942f274) (the `master` of 2026-11-07), qlever-control at [`84bdd27`](https://github.com/ad-freiburg/qlever-control/tree/84bdd27435bd93f2dc70269c30eefbb8d36d916e), the [Qleverfile docs](https://docs.qlever.dev/qleverfile/), and read-only requests to `apps.okn.us` on 2026-11-07 around 05:10 UTC (`cmd=cache-stats`, `cmd=get-settings`, and two COUNT queries that each ran in under 0.4s).

## Short answer

- **What is kept:** every operation's result, not just the whole query. One in-memory LRU cache holds the result of each node of the query plan (index scans, joins, transitive paths, group-bys, the root), keyed by the node's structure. A repeat query, or a different query that shares a subtree, reads those nodes back.
- **How long:** there is no time limit. An entry stays until LRU eviction (more than 1000 entries, more than the byte cap, or a running query needing the memory), a `cmd=clear-cache`, or a server restart.
- **Skipping it per request:** not possible. No URL parameter or header makes one request bypass the cache. The only switch (`disable-caching`) is server-wide, needs the access token, and does not exist on the `federation` server our traces use.
- **Clearing it:** `cmd=clear-cache` works with no token, but it empties the cache for every user of that server. Do not send it to a shared endpoint without the operators' agreement.
- **How long until cold:** no fixed time. On `federation` the cache was 42% full with 46 entries, so a result can survive for days. Spacing runs hours apart does not guarantee cold.
- **What to do instead:** ask for `Accept: application/qlever-results+json` and read `cache_status` on each node of `runtimeInformation`. A run is cold only if no node reports `cached_*`. This tells you, per run, whether the timing counts.

## 1. What the cache stores

The cache is a `ConcurrentCache` around an `LRUCache`, described in the source as a "Threadsafe LRU cache for (partial) query results" ([QueryExecutionContext.h L94 to L98](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/QueryExecutionContext.h#L94-L98)).

Every `Operation` looks itself up before computing. `Operation::getResult` builds the key from `getCacheKey()` plus the update snapshot index, then calls `cache.computeOnce(...)` ([Operation.cpp L315 to L376](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Operation.cpp#L315-L376)). This runs for every node, not only the root, so subtree results are cached alongside the final result.

The key is the operation's structure, not the query text:

- An index scan's key is its permutation and its fixed terms, for example `SCAN PSO with P = "<...#type>"` ([IndexScan.cpp L125 to L150](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/IndexScan.cpp#L125-L150)). Variable names do not appear.
- A transitive path's key is its min and max distance, its two sides and its subtree's key ([TransitivePathBase.cpp L245 to L265](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/TransitivePathBase.cpp#L245-L265)). The comment there says "variable names are not found in the children's cache keys".

This is why renaming variables did not defeat the cache. It also means the two orderings of a trace pair can share subtrees: if both orderings contain the same scan, join or transitive path, the second one reads it warm even though its root is new.

The snapshot index in the key changes on a SPARQL UPDATE, so updates invalidate old entries ([QueryExecutionContext.h L75 to L92](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/QueryExecutionContext.h#L75-L92)). Our endpoints are read-only, so this does not happen here.

What is not cached:

- A result larger than `cache-max-size-single-entry` ([Cache.h L164 to L166](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/util/Cache.h#L164-L166)).
- A lazily computed (streamed) non-root result larger than `cache-max-size-lazy-result`, 5 MB ([RuntimeParameters.h L117 to L119](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/global/RuntimeParameters.h#L117-L119), [Operation.cpp L252 to L293](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Operation.cpp#L252-L293)). Fully materialized results (sorts, joins, transitive paths) are cached up to the single-entry cap.
- `SERVICE` results, unless `cache-service-results` is on ([RuntimeParameters.h L138 to L141](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/global/RuntimeParameters.h#L138-L141)). It is off on all three endpoints, and our queries use no `SERVICE`.

The planner does not change its plan because something is cached: `zero-cost-estimate-for-cached-subtree` is `false` on all three endpoints ([RuntimeParameters.h L131 to L134](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/global/RuntimeParameters.h#L131-L134)). A warm run uses the same plan as a cold one, just faster.

## 2. How long entries live, and what evicts them

There is no expiry time. The LRU score of an entry is the `steady_clock` time of its last access ([Cache.h L436 to L452](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/util/Cache.h#L436-L452)). Age only matters when something has to be removed. Entries leave the cache when:

1. **Count cap:** more than `cache-max-num-entries` entries. The least recently used one is removed ([Cache.h L351 to L358](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/util/Cache.h#L351-L358)).
2. **Size cap:** the total passes `cache-max-size`. Least recently used entries are removed until the new one fits.
3. **Memory for queries:** the cache shares the server's query memory. When a running query cannot allocate, the allocator calls `makeRoomAsMuchAsPossible`, which evicts LRU entries, or clears every unpinned entry if that is still not enough ([Qlever.cpp L73 to L81](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/libqlever/Qlever.cpp#L73-L81), [Cache.h L367 to L381](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/util/Cache.h#L367-L381)). A heavy query from another user can push our entries out.
4. **`cmd=clear-cache`:** removes all unpinned entries (section 3).
5. **Restart:** the cache is in memory only, so a restart or a new pod starts empty.

Pinned entries are exempt from the count cap ([Qleverfile docs](https://docs.qlever.dev/qleverfile/)). None of the three endpoints has any pinned entries today.

### The live endpoints (2026-11-07, about 05:10 UTC)

From `cmd=get-settings` and `cmd=cache-stats`, both read-only and open to anyone:

| Endpoint      | Max entries | Max size | Max single entry | Entries now | Bytes now           | `disable-caching` exists |
| ------------- | ----------- | -------- | ---------------- | ----------- | ------------------- | ------------------------ |
| `federation`  | 1000        | 15.4 GB  | 3.8 GB           | 46          | 6.50 GB (42% full)  | no (26 settings)         |
| `hydrologykg` | 1000        | 2.9 GB   | 716 MB           | 1, then 2   | 0 to 8 bytes        | yes, `false`             |
| `spatialkg`   | 1000        | 5.7 GB   | 1.4 GB           | 1           | 0 bytes             | yes, `false`             |

What this says:

- **`federation`, where traces and facility and sample queries run** (`engine/planner.ts`, `engine/entities/*.ts`), had 46 entries and 6.5 GB, and the numbers did not move over about ten minutes. It is far from both caps, so nothing forces eviction. A trace subtree cached there today can still be warm tomorrow.
- `federation` runs an older QLever: it reports 26 settings, against 46 on the other two, and lacks `disable-caching` (added in [#2758](https://github.com/ad-freiburg/qlever/pull/2758), merged 2026-03-09) and `default-query-timeout`. So the newer switch below is not available there even to its operators, short of an upgrade.
- **`hydrologykg` and `spatialkg` sit behind a KEDA HTTP autoscaler.** Their responses carry `x-keda-http-cold-start: false`, the header KEDA's interceptor sets to report whether the request had to start a replica ([kedacore/http-add-on headers.go](https://github.com/kedacore/http-add-on/blob/main/pkg/http/headers.go)). Our first `cmd=cache-stats` to each timed out after 20s with no response, and the next one answered in 0.14s with a one-entry, zero-byte cache: consistent with a scale-up from zero just then, though we cannot see the scaler's settings. KEDA scales to zero after `cooldownPeriod` with no traffic, 300s by default ([KEDA ScaledObject spec](https://keda.sh/docs/2.18/reference/scaledobject-spec/)). When a replica is removed its cache is gone. `federation` responses carry no KEDA header.

## 3. Can one request skip or clear the cache?

**Per-request bypass: no.** The HTTP parameters that touch the cache are:

| Parameter                                                                            | Effect                                                         | Token needed            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------- |
| `pin-result=true`, `pin-subresults=true`, `pin-result-with-name=...`                 | keep results in the cache (the opposite of bypass)             | named pin: yes          |
| `cmd=cache-stats`                                                                    | read counts and bytes                                          | no                      |
| `cmd=clear-cache`                                                                    | remove all unpinned entries, server-wide                       | **no**                  |
| `cmd=clear-cache-complete`                                                           | remove everything, pinned too                                  | yes                     |
| `disable-caching=true` (any runtime parameter as a URL parameter)                    | turn caching off for all later queries, server-wide            | yes                     |

Sources: the command table in [Server.cpp L575 to L582](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Server.cpp#L575-L582) and its dispatch in [L759 to L766](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Server.cpp#L759-L766); the pin parameters in [HttpApiHelpers.cpp L75 to L89](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/HttpApiHelpers.cpp#L75-L89); runtime parameters set over HTTP in [Server.cpp L688 to L708](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Server.cpp#L688-L708).

- `disable-caching` is a global runtime parameter ([RuntimeParameters.h L241 to L245](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/global/RuntimeParameters.h#L241-L245)). Every query context reads it when it is created (`DisableCaching::FromRuntimeParameter`, [Server.cpp L395 to L397](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/engine/Server.cpp#L395-L397)), so it cannot be scoped to one request. Tested: sending `disable-caching=true` with a query to `hydrologykg` returns `403 setting runtime parameters requires a valid access token`.
- HTTP cache headers do nothing. Tested: a repeat COUNT on `hydrologykg` with `Cache-Control: no-cache` and `Pragma: no-cache` still came back `cached_not_pinned` in 1 ms.
- `cmd=clear-cache` needs no token (`requiresAuth_` is `false` in the table above), and it is what QLever's own benchmark tool does between queries: `qlever benchmark-queries --clear-cache yes` sends `curl <endpoint> -d cmd=clear-cache` before each query ([benchmark_queries.py L632 to L635](https://github.com/ad-freiburg/qlever-control/blob/84bdd27435bd93f2dc70269c30eefbb8d36d916e/src/qlever/commands/benchmark_queries.py#L632-L635), [clear_cache.py L49](https://github.com/ad-freiburg/qlever-control/blob/84bdd27435bd93f2dc70269c30eefbb8d36d916e/src/qlever/commands/clear_cache.py#L49)). On a shared endpoint it also wipes the warm results that make the explorer and other users fast, so it needs the endpoint operators' agreement first. We did not send it.

**Changing the query** changes only the keys of the nodes you change. Any subtree left identical still hits. Making the expensive subtree differ (a different constant inside it) also changes what is measured, so it is not a clean bypass.

## 4. How to know a run was cold

QLever reports cache status per node. Send the query with `Accept: application/qlever-results+json` and walk `runtimeInformation.query_execution_tree`: each node has `cache_status`, one of `computed`, `cached_not_pinned`, `cached_pinned` or `not_in_cache_not_computed` ([ConcurrentCache.h L44 to L60](https://github.com/ad-freiburg/qlever/blob/4b9df11d36e999e43caf89da26cd912bf942f274/src/util/ConcurrentCache.h#L44-L60)).

Measured on `federation`, the same tiny COUNT (`?s a geo:Feature`, 8,690,704) twice:

| Run | Total  | Root (GroupBy)                | Child (IndexScan)          |
| --- | ------ | ----------------------------- | -------------------------- |
| 1   | 394 ms | `computed`, 232 ms            | `computed`, 161 ms         |
| 2   | 15 ms  | `cached_not_pinned`, 0 ms     | `computed`, 161 ms (stored) |

When a node is read from cache, its children are not run again, and the tree shows their stored runtime info from the original run. So the test is: **a run is cold if no node anywhere in the tree reports `cached_not_pinned` or `cached_pinned`.** If the root is `computed` but some inner node is `cached_*`, the run was partly warm. The same check would have flagged the shape in the first sweep that was purely cache.

## 5. What this means for #133

- Spacing runs hours apart is neither needed nor enough. On `federation` an entry lives until LRU pressure or a restart, and with 46 of 1000 entries and 6.5 of 15.4 GB used, there is little pressure.
- The direct fix is to record, for each timed run, whether any node was `cached_*` (one extra `Accept` header, the timings come back in the same response). Runs that were warm are discarded or rerun, instead of hoping time made them cold.
- Running the two orderings of a pair against a cold cache needs a cache clear between them, which on `federation` only `cmd=clear-cache` can do. That is a question for the apps.okn.us operators, not something to send on our own.
- Shared subtrees between the two orderings are a real effect even when the root differs. Running the smaller-side-led query first (the standing preference in #133) does not prevent the second from reusing the first's scans; only the per-node check shows how much it did.
