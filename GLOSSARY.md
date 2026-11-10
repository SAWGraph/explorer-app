# SAWGraph Explorer

The explorer answers questions about PFAS contamination by joining two blocks of entities (samples, facilities, water bodies, wells, aquifers, streams) through the SAWGraph knowledge graph.

## Language

**Start side**:
The side of a question (target or anchor) that the engine writes its query from first.
_Avoid_: lead, lead side, seed side

**Tied**:
Said of a question whose two sides have the same rank (pinned, region, filter or nothing), so rank alone cannot choose the start side.
_Avoid_: same-rank, even

**Subdivision link**:
An entity's direct tie to the county subdivision it sits in (a town, a township, or a census county division where a state has neither), through which it belongs to a county and a state.
_Avoid_: AR3 integration, county link

**Cold run**:
A timed run of a query in which the server computed the expensive work fresh instead of reading it from its cache. Small shared parts (all flowlines, all cells of a state) may still come from the cache, as they do for a user's first run of a question.
_Avoid_: uncached run, clean run

**Warm run**:
A timed run that read part of its expensive work from the server's cache, so its time does not count.
_Avoid_: cached run
