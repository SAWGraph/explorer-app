# SAWGraph Query Editor — Architecture Guide

A comprehensive guide to understanding how this application works, from knowledge graphs to query pipelines.

---

## Table of Contents

1. [Knowledge Graphs 101](#knowledge-graphs-101)
2. [High-Level Architecture](#high-level-architecture)
3. [Folder Structure](#folder-structure)
4. [Data Flow](#data-flow)
5. [The Query Pipeline](#the-query-pipeline)
6. [Bounded Execution](#bounded-execution)
7. [The Result Cache](#the-result-cache)
8. [SPARQL Queries](#sparql-queries)
9. [Key Design Decisions](#key-design-decisions)
10. [The Endpoints](#the-endpoints)
11. [Common Patterns](#common-patterns)
12. [Debugging Tips](#debugging-tips)

---

## Knowledge Graphs 101

### What is a Knowledge Graph?

A knowledge graph is a database that stores information as **triples**: `(subject, predicate, object)`. Think of it like sentences:

- "Facility_123 **is located in** Illinois"
- "Facility_123 **has industry** NAICS-3253"
- "S2Cell_456 **contains** Facility_123"

Each triple connects two entities (subject and object) with a relationship (predicate).

### Why Use Knowledge Graphs?

Unlike SQL databases with fixed table schemas, knowledge graphs:
- **Connect anything to anything** — no rigid tables
- **Follow relationships** — traverse connections like "find all facilities → in S2 cells → connected to Maine"
- **Integrate multiple datasets** — combine EPA facility data, PFAS samples, hydrology data seamlessly

### SPARQL = SQL for Knowledge Graphs

SPARQL is the query language for knowledge graphs. It pattern-matches against triples:

```sparql
SELECT ?facility ?name WHERE {
  ?facility rdf:type fio:Facility .        # Find all facilities
  ?facility rdfs:label ?name .              # Get their names
  ?facility fio:ofIndustry naics:NAICS-3253 . # Filter by industry
}
```

This finds all facilities with industry code 3253 and returns their names.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Interface                       │
│  (Dashboard + Query Editor + Map)                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Result Cache                            │
│  A hit here skips everything below (server/ + Postgres)     │
└────────────────┬────────────────────────────────────────────┘
                 │ miss
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Query Pipeline                          │
│  (Planner → Executor → Result Transformer)                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   SPARQL Query Templates                     │
│  (fusedQueries · hydrate · regions · wells · aquifers)      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     SPARQL Endpoints                         │
│  fiokg │ sawgraph │ spatialkg │ hydrologykg │ federation   │
└─────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Graphs                          │
│  (RDF triples, served by QLever)                            │
└─────────────────────────────────────────────────────────────┘
```

**The flow:**
1. User builds a question from three blocks: "samples" + "near" + "landfills in Maine"
2. If that exact question is already cached, the answer comes back in one request
3. Otherwise the planner breaks it into steps
4. Each step generates a SPARQL query and runs against the right endpoint
5. A step that is too big for the engine is split and retried in slices
6. Results transform into map features
7. Map displays points, lines and polygons

---

## Folder Structure

```
explorer/
├── src/
│   ├── components/          # React UI components
│   │   ├── Dashboard/       # Pre-built query cards
│   │   ├── QueryEditor/     # Block A / Relationship / Block C editors
│   │   ├── Map/             # Leaflet map + one layer component per entity type
│   │   ├── Pipeline/        # Progress strip, partial-results notice
│   │   ├── Publish/         # Share a question and its result by link
│   │   ├── DesignSystem/    # Design guide route
│   │   ├── common/          # FlatSelect, HierarchicalSelect, shared bits
│   │   └── Layout/          # Header, sidebar, layout
│   │
│   ├── engine/              # THE CORE: query planning and execution
│   │   ├── planner.ts       # Question → pipeline steps
│   │   ├── executor.ts      # Runs steps, splits what the engine refuses
│   │   ├── scope.ts         # How to slice a step that was too big
│   │   ├── sparqlClient.ts  # Sends SPARQL, retries, 60s request timeout
│   │   ├── sparqlErrors.ts  # Classifies failures (a 429 is usually a timeout)
│   │   ├── queryBreadth.ts  # Pre-flight warning for questions that reliably fail
│   │   ├── cacheKey.ts      # Canonical question → cache key
│   │   ├── wire.ts          # What a cached result looks like on the wire
│   │   ├── resultTransformer.ts # SPARQL rows → map features
│   │   └── templates/       # SPARQL builders
│   │       ├── fusedQueries.ts   # The main one: spatial + hydrological joins
│   │       ├── hydrate.ts        # Fetch details for a known list of IRIs
│   │       ├── regions.ts        # Dropdown discovery queries
│   │       ├── downstreamSamples.ts
│   │       ├── wells.ts · aquifers.ts
│   │       ├── facilities.ts · samples.ts  # Shared fragments, not whole queries
│   │       └── spatial.ts        # Region boundary geometry
│   │
│   ├── api/                 # Talks to our own API (not to SPARQL)
│   │   ├── resultCacheClient.ts
│   │   └── publishClient.ts
│   │
│   ├── store/queryStore.ts  # Zustand: the question, results, view state
│   ├── storage/             # localStorage: saved questions, publish tokens
│   ├── hooks/               # React Query + pipeline hooks
│   ├── types/               # AnalysisQuestion, MapFeature, SPARQL rows
│   └── constants/           # Endpoints, prefixes, regions, prebuilt queries
│
├── server/                  # Express + Postgres API (deployed separately)
│   └── src/
│       ├── resultCache.ts   # Gzipped results in Postgres, with TTLs
│       ├── routes/results.ts   # Public read, token-gated write
│       └── routes/publish.ts   # Published questions
│
├── scripts/                 # Maintainer tools (tsx)
│   ├── warm-cache.mts       # Run the dashboard questions, upload the results
│   ├── check-cache-key.mts  # Assertions on cache-key canonicalisation
│   └── query-matrix.mts     # Measure every query shape, write the CSV
│
└── docs/                    # See CLAUDE.md for the full map
```

**Key directories:**
- **`engine/`** — The brain. All query logic lives here.
- **`components/`** — React UI. Organized by screen area.
- **`store/`** — Zustand for global state (the current question and results).
- **`hooks/`** — React Query for async data fetching (dropdown population).
- **`server/`** — The only part that is not a static bundle. Holds the cache.

---

## Data Flow

### 1. User Builds a Question

User selects in the UI:
- **Block A** (target): "Samples"
- **Relationship**: "near"
- **Block C** (anchor): "Landfills" (NAICS 562212)
- **Region**: "Penobscot County, Maine"

This creates an `AnalysisQuestion` object (`src/types/query.ts`):

```typescript
{
  blockA: {
    type: 'samples',
    region: {
      stateCode: '23',
      countyCodes: ['23019'],
      countyLabels: { '23019': 'Penobscot County, Maine' }  // display only
    }
  },
  relationship: { type: 'near', hops: 1 },
  blockC: {
    type: 'facilities',
    facilityFilters: { industryCodes: ['562212'] }
  }
}
```

Six entity types are available for either block: `samples`, `facilities`,
`waterBodies`, `wells`, `aquifers`, `streams`. Four relationships: `near`
(with `hops`), `within`, `downstream` and `upstream` (each with an optional
`maxDistanceKm`).

The `*Labels` maps exist only to render chips in the editor. They never reach a
query, and `cacheKey.ts` strips them, so re-picking the same county with
different label text still hits the cache.

### 2. Planner Creates Pipeline Steps

`planner.ts` converts the question into a sequence of steps. For the question
above:

```typescript
[
  FIND_TARGET_IRIS       // federation — which samples are near a landfill?
  FIND_ANCHOR_IRIS       // federation — which landfills have a sample nearby?
  HYDRATE_TARGET_BY_IRI  // federation — details for those samples
  HYDRATE_ANCHOR_BY_IRI  // federation — details for those landfills
  GET_REGION_BOUNDARIES  // spatialkg  — the county outline to draw
]
```

The full vocabulary is seven step types (`planner.ts` `PipelineStepType`). Two
more appear for hydrological questions: `GET_FLOWLINE_GEOMETRIES` draws the
river reaches, and `GET_SAMPLE_DETAILS` exists but is no longer emitted —
per-sample observations are fetched on demand when a popup opens
(`useSampleDetails.ts`), because fetching them up front cost 18–37 MB per run.

Each step specifies:
- **Type** (what kind of operation)
- **Endpoint** (which knowledge graph to query)
- **Description** (shown to user during execution)
- **Query builder** — `(context, scope?) => string`
- **`divide`** (optional) — how to slice this step if it is too big
- **`optional`** (optional) — if true, a failure here does not abort the run

**Find first, then hydrate.** The discovery steps return bare IRIs and nothing
else; the hydrate steps take that list and fetch geometry, labels and
measurements for exactly those entities. Keeping them apart is what stopped an
ID-finding query from building every measurement in the state and throwing it
away — see `docs/QUERY-MATRIX.md` Part 5.

**Which block seeds the trace, and which way it runs.** The templates know
nothing about block A and block C. They take an *anchor* (the side the query
seeds from, bound into `?s2anchor`) and a *target*, and they trace in one
direction only: the target comes out `direction` of the anchor. So the planner
has to decide two separate things, and they are not independent.

| Relationship | Anchor is | Target is | Trace runs | Why the anchor is forced |
| --- | --- | --- | --- | --- |
| `A near C` | block C | block A | n/a | symmetric, either side works |
| `A downstream from C` | block C | block A | downstream | C is the upstream side |
| `A upstream from C` | **block A** | block C | **downstream** | A is the upstream side, and seeding from an unfiltered C ("every stream in the country") times out |

Read the table by its last column and the rule is one line: **the anchor is
always the upstream side of the question, so the trace always runs downstream
from the seed.** Which block that is flips for `upstream`, which is the reason
the two decisions have to be made separately rather than passing
`relationship.type` through as the direction. Doing exactly that answered the
mirror question for every upstream shape until 2026-09-16
(`docs/DEBUGGING.md`, 2026-09-16), and it is guarded now by
`scripts/check-trace-direction.mts`, which reads the emitted SPARQL rather than
the flag, because three separate builders trace and they all have to agree.

### 3. Executor Runs the Steps

`executor.ts` runs steps in order, but each step is more than one request.

```typescript
// Simplified from executor.ts runStep()
const queue: (Scope | undefined)[] = [undefined];   // undefined = the whole query

while (queue.length) {
  const scope = queue.shift();
  try {
    rows = await executeSparql(step.endpoint, step.buildQuery(context, scope));
    merge(rows);                       // deduped by JSON.stringify(row)
  } catch (err) {
    if (isSplittable(err) && step.divide) {
      queue.unshift(...await step.divide(scope));   // try it in smaller pieces
    } else {
      failed.push(scope?.label ?? 'whole query');
    }
  }
  if (Date.now() - stepStart > STEP_CEILING_MS) {   // 300s per step
    skipped.push(...remaining);
    break;
  }
}
```

**Try whole, then split.** Every step is attempted in one request first. Only
the slices that actually fail get divided, so a question that fits pays nothing
for the machinery.

**The slice is chosen per question** (`scope.ts` `chooseAxis`). Which axis is
right flips between states: Maine has 4,528 samples and 2,976 facilities,
Illinois has 78 and 22,574 — so there is no fixed answer to "which side should
we chunk". `chooseAxis` probes both sides in parallel (`LIMIT 201`, cheap), uses
whichever it can enumerate, and falls back to splitting by county. When even
that runs out — a question already scoped to a *single* county, with both sides
past the cheap probe limit — it probes the filtered side once more with a much
higher limit and chunks that. That last resort exists because a single county
is not divisible and the run would otherwise fail outright: 411 Cook County
facilities enumerate fine and chunk into slices of 25 that each answer in
seconds. A slice that still fails is `halve`d until it cannot be divided
further.

**A run can succeed with pieces missing.** `PartialFailure` distinguishes
*failed* slices (refused even at minimum size — the question needs changing)
from *skipped* ones (the 300s ceiling ran out — running it again may finish).
`PartialResultsNotice.tsx` names them: "York County, Maine could not be
answered".

**Early exit.** If `FIND_TARGET_IRIS` returns nothing, the run stops there —
there is no point hydrating an empty list.

**What threads between steps** is `context.targetIris` / `context.anchorIris`,
the entity IRIs found by the discovery steps. (It used to be S2 cells; see
Key Design Decision 2.)

### 4. Result Transformer → Map Features

`resultTransformer.ts` converts SPARQL rows to GeoJSON-like features:

**Input (SPARQL row):**
```javascript
{
  sp: 'http://...samplePoint123',
  spWKT: 'POINT(-69.7795 44.3106)',
  substances: 'PFOA; PFOS',
  max: '45.2'
}
```

**Output (MapFeature):**
```javascript
{
  id: 'samplePoint123',
  geometry: {
    type: 'Point',
    coordinates: [44.3106, -69.7795] // [lat, lon] for Leaflet
  },
  properties: {
    type: 'sample',
    substances: 'PFOA; PFOS',
    maxConcentration: 45.2
  }
}
```

Handles Point, LineString, Polygon, MultiPolygon geometries.

### 5. Map Renders Layers

React components in `components/Map/` render features, one per entity type:
- `SampleLayer` — sample points, coloured by concentration
- `FacilityLayer` — facility markers
- `WaterBodyLayer` — water body polygons and lines
- `WellLayer` — wells
- `StreamLayer` — river reaches from `GET_FLOWLINE_GEOMETRIES`
- `AquiferBoundaryLayer` — aquifer polygons
- `RegionBoundaryLayer` — county and state outlines

`useMapLayers.ts` decides which to build by row shape: a `spWKT` column means
samples, `facWKT` facilities, `wbWKT` water bodies.

---

## The Query Pipeline

### What is a Pipeline Step?

Each step is an object (`planner.ts`):

```typescript
{
  type: 'FIND_TARGET_IRIS',
  endpoint: 'federation',
  description: 'Finding nearby samples',
  buildQuery: (context, scope) => buildFusedNearQuery({ ... }),
  divide: (scope) => /* smaller scopes to try instead */,
}
```

`scope` is what makes a step splittable: `undefined` means "the whole thing",
and anything else narrows it to a list of anchor IRIs, target IRIs, or counties.

### Example: "Samples near landfills" Pipeline

The question: *what samples in Penobscot County, Maine are near a landfill
(NAICS 562212)?*

#### Step 1: FIND_TARGET_IRIS

**Endpoint:** `federation`

**SPARQL generated** (prefixes omitted):
```sparql
SELECT DISTINCT (?spC AS ?iri) WHERE {
  ?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
  ?s2anchor kwg-ont:sfContains ?facilityA .
  ?facilityA fio:ofIndustry ?industryCodeA .
  ?industryCodeA a naics:NAICS-IndustryCode .
  VALUES ?selectedIndustryA { naics:NAICS-562212 }
  FILTER(?industryCodeA = ?selectedIndustryA
         || EXISTS { ?industryCodeA fio:subcodeOf ?selectedIndustryA })

  ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2target .
  ?s2target rdf:type kwg-ont:S2Cell_Level13 ;
            spatial:connectedTo kwgr:administrativeRegion.USA.23019 .
  ?spC rdf:type coso:SamplePoint ;
       spatial:connectedTo ?s2target .
}
```

**What this does** — all of it in one query:
- find the S2 cells holding a landfill (`?s2anchor`)
- step one cell outwards (`sfTouches`), which is the "near" in the question
- keep only neighbours inside Penobscot County
- return the sample points in them

The `FILTER ... EXISTS ... fio:subcodeOf` is what makes picking a parent NAICS
code also match its children.

**Result:** 14 sample point IRIs.

#### Step 2: FIND_ANCHOR_IRIS

The mirror image — the same join, returning `?facilityA` instead. This is not
redundant: it answers "which landfills actually had a sample nearby", so the map
draws only the facilities that took part.

**Result:** 5 facility IRIs.

#### Steps 3–4: HYDRATE_*_BY_IRI

Now that the IDs are known, fetch what the map needs for exactly those, with
the IRIs pinned in a `VALUES` block (`hydrate.ts`):

```sparql
SELECT (COUNT(DISTINCT ?observation) AS ?resultCount)
       (MAX(?numericResult) AS ?max)
       (GROUP_CONCAT(DISTINCT ?substance; separator="; ") AS ?substances)
       ?sp ?spWKT ?s2cell
WHERE {
  VALUES ?sp { <...samplePoint1> <...samplePoint2> ... }
  ?sp spatial:connectedTo ?s2cell ;
      geo:hasGeometry/geo:asWKT ?spWKT .
  ?observation coso:observedAtSamplePoint ?sp ;
               coso:ofDSSToxSubstance ?substance ;
               coso:hasResult ?result .
  ...
} GROUP BY ?sp ?spWKT ?s2cell
```

**Result:** 13 sample rows, 5 facility rows. (13, not 14 — one sample point has
no observation matching the filters.)

#### Step 5: GET_REGION_BOUNDARIES

**Endpoint:** `spatialkg` — the county outline to draw under the points.

**Result:** 16 geometry rows. Whole pipeline: **26.6 s**.

#### When a step finds nothing

Ask the same question with NAICS 3253 (paint manufacturing) instead and Step 1
returns zero IRIs — there are none in Penobscot County. The run stops there in
**1.2 s** rather than hydrating an empty list, and the UI shows "no results"
rather than an error. An empty answer is a valid answer.

### Why S2 Cells?

**S2 cells** are Google's spatial index — they divide Earth into hierarchical grid cells. Level 13 ≈ 1.2km².

**Why we use them:**
- **Fast spatial queries** — instead of computing "is point X within 10km of point Y?" for millions of combinations, we just check "do they share an S2 cell?"
- **Pre-computed in the knowledge graph** — facilities, samples, water bodies all have `spatial:connectedTo` links to S2 cells
- **Hierarchical** — can zoom in/out by changing level

```
S2 Cell Hierarchy:
Level 0  = whole Earth
Level 10 = ~102 km²
Level 13 = ~1.2 km²   ← We use this
Level 16 = ~76 m²
Level 30 = ~1 cm²
```

---

## Bounded Execution

The graph is served by **QLever**, which gives a query 30 seconds and then kills
it. The most important thing to know about this: **it reports that timeout as
HTTP 429 "Too Many Requests"**, with the real cause only in the JSON body. It is
not rate limiting, and backing off does not help.

`sparqlErrors.ts` classifies what comes back:

| Kind | How it arrives | Splitting helps? |
| --- | --- | --- |
| `timeout` | 429 + "Operation timed out" / "Sort operation was canceled" | yes |
| `out-of-memory` | 500 + "Tried to allocate X, but only Y were available" | yes |
| `payload-too-large` | 413 / 502 — our request body was too big | yes |
| `sibling-failure` | 500 + "Waited for a result from another thread" | no — just retry |
| `network` | fetch rejected, or a 200 whose JSON was truncated | no |

`isSplittable(kind)` is what the executor consults before dividing a step.

Two guards sit around every request: a **60 s client-side timeout**
(`sparqlClient.ts`) so a hung request cannot stall a run, and one automatic
retry on retryable kinds — a repeat query starts warm, and 26.5 s cold vs 1.5 s
warm has been measured on the same query.

`queryBreadth.ts` catches a few shapes before they are ever sent: statewide,
broad NAICS, no substance filter is a combination that reliably fails, and the
editor warns rather than spending 30 s proving it.

**The measurements for all of this live in `docs/QUERY-MATRIX.md`** — Part 4 is
the error catalogue, Parts 6 and 7 the before/after. They are not repeated here
because they are re-measured as the graph changes.

---

## The Result Cache

A dashboard question takes seconds to compute and gives the same answer to
everyone who asks it. So the answer is stored and served directly:
**37 ms cached against 6,604 ms live** on a warm engine, with identical rows.

**The key** (`cacheKey.ts`) is a SHA-256 of the canonicalised question. What
canonicalisation does matters more than the hash:
- display-only fields (`countyLabels` and friends) are stripped
- filter arrays are sorted — clicking three substances in a different order is
  the same question
- empty objects and arrays collapse to "not set", so a filter set and then
  cleared still hits
- everything else is kept verbatim. A field dropped from the key is a wrong
  answer served; a field kept unnecessarily is only a cache miss.

`WIRE_VERSION` and `DATA_VERSION` prefix the key so a change to the stored shape,
or a knowledge-graph reload, makes every existing entry unreachable at once.

**Nothing in the key describes the engine**, which matters when a fix changes
what a question *means* rather than what it stores. Cached answers to the old
meaning stay reachable for their full 30 days and will be served in preference
to running the corrected query. After a semantics fix, purge the affected
entries by question shape rather than bumping `WIRE_VERSION`, which would throw
away every unaffected entry too:

```sql
DELETE FROM query_results WHERE question->'relationship'->>'type' = 'upstream';
SELECT id, title, author FROM published_workflows
  WHERE question->'relationship'->>'type' = 'upstream';   -- frozen under publish:<id>
```

**What is stored** (`wire.ts`): successes only. An error is nearly always
transient endpoint load, and freezing one would turn a bad minute into a bad
month; an empty result is cheap to recompute. Only the four keys the map
actually renders are kept — the intermediate IRI lists ran to 22.6 MB on a
statewide well question and are never drawn.

**Who can write.** Reads are public; writes are not. The publisher writes the
result it has just computed, authenticated by the `editToken` the server issued
for that publication. The maintainer script `scripts/warm-cache.mts` writes with
`CACHE_WRITE_TOKEN`. Nothing else can put an entry in front of someone else's
map.

**Storage** (`server/src/resultCache.ts`): gzipped into a Postgres `BYTEA`
column and served with `Content-Encoding: gzip` — never decompressed on the
server. Capped at 25 MB. Complete results live 30 days; partial ones 6 hours,
because a partial result is a snapshot of a bad moment.

Add `?cache=off` to any URL to force a live run.

---

## SPARQL Queries

### SPARQL Basics

SPARQL queries have three parts:

1. **Prefixes** — Namespace shortcuts
2. **SELECT** — What to return
3. **WHERE** — Pattern to match

Example:

```sparql
PREFIX fio: <http://w3id.org/fio/v1/fio#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?facility ?name WHERE {
  ?facility rdf:type fio:Facility .
  ?facility rdfs:label ?name .
  ?facility fio:ofIndustry naics:NAICS-3253 .
}
```

**Reads like:** "Find things called `?facility` where:
- `?facility` has type `fio:Facility`
- `?facility` has label `?name`
- `?facility` has industry `naics:NAICS-3253`"

The `?` variables get bound to actual values from the graph.

### How Our Templates Work

Templates are functions that return a SPARQL string. The main one is
`fusedQueries.ts`, and its central idea is a helper that binds one entity inside
an S2 cell:

```typescript
// fusedQueries.ts — simplified
function bindEntityInCell(block: EntityBlock, cellVar: string, suffix: string) {
  switch (block.type) {
    case 'facilities':
      return `?${cellVar} kwg-ont:sfContains ?facility${suffix} .
              ${industryFilter(block.facilityFilters)}`;
    case 'samples':
      return `?sp${suffix} rdf:type coso:SamplePoint ;
                spatial:connectedTo ?${cellVar} .
              ${sampleFilters(block.sampleFilters)}`;
    // wells, aquifers, streams, water bodies...
  }
}
```

Both blocks of a question go through it, once for the anchor cell and once for
the target cell, and the relationship supplies the path between the two cells.
That is the whole trick: "near" is `sfTouches`, and a trace is a flow-path join.

**One guard is worth knowing about.** `bindEntityInCell` takes a
`sampleObservations` flag. An ID-finding query needs the sample *points*; a
detail query needs every observation on them. Serving both callers from one
branch is what made a query to find sample IDs build every measurement in the
state and discard it — the bug behind most of `QUERY-MATRIX.md` Part 5.

The older `facilities.ts` and `samples.ts` are no longer whole-query builders.
They survive as fragment helpers — `buildIndustryValues()`,
`buildSampleFilterClauses()` — called from inside the fused builders.

### Common SPARQL Patterns

**1. VALUES — Filter a variable to specific options**
```sparql
VALUES ?substance { coso:PFOA coso:PFOS coso:PFNA }
?observation coso:ofSubstance ?substance .
```
Only matches observations of PFOA, PFOS, or PFNA.

**2. OPTIONAL — Don't fail if missing**
```sparql
?facility rdfs:label ?name .
OPTIONAL { ?facility schema:address ?address . }
```
Returns facilities even if they don't have an address.

**3. FILTER — Conditional filtering**
```sparql
?result coso:measurementValue ?value .
FILTER (?value > 50)
```
Only results with value > 50.

**4. Property paths — Follow relationships**
```sparql
?facility geo:hasGeometry/geo:asWKT ?wkt .
```
Equivalent to:
```sparql
?facility geo:hasGeometry ?geom .
?geom geo:asWKT ?wkt .
```

**5. BIND — Create new variables**
```sparql
BIND(REPLACE(STR(?region), ".*USA\\.", "") AS ?stateFIPS)
```
Extracts "23" from "kwgr:administrativeRegion.USA.23".

---

## Key Design Decisions

### 1. Why Separate Planning and Execution?

**Problem:** A query like "samples near facilities" could be implemented many ways:
- Start from samples, find nearby facilities?
- Start from facilities, find nearby samples?
- Which endpoint for each step?

**Solution:** `planner.ts` encodes the strategy as a declarative pipeline. `executor.ts` just runs steps. This separates "what to do" from "how to do it."

**Benefits:**
- Easy to debug — see the plan before executing
- Easy to test — mock step results
- Easy to change strategy — edit planner, executor stays the same

### 2. Why Fuse the Join Into One Query

**The original design** threaded S2 cells between steps: find the cells holding
facilities on one endpoint, filter them to a region on another, expand to
neighbours, then look for samples in what was left. S2 cells were the join key
because a cross-endpoint join seemed impossible.

**What replaced it:** the `federation` endpoint does the join itself, so the
whole chain is one query (`fusedQueries.ts`). S2 cells are still the join
*mechanism* — `?s2anchor`, `?s2target` and the `sfTouches` between them — but
they are variables inside a single query rather than lists carried between
requests.

**Why it is better:**
- No intermediate list to transfer. A statewide cell list ran to megabytes.
- The engine can plan the whole join, instead of being handed a `VALUES` block
  of cells and no context.
- Fewer requests, so fewer chances to hit the 30 s limit.

**What it costs:** a fused query is one indivisible unit of work, so when it is
too big there is no natural seam. That is exactly what `scope.ts` exists to
supply — see [Bounded Execution](#bounded-execution).

### 3. Why Zustand + React Query?

**Zustand** (`queryStore.ts`) — Global state for:
- The current question, plus a baseline and a snapshot for the edit modal
- Pipeline results, step progress, and where the result came from
  (`resultProvenance` — live or cache, and when it was computed)
- UI state (view mode, modals, tour)

**React Query** (`useDiscoveryQueries.ts`) — Async data fetching for:
- Dropdown options (NAICS codes, substances, material types, counties)
- Long `staleTime` per hook, since this vocabulary changes on graph reloads
- Hardcoded fallbacks if endpoints fail, so the editor still works

**Benefits:**
- Separation of concerns (query state vs dropdown data)
- React Query handles loading/error/caching automatically
- Zustand is simpler than Redux

### 4. Why Templates Instead of a Query Builder?

**Could have used:** A query builder library (like SPARQL.js)

**We chose:** String templates (`templates/*.ts`)

**Why:**
- SPARQL queries are complex (property paths, FILTERs, OPTIONALs)
- Templates are readable — you see the actual SPARQL
- Easy to debug — copy query into SPARQL editor to test
- Full control — no library limitations

### 5. Why Each Filter Declares Its Own Joins

**Problem:** In SPARQL a triple pattern is an inner join, so *every required
triple is also a filter*. Asking for a field that some records lack deletes
those records, silently and with no filter anywhere in the query saying so.

**What went wrong:** `bindEntityInCell` used one boolean — did the user set any
sample filter? — and if so fetched the whole measurement record. Ticking a
substance therefore pulled in `coso:measurementUnit`, and a non-detect has no
unit (there is no quantity to put a unit on; the record carries detection limits
instead). So a substance-only question dropped **774 of 1,688** Cumberland PFOS
observations while "Include non-detects" sat ticked. Non-detects are 77% of
Maine's observations, so this understated PFAS presence across the app, and
nothing looked broken: the map still drew, with fewer dots.

**We chose:** `sampleJoinsNeeded` maps each active filter to the joins that
filter actually reads. Substance needs two triples. A concentration range
genuinely reads the unit, so that case keeps it. Nothing ever needs the material
*label*, which is display-only.

**The rule to carry into new templates:** fetch what you project or filter on,
nothing else, and reach for `OPTIONAL` the moment a field is not universal.
`scripts/check-query-joins.mts` asserts this across all 108 shapes in CI.

### 6. Why Transform SPARQL Rows to Features?

**Problem:** SPARQL returns flat rows with WKT strings:
```javascript
{ sp: '...', spWKT: 'POINT(-69.7 44.3)', substances: 'PFOA; PFOS' }
```

**Leaflet needs:** GeoJSON-like features with typed geometry:
```javascript
{ id: '...', geometry: { type: 'Point', coordinates: [44.3, -69.7] }, properties: {...} }
```

**Solution:** `resultTransformer.ts` parses WKT → coordinates, detects feature type from row shape, builds typed objects.

**Benefits:**
- Decouples SPARQL from React components
- Type-safe (TypeScript `MapFeature` interface)
- Handles all geometry types (Point, LineString, Polygon, MultiPolygon)

---

## The Endpoints

All endpoints are SPARQL query interfaces to different parts of the knowledge
graph, served by QLever. The counts below come from `docs/SCHEMA.md`, which is
where they get re-verified after a graph reload.

### fiokg
**Contains:** Facility data
**Classes:** `fio:Facility`
**Count:** 1.3M facilities across 13 states
**Key predicates:**
- `fio:ofIndustry` → NAICS industry codes
- `rdfs:label` → Facility name
- `geo:hasGeometry/geo:asWKT` → Point location
- `kwg-ont:sfWithin` → S2 cells, admin regions

**Used for:** the NAICS industry dropdown only (`useDiscoveryQueries.ts`).
Facility queries in the pipeline run on `federation` — see below.

### sawgraph
**Contains:** PFAS sample and observation data
**Classes:** `coso:MaterialSample`, `coso:ContaminantObservation`, `coso:SamplePoint`
**Count:** 28K samples, 705K observations
**Key predicates:**
- `coso:sampleOfMaterialType` → Water, soil, etc.
- `coso:ofSubstance` → PFOA, PFOS, etc.
- `coso:measurementValue` → Concentration (ng/L)
- `spatial:connectedTo` → S2 cells (via SamplePoint)

**Used for:** the substance and material-type dropdowns. Sample data reaches
the pipeline through `federation`.

### spatialkg
**Contains:** S2 cells, admin regions, spatial index
**Classes:** `kwg-ont:S2Cell_Level13`, `kwg-ont:AdministrativeRegion_2/3`
**Count:** 7.4M S2 cells, 35K counties, 6K states
**Key predicates:**
- `spatial:connectedTo` → Links S2 cells to regions
- `kwg-ont:sfContains` → Containment (region contains cells)
- `kwg-ont:sfTouches` → Neighboring cells
- `kwg-ont:hasFIPS` → FIPS codes

**Used for:** the county dropdown and `GET_REGION_BOUNDARIES`. Region filtering
and neighbour expansion now happen inside the fused query on `federation`.

### hydrologykg
**Contains:** Water bodies, flow paths, wells
**Classes:** `hyf:HY_WaterBody`, `hyf:HY_FlowPath`
**Count:** 73K water bodies, 435K flow paths
**Key predicates:**
- `spatial:connectedTo` → S2 cells
- `hyf:downstreamFlowPathTC` → 408M transitive closure triples
- `nhdplusv2:hasCOMID` → NHDPlus identifiers
- `schema:name` → Water body names

**Used for:** the hydrology data that the fused trace queries join against.

### federation
**Contains:** Nothing directly — it queries across all graphs
**How it works:** SPARQL federation joins data from multiple endpoints in a single query
**Caveat:** Performs owl:sameAs reasoning, inflating facility counts (1.3M real → 4.9M with aliases)

**Used for:** almost everything. Every discovery step and every hydrate step
runs here (`planner.ts`), because a fused query needs facilities, samples,
spatial and hydrology data in one place. Only `GET_REGION_BOUNDARIES` goes
elsewhere. Treat this as the primary endpoint, not a special case.

---

## Common Patterns

### Pattern 1: Find entities in a region

```sparql
?s2cell rdf:type kwg-ont:S2Cell_Level13 ;
        spatial:connectedTo kwgr:administrativeRegion.USA.23019 .   # the county
?sp rdf:type coso:SamplePoint ;
    spatial:connectedTo ?s2cell .
```

The region is a starting point, not a post-filter: the cells are selected by
county first, so the engine never looks outside it.

### Pattern 2: Spatial relationship (near)

```sparql
# anchor side
?s2anchor kwg-ont:sfContains ?facilityA .
?facilityA fio:ofIndustry naics:NAICS-562212 .

# the "near" — one hop of neighbouring cells
?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2target .

# target side
?spC rdf:type coso:SamplePoint ; spatial:connectedTo ?s2target .
```

`hops` repeats the middle line. At four or more hops `neighborPath()` drops the
`owl:sameAs` alternation, because the path expands as 2^N and runs the engine
out of memory.

### Pattern 3: Hydrological relationship (downstream)

```sparql
# anchor cells → the flow paths passing through them
?s2anchor kwg-ont:sfContains ?facilityA .
?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor .
?s2neighbor spatial:connectedTo ?upstream_flowline .
?upstream_flowline rdf:type hyf:HY_FlowPath .

# follow the network downstream
?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline .

# back to cells, and to what is in them
?s2target spatial:connectedTo ?ds_flowline .
?spC rdf:type coso:SamplePoint ; spatial:connectedTo ?s2target .
```

`hyf:downstreamFlowPathTC` is the pre-computed transitive closure, 408M triples.
`A TC B` means **B is downstream of A**, and it is reflexive — `<X> TC <X>`
returns a row, so a `?` quantifier after it is redundant.

Unbounded, this follows the river to the sea. `maxDistanceKm` wraps it in a
subquery that sums `nhdplusv2:hasFlowPathLength` along the path and drops
anything past the budget, then extends one segment further so the drawn line
does not stop mid-channel. On one Maine question, a 30 km bound cut 15,782
reaches to 3,705 while keeping all 616 facilities.

**A closure needs both ends bound, and a distance cap is not a substitute.** The
pattern above is safe because it ends at `?spC`, a real target. The stream layer
(`buildFusedFlowlineQuery`) drew its geometry from the seed side only, with
nothing on the right of the closure, and that is not a narrower version of the
same query — it is a fan-out to the end of the network. An anchor near a
drainage divide brought back the neighbouring basin: on "facilities upstream
from PFOS samples in York County, ME", 122 segments of the Merrimack and 21 of
the Winnipesaukee, 130 km away. Intersecting the closure with the flowlines that
reach the resolved targets removed 755 flowlines and added 0. A 25 km cap did
*not* prevent it, because the wrong basin was inside the budget. See
DEBUGGING.md, 2026-09-19.

**Upstream questions use this same pattern, unchanged.** There is no upstream
query. "A upstream from C" seeds from block A and traces downstream to block C,
which is the same relation read from the other end. The templates can build a
reversed trace (`?ds_flowline hyf:downstreamFlowPathTC ?upstream_flowline`) and
the planner never asks for one: a reversed trace is only correct if the seed is
the *downstream* side, and the seed is never that side, because the side that
seeds is the side the question filtered. See the anchor/target table under
[Planner Creates Pipeline Steps](#2-planner-creates-pipeline-steps).

---

## Debugging Tips

### 1. Read the docs first

- **`docs/SCHEMA.md`** — does this predicate exist, and on what? Predicate
  inventories with triple counts, per endpoint.
- **`docs/QUERY-MATRIX.md`** — Part 4 tells you what an HTTP status actually
  means. A 429 is almost never rate limiting.
- **`docs/DEBUGGING.md`** — bugs already diagnosed, with their root causes.

### 2. Bypass the cache

A result that looks stale may be cached. Add `?cache=off` to the URL to force a
live run.

### 3. Inspect pipeline steps

Set a breakpoint in `executor.ts` and log the query as built:

```typescript
console.log(step.type, step.description);
console.log(step.buildQuery(context, scope));   // note: scope is the 2nd arg
console.log(rows.length);
```

### 4. Test a query directly

Copy it from the console and run it against the endpoint the step used — they
are listed in `src/constants/endpoints.ts`. Most discovery steps run on
`federation`:

```
https://apps.okn.us/federation/sparql
```

### 5. If a step returns nothing

Check the IRI lists, not S2 cells:

```typescript
console.log('target IRIs:', context.targetIris.length);
console.log('anchor IRIs:', context.anchorIris.length);
```

An empty `FIND_TARGET_IRIS` ends the run and shows "no results". That is often
the correct answer — confirm the data exists before treating it as a bug.

### 6. Run the whole matrix

`npm run query-matrix` re-measures every query shape and writes
`docs/query-matrix/2026-09-14-raw-baseline.csv`. Slow, but it is how a regression gets proven rather
than suspected.

---

## Summary

**The app in one sentence:**
A React SPA that lets you build a spatial question from three blocks, compiles
it into SPARQL, runs it against distributed knowledge graph endpoints — slicing
the work when it is too big for them — and draws the answer on a map.

**Key concepts:**
- **Knowledge graphs** — Triples connecting entities
- **SPARQL** — Query language for graphs
- **S2 cells** — Spatial index, and the join key between entity types
- **Pipeline** — Planner builds steps, executor runs and splits them
- **Federation** — One query across several graphs

**Architecture highlights:**
- Planner creates steps, executor runs them and slices what the engine refuses
- Find IRIs first, hydrate them second — never build detail you will discard
- Spatial and hydrological joins are fused into one federated query
- Successful results are cached and served in ~37 ms instead of seconds
- A run can succeed with pieces missing, and says which pieces
- Result transformer parses WKT → GeoJSON
- Zustand for question state, React Query for dropdown data

**Six entity types:** samples, facilities, water bodies, wells, aquifers, streams

**13 states have data:** AL, AZ, AR, IL, IN, KS, ME, MA, MN, NH, OH, SC, VT
