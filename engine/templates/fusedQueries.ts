import { PREFIXES } from '../constants/prefixes';
import type { EntityBlock } from '../types/query';
import { entityFor, streamFtypeFilter } from '../entities';
import { leadSide } from '../sides';
import type { QuestionKind } from '../question';
import { wrapUri } from './samples';

// What a block's type knows (its IRI variable, how it binds inside a cell, its
// filters, its region check) lives in engine/entities/. These two read it for
// the query shapes below.
const iriVarOf = (block: EntityBlock, suffix: string): string => entityFor(block.type).iriVar(suffix);
const bindInCell = (block: EntityBlock, s2Var: string, suffix: string, observations = true): string =>
  entityFor(block.type).bindInCell(block, s2Var, suffix, observations);

function pinValues(entityVar: string, iris: string[] | undefined): string {
  if (!iris?.length) return '';
  return `VALUES ${entityVar} { ${iris.map(wrapUri).join(' ')} }\n      `;
}

// Lists a block's entities inside its region, capped at `limit`. Used to decide
// whether a side is small enough to chunk over: a bounded LIMIT probe rather
// than COUNT, because counting Maine's unfiltered facilities took 11.0s while
// the same listing with a filter took 0.8s (docs/QUERY-SWEEP.md).
export function buildEntityProbeQuery(
  block: EntityBlock,
  regionCodes: string[] | undefined,
  limit: number,
): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT (${iriVarOf(block, 'P')} AS ?iri) WHERE {${sideBody(block, regionCodes)}
    } LIMIT ${limit}
  `;
}

// How many entities a side has, before any relationship: the count the run
// takes of each side before discovery (engine/planner.ts). The same body as the
// probe, so a count of 0 means discovery finds nothing on that side. Measured
// live on 2026-11-06: 57 of 58 cold counts took 1.1s or less (the other was
// 20.5s, the first query against a cold server, and did not come back).
export function buildEntityCountQuery(block: EntityBlock, regionCodes: string[] | undefined): string {
  return `
    ${PREFIXES}
    SELECT (COUNT(DISTINCT ${iriVarOf(block, 'P')}) AS ?count) WHERE {${sideBody(block, regionCodes)}
    }
  `;
}

// One side on its own: its cells in its region, its entities in them, its
// filters. `false`, like the IRI-finding queries: the probe lists entity IRIs,
// and the list it returns becomes the chunk membership (engine/slicing.ts). A
// narrowing join here removes entities from every slice, so the probe (and the
// count) has to see exactly what discovery sees.
function sideBody(block: EntityBlock, regionCodes: string[] | undefined): string {
  const bind = bindInCell(block, '?s2probe', 'P', false);
  const region = regionClause(block, regionCodes, '?s2probe', 'P');
  return `
      ?s2probe rdf:type kwg-ont:S2Cell_Level13 .
      ${region}
      ${bind}`;
}

// Restricts a block's cell to the region. A type whose entity can sit in a cell
// that crosses the region's edge adds its own check that the entity itself is
// inside (wells, engine/entities/wells.ts).
function regionClause(
  block: EntityBlock,
  regionCodes: string[] | undefined,
  s2Var: string,
  suffix: string,
): string {
  if (!regionCodes?.length) return '';
  const iris = regionCodes.map((c) => `kwgr:administrativeRegion.USA.${c}`);
  const anyOf = (v: string) =>
    iris.length === 1 ? { values: '', region: iris[0] } : { values: `VALUES ${v} { ${iris.join(' ')} }\n      `, region: v };
  const cell = anyOf(`?_region${suffix}`);
  const cellClause = `${cell.values}${s2Var} spatial:connectedTo ${cell.region} .`;
  const entityCheck = entityFor(block.type).regionCheck?.(suffix, anyOf);
  if (!entityCheck) return cellClause;
  return `${cellClause}
      ${entityCheck}`;
}

// Builds a property-path fragment chaining N hops of (sfTouches | sameAs)
// between two S2-cell variables. The engine rejects the {,N} bounded form, so
// the path is emitted as a literal chain.
function neighborPath(hops: number, fromVar: string, toVar: string): string {
  if (hops <= 0) {
    return `BIND(${fromVar} AS ${toVar})`;
  }
  // ponytail: at hops>=4 the (sfTouches|sameAs) alternation OOMs the engine
  // (2^N path expansion). sfTouches alone is verified to return the same
  // result count at >=2 hops on the live endpoint.
  const useAlternation = hops <= 3;
  if (hops === 1) {
    return useAlternation
      ? `${fromVar} kwg-ont:sfTouches | owl:sameAs ${toVar} .`
      : `${fromVar} kwg-ont:sfTouches ${toVar} .`;
  }
  const step = useAlternation ? '(kwg-ont:sfTouches | owl:sameAs)' : 'kwg-ont:sfTouches';
  return `${fromVar} ${Array(hops).fill(step).join('/')} ${toVar} .`;
}

interface FusedBodyOpts extends FusedBaseOpts {
  // A trace always runs downstream from the anchor (engine/question.ts), so a
  // trace needs no direction.
  mode: 'near' | 'downstream';
  hops?: number;
  // Chunk pins (engine/slicing.ts). Restricting one side to a known slice of
  // IRIs is what makes a too-large query fit inside the engine's 30s budget.
  anchorIris?: string[];
  targetIris?: string[];
  // Set by the IRI-finding queries only; see bindInCell in the entity modules.
  anchorSampleObservations?: boolean;
  targetSampleObservations?: boolean;
  maxDistanceKm?: number;
}

// Extends the trace one flowline past the cutoff ("+1"). The budget runs out at
// whatever segment happens to fit, which is an artifact of how NHDPlus split
// the river rather than a real feature — without this the drawn path stops
// mid-channel. Matches David's second UC1-CQ2c notebook, where the total
// flowpath may deliberately exceed the threshold.
//
// The zero-or-one path yields the endpoint itself *and* its immediate
// neighbour in one triple. A UNION would express the same thing, but QLever —
// which the notebooks run against — returns unbound results for MIN() over a
// variable bound inside a UNION, so the path form keeps this portable across
// both hosts. Note the direction flip: downstream extends past the downstream
// end, upstream past the upstream end. hyf:downstreamFlowPath has no TC, so
// it is one segment.
function fringePath(direction: 'downstream' | 'upstream', endVar: string, outVar: string): string {
  return direction === 'downstream'
    ? `${endVar} hyf:downstreamFlowPath? ${outVar} .`
    : `${outVar} hyf:downstreamFlowPath? ${endVar} .`;
}

// Wraps the hydrology trace in a cumulative-length cutoff. The seed block is
// duplicated inside so the closure stays anchored — without it the aggregate
// runs over the whole national flowline graph.
//
// Membership semantics: a flowline qualifies if *some* seed reaches it within
// the cutoff, matching GROUP BY (seed, end) with no MIN. The per-flowline
// number shown in popups is computed separately in buildFusedFlowlineQuery /
// buildStreamsByIri, where MIN() picks the shortest qualifying path.
// `seedSide` decides which end the aggregate starts from, and it is a
// correctness-neutral, cost-critical choice: the block walks outward from its
// seed, so seeding the *unconstrained* side means summing path lengths over
// every flowline the graph has. "Facilities upstream from samples in York" with
// block A left wide open seeds 1,506,326 facilities and the engine gives up
// planning the query at 30s; seeded from the 132 samples the same question
// answers in 20s. Measured identical result sets where both forms run, and the
// bounded answer is a strict subset of the unbounded one (docs/QUERY-SWEEP.md
// MD, docs/DEBUGGING.md 2026-09-20).
//
// The "+1" fringe always extends *away* from the seed, so which physical end
// gets the extra segment follows the seed side. That is the same rule as
// before, not a new one: flipping the seed flips the fringe with it.
function boundedTrace(
  seed: string,
  maxDistanceKm: number,
  seedSide: 'anchor' | 'target' = 'anchor',
): string {
  // Which variable the seed binds, and which one the trace has to reach.
  const seedVar = seedSide === 'anchor' ? '?upstream_flowline' : '?ds_flowline';
  const farVar = seedSide === 'anchor' ? '?ds_flowline' : '?upstream_flowline';
  // Walking away from the seed. The anchor is the upstream end, so an anchor
  // seed walks downstream; a target seed sits at the far end of the same trace
  // and walks upstream.
  const walk = seedSide === 'anchor' ? 'downstream' : 'upstream';
  // Both forms write the seed-adjacent triple first and differ only in which
  // way the chain runs.
  const trace =
    walk === 'downstream'
      ? `${seedVar} hyf:downstreamFlowPathTC ?_flMid .
                ?_flMid hyf:downstreamFlowPathTC ?_flEnd .`
      : `?_flMid hyf:downstreamFlowPathTC ${seedVar} .
                ?_flEnd hyf:downstreamFlowPathTC ?_flMid .`;

  return `{
        SELECT DISTINCT ?upstream_flowline ?ds_flowline WHERE {
          {
            SELECT ${seedVar} ?_flEnd (SUM(?_flLen) AS ?_plen) WHERE {
              {
                SELECT ${seedVar} ?_flMid ?_flEnd WHERE {
                  { SELECT DISTINCT ${seedVar} WHERE { ${seed} } }
                  ${trace}
                }
              }
              ?_flMid nhdplusv2:hasFlowPathLength/qudt:quantityValue/qudt:numericValue ?_flLen .
            } GROUP BY ${seedVar} ?_flEnd
          }
          FILTER (xsd:float(?_plen) < xsd:float(${maxDistanceKm}))
          ${fringePath(walk, '?_flEnd', farVar)}
        }
      }`;
}

// Returns just the inner WHERE-body patterns shared across all fused queries:
// anchor binding + spatial path (neighbor expansion for "near", hydrology trace
// for downstream/upstream) + target binding + region clauses on each side.
function buildFusedWhereBody(opts: FusedBodyOpts): string {
  // No `|| hasSampleFilters(...)` override any more: the entity modules' bindInCell now keeps
  // exactly the joins an active filter reads, so a filtered side no longer has
  // to fall back on the whole observation chain.
  const anchorObs = opts.anchorSampleObservations ?? true;
  const targetObs = opts.targetSampleObservations ?? true;
  const anchorBind = bindInCell(opts.anchor, '?s2anchor', 'A', anchorObs);
  const targetBind = bindInCell(opts.target, '?s2target', 'C', targetObs);
  const anchorPin = pinValues(iriVarOf(opts.anchor, 'A'), opts.anchorIris);
  const targetPin = pinValues(iriVarOf(opts.target, 'C'), opts.targetIris);
  const aRegion = regionClause(opts.anchor, opts.anchorRegion, '?s2anchor', 'A');
  const tRegion = regionClause(opts.target, opts.targetRegion, '?s2target', 'C');

  if (opts.mode === 'near') {
    const hopPath = neighborPath(opts.hops ?? 1, '?s2anchor', '?s2target');
    return `${anchorPin}${targetPin}?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
      ${aRegion}
      ${anchorBind}
      ${hopPath}
      ?s2target rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}
      ${targetBind}`;
  }

  const seed = `${anchorPin}?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
      ${aRegion}
      ${anchorBind}
      ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor .
      ?s2neighbor spatial:connectedTo ?upstream_flowline .
      ?upstream_flowline rdf:type hyf:HY_FlowPath .`;

  const trace = opts.maxDistanceKm
    ? boundedTrace(seed, opts.maxDistanceKm)
    : `?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline .`;

  // When the target *is* a flowline, the traced ?ds_flowline already is the
  // answer — the s2target hop would find any flowline sharing a cell with it.
  // The cell is still needed if the target carries a region filter.
  const targetPart =
    entityFor(opts.target.type).isFlowline
      ? `${
          tRegion
            ? `?s2target spatial:connectedTo ?ds_flowline ;
                rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}`
            : ''
        }
      BIND(?ds_flowline AS ?streamC)
      ${streamFtypeFilter(opts.target.streamFilters, 'C')}`
      : `?s2target spatial:connectedTo ?ds_flowline ;
                rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}
      ${targetBind}`;

  // Write the constrained side first. QLever's planner does not search join
  // orders exhaustively at this size (12-14 triples), so it follows the query
  // text, and leading with an unfiltered side makes it trace the national
  // flowline graph: "facilities upstream from PFOS samples in York and
  // Cumberland" OOMs at 116s with the anchor first and answers in 18.6s with
  // the target first. Measured across all 72 hydrology shape/config pairs: 5
  // rescued, 0 regressions, 0 rows lost (docs/plans/…-fused-seed-side-….md).
  //
  // A bounded trace is reordered the same way, and needs it more: boundedTrace
  // embeds its seed a second time inside an aggregate, so seeding the wide-open
  // side sums path lengths across the national flowline graph. Every bounded
  // shape whose constrained side was the target failed before this (MD in
  // docs/query-sweep): timeouts in query planning, or 4.3 GB allocation
  // failures. Reordered, the same three shapes answer in seconds.
  // Which side leads is the Assess stage's call (engine/sides.ts).
  const lead = leadSide(
    { block: opts.anchor, region: opts.anchorRegion, pins: opts.anchorIris },
    { block: opts.target, region: opts.targetRegion, pins: opts.targetIris },
  );
  if (lead === 'target') {
    // The target's own entity and filters come first, then the hop onto the
    // river network. A streams target *is* the flowline, so it needs no hop.
    const targetHead =
      entityFor(opts.target.type).isFlowline
        ? `?ds_flowline rdf:type hyf:HY_FlowPath .
      ${targetPart}`
        : `?s2target rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}
      ${targetBind}
      ?s2target spatial:connectedTo ?ds_flowline .`;

    // The bounded block is rebuilt around the target seed. `trace` above is
    // seeded from the anchor, which is the right choice only for the
    // anchor-first order below.
    const targetTrace = opts.maxDistanceKm
      ? boundedTrace(targetHead, opts.maxDistanceKm, 'target')
      : trace;

    // spatial:connectedTo is stored both ways between cells and flowlines
    // (1,391,903 pairs each direction, verified on federation), so reading it
    // off the flowline here matches the same pairs as ?s2neighbor → flowline.
    return `${targetPin}${targetHead}
      ${targetTrace}
      ?upstream_flowline rdf:type hyf:HY_FlowPath ;
                spatial:connectedTo ?s2neighbor .
      ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor .
      ${anchorPin}?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
      ${aRegion}
      ${anchorBind}`;
  }

  return `${seed}
      ${trace}
      ${targetPin}${targetPart}`;
}

export interface FusedBaseOpts {
  anchor: EntityBlock;
  target: EntityBlock;
  anchorRegion?: string[];
  targetRegion?: string[];
}

export interface FusedNearOpts extends FusedBaseOpts {
  hops: number;
  project: 'anchor' | 'target';
  anchorIris?: string[];
  targetIris?: string[];
}

// Server-side "near" query. Projects either anchor or target entity IRIs as
// ?iri.
export function buildFusedNearQuery(opts: FusedNearOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: 'near',
    hops: opts.hops,
    anchorIris: opts.anchorIris,
    targetIris: opts.targetIris,
    // Both sides, not just the projected one: a near query projects a single
    // IRI, so neither side needs observation detail beyond its own filters.
    // Keying this off `project` left the *non*-projected samples side carrying
    // the full chain even with no filters set.
    anchorSampleObservations: false,
    targetSampleObservations: false,
  });
  const projectVar =
    opts.project === 'anchor'
      ? iriVarOf(opts.anchor, 'A')
      : iriVarOf(opts.target, 'C');

  return `
    ${PREFIXES}
    SELECT DISTINCT (${projectVar} AS ?iri) WHERE {
      ${body}
    }
  `;
}

export interface FusedHydrologyOpts extends FusedBaseOpts {
  project: 'anchor' | 'target';
  anchorIris?: string[];
  targetIris?: string[];
  maxDistanceKm?: number;
}

// Server-side trace query: the target downstream of the anchor. An "upstream"
// question arrives with its roles swapped (engine/question.ts), not a direction.
export function buildFusedHydrologyQuery(opts: FusedHydrologyOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: 'downstream',
    anchorIris: opts.anchorIris,
    targetIris: opts.targetIris,
    maxDistanceKm: opts.maxDistanceKm,
    // Verified on the live endpoint: keeping the observation joins on either
    // side of a downstream/upstream trace always fails (429 timeout / 500 OOM).
    // Sample points with no observations are dropped again at hydration, so the
    // sample layer is unchanged; the facility layer can include facilities whose
    // only downstream sample points carry no observations.
    anchorSampleObservations: false,
    targetSampleObservations: false,
  });
  const projectVar =
    opts.project === 'anchor'
      ? iriVarOf(opts.anchor, 'A')
      : iriVarOf(opts.target, 'C');

  return `
    ${PREFIXES}
    SELECT DISTINCT (${projectVar} AS ?iri) WHERE {
      ${body}
    }
  `;
}

// buildFusedSampleAggregateQuery / buildFusedSampleDetailsQuery lived here. They
// re-derived the whole spatial trace inside the hydrate query to avoid inlining
// long IRI lists, and that re-derivation is what timed out (429) on every
// downstream question. Sample hydration now runs by IRI in chunks
// (planner.ts iriScopes), so neither is needed.
//
// Merge note (2026-09-14): development fixed the non-detect handling in both of
// these at the same time this branch deleted them. Nothing was lost — the same
// resultValueClauses() fix already applies on the path that replaced them,
// buildSampleRetrievalByIriQuery / buildSampleDetailByIriQuery in
// templates/downstreamSamples.ts, and in the samples module's bindInCell (engine/entities/samples.ts).

export interface FusedWellSideOpts extends FusedBaseOpts {
  // Only near vs trace and the trace's hops or distance are read. The roles are
  // already oriented, so a trace runs downstream from the anchor like discovery
  // (re-deriving the direction here is what once made the well layer disagree
  // with the IRIs discovery had found).
  kind: QuestionKind;
  // Hops for a near question, the distance cap for a bounded trace.
  hops?: number;
  maxDistanceKm?: number;
  wellSide: 'anchor' | 'target';
}

// Well hydration without IRI inlining. Re-derives the well set inside the same
// fused query body (which already applies the region + well-category filters via
// the entity modules' bindInCell), then projects geometry + attributes from the well variable.
// Replaces buildWellsByIri (templates/hydrate.ts): statewide well sets are ~20k+
// IRIs and inlining them as VALUES makes the request body exceed hydrologykg's
// ~1MB limit (413). Server-deriving keeps the request ~1KB. Runs on federation.
export function buildFusedWellQuery(opts: FusedWellSideOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: opts.kind === 'near' ? 'near' : 'downstream',
    hops: opts.hops,
    maxDistanceKm: opts.maxDistanceKm,
  });
  const suffix = opts.wellSide === 'anchor' ? 'A' : 'C';
  const wellVar = `?well${suffix}`;
  const s2Var = opts.wellSide === 'anchor' ? '?s2anchor' : '?s2target';

  // Projecting only ?s2cell (not the anchor cell) collapses the near-join
  // fan-out to one row per well/cell — parity with the old buildWellsByIri.
  return `
    ${PREFIXES}
    SELECT DISTINCT
      (${wellVar} AS ?well) ?wellWKT (${s2Var} AS ?s2cell)
      ?wellName ?meUse ?meWellType ?meDepth ?meOverburden
      ?ilOwner ?ilDepth ?ilPurpose ?ilYield
    WHERE {
      ${body}
      ${wellVar} geo:hasGeometry/geo:asWKT ?wellWKT .
      OPTIONAL { ${wellVar} rdfs:label ?wellName . }
      OPTIONAL { ${wellVar} me_mgs:hasUse ?meUse . }
      OPTIONAL { ${wellVar} me_mgs:ofWellType ?meWellType . }
      OPTIONAL { ${wellVar} me_mgs:wellDepth/qudt:numericValue ?meDepth . }
      OPTIONAL { ${wellVar} me_mgs:wellOverburden/qudt:numericValue ?meOverburden . }
      OPTIONAL { ${wellVar} il_isgs:hasOwner ?ilOwner . }
      OPTIONAL { ${wellVar} il_isgs:wellDepth/qudt:numericValue ?ilDepth . }
      OPTIONAL { ${wellVar} il_isgs:wellPurpose ?ilPurpose . }
      OPTIONAL { ${wellVar} il_isgs:wellYield/qudt:numericValue ?ilYield . }
    }
  `;
}

export interface FusedFlowlineOpts {
  anchor: EntityBlock;
  target: EntityBlock;
  anchorIris: string[];
  targetIris: string[];
  maxDistanceKm?: number;
}

// Restricts the traced closure to flowlines that actually connect the anchors
// to the targets. Without it the trace is one-sided: it runs from the anchor
// cells to the end of the network, so an anchor sitting near a drainage divide
// drags in the whole of the neighbouring basin. On "facilities upstream from
// PFOS samples in York County, ME" that drew 122 segments of the Merrimack and
// 21 of the Winnipesaukee, ~130km away in a basin no York sample drains from.
//
// Written as an intersection of two DISTINCT closures rather than the direct
// `?flowline hyf:downstreamFlowPathTC? ?_flEnd` membership test: that form
// leaves ?flowline unbound on the left and QLever times out joining on it
// (31s, "Join on ?flowline"). The intersection runs in the same 7s the
// one-sided query took.
//
// `TC?` on the target side was measured and recovers nothing (0 extra
// flowlines) while costing 8s. That is not a quirk: hyf:downstreamFlowPathTC is
// already reflexive (`X TC X` holds for 2,104 of 2,104 York County flowlines,
// 434,501 self-pairs graph-wide), so `TC?` is definitionally the same relation.
// The segment a target sits on is therefore drawn; what is excluded is the
// river below it.
function targetReachClause(opts: FusedFlowlineOpts): string {
  // ponytail: target IRIs inlined whole. Only anchors are sliced today
  // (iriScopes/divideIriList in the planner); add target slicing if a question
  // ever pushes this past the gateway's body limit.
  const targetValues = pinValues(iriVarOf(opts.target, 'C'), opts.targetIris);
  // Filters stripped: the pinned IRIs are already the filtered answer set, so
  // every filter clause here is a join that can only re-confirm what the VALUES
  // list states. Passing the bare block rather than opts.target drops those
  // clauses. Measured on the York question: re-deriving the substance filter
  // cost 1s of the 8 and changed nothing.
  const targetBind = bindInCell({ type: opts.target.type }, '?s2celltarget', 'C', false);
  // The target is downstream of the anchor, so a drawn flowline flows into it.
  const reach = `?flowline hyf:downstreamFlowPathTC ?_flTarget .`;

  return `{
        SELECT DISTINCT ?flowline WHERE {
          {
            SELECT DISTINCT ?s2celltarget WHERE {
              ${targetValues}
              ?s2celltarget rdf:type kwg-ont:S2Cell_Level13 .
              ${targetBind}
            }
          }
          ?_flTarget spatial:connectedTo ?s2celltarget .
          ${reach}
        }
      }`;
}

// Returns flowline geometries traced from the anchor entities the pipeline
// already resolved in FIND_ANCHOR_IRIS.
//
// Those IRIs are the answer set: each one passed both the anchor-side and
// target-side filters. Re-deriving anchors here instead — the previous
// approach — meant guessing which region to apply, and either guess is wrong.
// With no region the trace starts from every matching facility in the country
// and the layer covers the USA; with the target's region it drops anchors that
// sit outside the region but genuinely drain into it (for "samples in Maine
// downstream of landfills", 16 of 39 contributing landfills are outside Maine),
// leaving sample points with no stream under them. Binding the resolved IRIs
// removes the guess and keeps this layer consistent with the facility layer.
export function buildFusedFlowlineQuery(opts: FusedFlowlineOpts): string {
  // Bare block, same reasoning as targetReachClause: anchorIris is the resolved
  // answer set, so the block's own filters can only re-confirm the VALUES list.
  // For a facilities anchor that drops `fio:ofIndustry` plus a NAICS type scan
  // per pinned IRI; for a samples anchor it drops the whole observation chain,
  // including the coso:measurementUnit join this branch exists to keep out of
  // queries that do not read it.
  const anchorBind = bindInCell({ type: opts.anchor.type }, '?s2anchor', 'A', false);
  // ponytail: inlined as VALUES rather than re-derived. Anchor sets are small
  // (tens), unlike the sample IRI lists that forced server-side fusion.
  const anchorValues = pinValues(iriVarOf(opts.anchor, 'A'), opts.anchorIris);

  const seedCells = `{
        SELECT DISTINCT ?s2cellus WHERE {
          ${anchorValues}
          ?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
          ${anchorBind}
          ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2cellus .
        }
      }`;

  const flowlinePattern = `?upstream_flowline rdf:type hyf:HY_FlowPath ;
            spatial:connectedTo ?s2cellus ;
            hyf:downstreamFlowPathTC ?flowline .`;

  const reachesTarget = targetReachClause(opts);

  // Unbounded: the flowline set is the plain transitive closure.
  if (!opts.maxDistanceKm) {
    return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName WHERE {
      {
        SELECT DISTINCT ?flowline WHERE {
          ${seedCells}
          ${flowlinePattern}
        }
      }
      ${reachesTarget}
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
                nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
  }

  // Bounded: sum the lengths of the segments between seed and candidate, then
  // MIN across seeds so each flowline carries one distance for its popup.
  const boundedTraceInner = `?_flSeed hyf:downstreamFlowPathTC ?_flMid .
                  ?_flMid hyf:downstreamFlowPathTC ?_flEnd .`;

  // The "+1" segment lies past the cutoff, so it can't reuse its parent's
  // distance — that would report a number under the threshold for a flowline
  // outside it. Adding the parent's own length gives the distance to where the
  // fringe segment starts, which never understates. A flowline that is both a
  // valid endpoint (via one seed) and a fringe (via another) keeps the smaller
  // value, since MIN runs over the union.
  return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName ?path_length WHERE {
      {
        SELECT ?flowline (MIN(?_ptotal) AS ?path_length) WHERE {
          {
            SELECT ?_flSeed ?_flEnd (SUM(?_flLen) AS ?_plen) WHERE {
              {
                SELECT ?_flSeed ?_flMid ?_flEnd WHERE {
                  {
                    SELECT DISTINCT ?_flSeed WHERE {
                      ${seedCells}
                      ?_flSeed rdf:type hyf:HY_FlowPath ;
                               spatial:connectedTo ?s2cellus .
                    }
                  }
                  ${boundedTraceInner}
                }
              }
              ?_flMid nhdplusv2:hasFlowPathLength/qudt:quantityValue/qudt:numericValue ?_flLen .
            } GROUP BY ?_flSeed ?_flEnd
          }
          FILTER (xsd:float(?_plen) < xsd:float(${opts.maxDistanceKm}))
          ?_flEnd nhdplusv2:hasFlowPathLength/qudt:quantityValue/qudt:numericValue ?_endLen .
          ${fringePath('downstream', '?_flEnd', '?flowline')}
          BIND(IF(?flowline = ?_flEnd, 0.0, ?_endLen) AS ?_extra)
          BIND(xsd:float(?_plen) + xsd:float(?_extra) AS ?_ptotal)
        } GROUP BY ?flowline
      }
      ${reachesTarget}
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
                nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
}
