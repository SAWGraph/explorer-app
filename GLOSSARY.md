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
An entity's direct tie to the county subdivision it sits in (a town, a township, or a census county division where a state has neither), through which it belongs to a county and a state. A point (a well) has one. A polygon (an aquifer) has one for every subdivision it lies within, overlaps or contains, and is in a region when any of them is.
_Avoid_: AR3 integration, county link

**Groundwater-connected**:
A relationship between two entities that sit on the same aquifer, so they may share groundwater. It does not mean that water flows between them: two wells on one aquifer can draw from layers that do not mix. An entity sits on an aquifer when it lies over it or within about 1 km of its edge, and the same test applies to both sides. The aquifer links them but is not one of the question's two sides.
_Avoid_: aquifer-connected, shares an aquifer, via aquifer

**Aquifer system**:
A group of aquifers that the source data counts as one unit. Two entities on different aquifers of the same system are not groundwater-connected.
_Avoid_: aquifer (for the group)

**Regional aquifer**:
An aquifer that covers more than about 1,000 km², such as a bedrock aquifer under half of a state. Groundwater-connected does not link through one, because nearly everything in the state sits on it.
_Avoid_: big aquifer, large aquifer

**Cold run**:
A timed run of a query in which the server computed the expensive work fresh instead of reading it from its cache. Small shared parts (all flowlines, all cells of a state) may still come from the cache, as they do for a user's first run of a question.
_Avoid_: uncached run, clean run

**Warm run**:
A timed run that read part of its expensive work from the server's cache, so its time does not count.
_Avoid_: cached run
