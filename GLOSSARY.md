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
