import { PREFIXES } from '../../constants/prefixes';
import type {
  EntityBlock,
  FacilityFilters,
  SampleFilters,
  AquiferFilters,
  StreamFilters,
  SpatialRelationship,
} from '../../types/query';
import { wrapUri, buildSampleFilterClauses, resultValueClauses, needsUnitJoin } from './samples';
import { buildIndustryValues } from './facilities';
import { AQUIFER_TYPE_VALUES } from './aquifers';
import { buildWellCategoryFilter } from './wells';

// Returns the entity IRI variable for the block, suffixed to disambiguate
// anchor vs target sides in a fused query.
export function entityIriVar(block: EntityBlock, suffix: string): string {
  switch (block.type) {
    case 'samples':
      return `?sp${suffix}`;
    case 'facilities':
      return `?facility${suffix}`;
    case 'waterBodies':
      return `?waterBody${suffix}`;
    case 'wells':
      return `?well${suffix}`;
    case 'aquifers':
      return `?aquifer${suffix}`;
    case 'streams':
      return `?stream${suffix}`;
  }
}

function buildAquiferTypeFilterSuffixed(filters: AquiferFilters | undefined, suffix: string): string {
  const kinds = filters?.aquiferTypes;
  if (!kinds?.length) return '';
  const vals = kinds
    .flatMap((k) => AQUIFER_TYPE_VALUES[k] ?? [])
    .map((v) => `"${v}"`);
  if (!vals.length) return '';
  return `?aquifer${suffix} saw_water:aquiferType ?aqType${suffix} .
      VALUES ?aqType${suffix} { ${vals.join(' ')} }`;
}

// SPARQL fragment binding the block's entity inside ?s2cell (the s2Var name
// is supplied so the same helper can fill either ?s2anchor or ?s2target).
// `suffix` disambiguates internal variables so same-type anchor+target queries
// don't collide.
// The observation joins a samples block needs to *filter*, which is a smaller
// set than the joins it needs to *display*. Every required triple is also a
// filter, so asking for detail the filters never read deletes rows: the unit
// join is the worst of them, because a non-detect has no coso:measurementUnit
// (see needsUnitJoin in ./samples) and requiring it dropped 774 of 1,688
// Cumberland PFOS observations while "include non-detects" was ticked.
function sampleJoinsNeeded(filters: SampleFilters | undefined) {
  const range = needsUnitJoin(filters);
  // buildSampleFilterClauses reads ?numericResult / ?nonDetect for both of
  // these, and resultValueClauses is what binds them.
  const result = range || filters?.includeNondetects === false;
  return {
    substance: Boolean(filters?.substances?.length),
    material: Boolean(filters?.materialTypes?.length),
    result,
    // The ng/L comparison is the only thing that reads the unit.
    unit: range,
    observation: Boolean(filters?.substances?.length || filters?.materialTypes?.length || result),
  };
}

// `sampleObservations: false` drops the observation joins from a samples block
// outright. Only the IRI-finding queries may pass it: they project just the
// sample-point IRI, and re-deriving every observation there is what pushes the
// hydrology queries past QLever's 30s limit / memory ceiling (429/500).
// buildFusedWellQuery is the one caller left on the `true` default: it projects
// well columns from a body that may carry a samples block on the other side.
//
// With `false` and an active sample filter the block is rebuilt from
// sampleJoinsNeeded: enough to honour the filter, nothing that only feeds a
// popup.
export function bindEntityInCell(
  block: EntityBlock,
  s2Var: string,
  suffix: string,
  sampleObservations = true,
): string {
  switch (block.type) {
    case 'facilities': {
      const industry = buildIndustryValues(
        (block.facilityFilters as FacilityFilters | undefined)?.industryCodes,
        suffix,
      );
      return `${s2Var} kwg-ont:sfContains ?facility${suffix} .
      ?facility${suffix} fio:ofIndustry ?industryCode${suffix} .
      ?industryCode${suffix} a naics:NAICS-IndustryCode .
      ${industry}`;
    }
    case 'samples': {
      const point = `?sp${suffix} rdf:type coso:SamplePoint ;
                spatial:connectedTo ${s2Var} .`;
      const filters = buildSampleFilterClauses(block.sampleFilters, suffix);

      if (!sampleObservations) {
        const need = sampleJoinsNeeded(block.sampleFilters);
        if (!need.observation) return point;
        const parts = [
          point,
          `?observation${suffix} coso:observedAtSamplePoint ?sp${suffix} .`,
        ];
        if (need.substance) {
          parts.push(`?observation${suffix} coso:ofDSSToxSubstance ?substance${suffix} .`);
        }
        if (need.material) {
          // The material lives on the analysed sample, not the observation.
          parts.push(`?observation${suffix} coso:analyzedSample ?sample${suffix} .
      ?sample${suffix} coso:sampleOfMaterialType ?matType${suffix} .`);
        }
        if (need.result) {
          parts.push(`?observation${suffix} coso:hasResult ?result${suffix} .
      ${resultValueClauses(suffix)}`);
        }
        if (need.unit) {
          parts.push(`?result${suffix} coso:measurementUnit ?unit${suffix} .`);
        }
        parts.push(filters);
        return parts.join('\n      ');
      }

      return `${point}
      ?observation${suffix} rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp${suffix} ;
          coso:ofDSSToxSubstance ?substance${suffix} ;
          coso:analyzedSample ?sample${suffix} ;
          coso:hasResult ?result${suffix} .
      ?sample${suffix} coso:sampleOfMaterialType ?matType${suffix} .
      ?matType${suffix} rdfs:label ?matTypeLabel${suffix} .
      ?result${suffix} coso:measurementUnit ?unit${suffix} .
      ${resultValueClauses(suffix)}
      ${filters}`;
    }
    case 'waterBodies': {
      let filterClauses = '';
      if (block.waterBodyFilters?.ftypes?.length) {
        const ftypeValues = block.waterBodyFilters.ftypes.map((f) => `"${f}"`).join(' ');
        filterClauses = `?waterBody${suffix} nhdplusv2:hasFTYPE ?ftype${suffix} .
      VALUES ?ftype${suffix} { ${ftypeValues} }`;
      }
      return `${s2Var} spatial:connectedTo ?waterBody${suffix} .
      ?waterBody${suffix} rdf:type hyf:HY_WaterBody .
      ${filterClauses}`;
    }
    case 'wells': {
      const typeFilter = buildWellCategoryFilter(block.wellFilters?.wellCategories, `?well${suffix}`);
      return `${s2Var} spatial:connectedTo ?well${suffix} .
      ${typeFilter}`;
    }
    case 'aquifers': {
      const typeFilter = buildAquiferTypeFilterSuffixed(block.aquiferFilters, suffix);
      return `${s2Var} spatial:connectedTo ?aquifer${suffix} .
      ?aquifer${suffix} rdf:type gwml2:GW_Aquifer .
      ${typeFilter}`;
    }
    case 'streams': {
      return `${s2Var} spatial:connectedTo ?stream${suffix} .
      ?stream${suffix} rdf:type hyf:HY_FlowPath .
      ${streamFtypeFilter(block.streamFilters, suffix)}`;
    }
  }
}

function pinValues(entityVar: string, iris: string[] | undefined): string {
  if (!iris?.length) return '';
  return `VALUES ${entityVar} { ${iris.map(wrapUri).join(' ')} }\n      `;
}

// Lists a block's entities inside its region, capped at `limit`. Used to decide
// whether a side is small enough to chunk over — a bounded LIMIT probe rather
// than COUNT, because counting Maine's unfiltered facilities took 11.0s while
// the same listing with a filter took 0.8s (docs/QUERY-MATRIX.md).
export function buildEntityProbeQuery(
  block: EntityBlock,
  regionCodes: string[] | undefined,
  limit: number,
): string {
  const entityVar = entityIriVar(block, 'P');
  // `false`, like the IRI-finding queries: the probe lists entity IRIs, and the
  // list it returns becomes the chunk membership (src/engine/scope.ts). A
  // narrowing join here removes entities from every slice, so the probe has to
  // see exactly what discovery sees.
  const bind = bindEntityInCell(block, '?s2probe', 'P', false);
  const region = regionClause(regionCodes, '?s2probe', '?_regionP');
  return `
    ${PREFIXES}
    SELECT DISTINCT (${entityVar} AS ?iri) WHERE {
      ?s2probe rdf:type kwg-ont:S2Cell_Level13 .
      ${region}
      ${bind}
    } LIMIT ${limit}
  `;
}

// FTYPE restriction for flowlines, shared by the s2-hop and direct-bind forms.
function streamFtypeFilter(filters: StreamFilters | undefined, suffix: string): string {
  if (!filters?.ftypes?.length) return '';
  const values = filters.ftypes.map((f) => `"${f}"`).join(' ');
  return `?stream${suffix} nhdplusv2:hasFTYPE ?flFtype${suffix} .
      VALUES ?flFtype${suffix} { ${values} }`;
}

function regionClause(regionCodes: string[] | undefined, s2Var: string, internalVar: string): string {
  if (!regionCodes?.length) return '';
  if (regionCodes.length === 1) {
    return `${s2Var} spatial:connectedTo kwgr:administrativeRegion.USA.${regionCodes[0]} .`;
  }
  const values = regionCodes.map((c) => `kwgr:administrativeRegion.USA.${c}`).join(' ');
  return `VALUES ${internalVar} { ${values} }
      ${s2Var} spatial:connectedTo ${internalVar} .`;
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
  mode: 'near' | 'downstream' | 'upstream';
  hops?: number;
  // Chunk pins (src/engine/scope.ts). Restricting one side to a known slice of
  // IRIs is what makes a too-large query fit inside the engine's 30s budget.
  anchorIris?: string[];
  targetIris?: string[];
  // Set by the IRI-finding queries only — see bindEntityInCell.
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
// bounded answer is a strict subset of the unbounded one (docs/QUERY-MATRIX.md
// MD, docs/DEBUGGING.md 2026-09-20).
//
// The "+1" fringe always extends *away* from the seed, so which physical end
// gets the extra segment follows the seed side. That is the same rule as
// before, not a new one: flipping the seed flips the fringe with it.
function boundedTrace(
  seed: string,
  direction: 'downstream' | 'upstream',
  maxDistanceKm: number,
  seedSide: 'anchor' | 'target' = 'anchor',
): string {
  // Which variable the seed binds, and which one the trace has to reach.
  const seedVar = seedSide === 'anchor' ? '?upstream_flowline' : '?ds_flowline';
  const farVar = seedSide === 'anchor' ? '?ds_flowline' : '?upstream_flowline';
  // Walking away from the seed. For an anchor seed that is the direction of the
  // question; for a target seed it is the reverse, since the target sits at the
  // far end of the same trace.
  const walk = seedSide === 'anchor' ? direction : direction === 'downstream' ? 'upstream' : 'downstream';
  // Both forms write the seed-adjacent triple first and differ only in which
  // way the chain runs. The anchor form's text is unchanged from before this
  // parameter existed, so every query that kept the anchor-first order is
  // byte-identical.
  const trace =
    walk === 'downstream'
      ? `${seedVar} hyf:downstreamFlowPathTC ?_flMid .
                ?_flMid hyf:downstreamFlowPathTC ?_flEnd .`
      : seedSide === 'anchor'
        ? `?_flEnd hyf:downstreamFlowPathTC ?_flMid .
                ?_flMid hyf:downstreamFlowPathTC ${seedVar} .`
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
  // No `|| hasSampleFilters(...)` override any more: bindEntityInCell now keeps
  // exactly the joins an active filter reads, so a filtered side no longer has
  // to fall back on the whole observation chain.
  const anchorObs = opts.anchorSampleObservations ?? true;
  const targetObs = opts.targetSampleObservations ?? true;
  const anchorBind = bindEntityInCell(opts.anchor, '?s2anchor', 'A', anchorObs);
  const targetBind = bindEntityInCell(opts.target, '?s2target', 'C', targetObs);
  const anchorPin = pinValues(entityIriVar(opts.anchor, 'A'), opts.anchorIris);
  const targetPin = pinValues(entityIriVar(opts.target, 'C'), opts.targetIris);
  const aRegion = regionClause(opts.anchorRegion, '?s2anchor', '?_regionA');
  const tRegion = regionClause(opts.targetRegion, '?s2target', '?_regionC');

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
    ? boundedTrace(seed, opts.mode, opts.maxDistanceKm)
    : opts.mode === 'downstream'
      ? `?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline .`
      : `?ds_flowline hyf:downstreamFlowPathTC ?upstream_flowline .`;

  // When the target *is* a flowline, the traced ?ds_flowline already is the
  // answer — the s2target hop would find any flowline sharing a cell with it.
  // The cell is still needed if the target carries a region filter.
  const targetPart =
    opts.target.type === 'streams'
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
  // docs/query-matrix): timeouts in query planning, or 4.3 GB allocation
  // failures. Reordered, the same three shapes answer in seconds.
  if (sideNarrowness(opts, 'target') > sideNarrowness(opts, 'anchor')) {
    // The target's own entity and filters come first, then the hop onto the
    // river network. A streams target *is* the flowline, so it needs no hop.
    const targetHead =
      opts.target.type === 'streams'
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
      ? boundedTrace(targetHead, opts.mode, opts.maxDistanceKm, 'target')
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

// True when the question narrows this block at all. Exported because
// engine/scope.ts asks the same question to pick a chunking axis, and the two
// have to agree: if the template thinks a side is constrained and the executor
// thinks it is wide open, the executor slices on an axis the template already
// led with. engine/sparqlErrors.ts still keeps its own `isNarrowed`, which is
// this plus the region check.
//
// A samples block is the one type with a filter that defaults to set:
// `includeNondetects: true` is the UI's default checked state and narrows
// nothing, so only `=== false` counts. sampleJoinsNeeded above already draws
// that line; a generic "any field is non-null" scan does not, and read
// `includeNondetects: true` alone as a reason to reorder the whole body.
export function blockIsFiltered(block: EntityBlock): boolean {
  if (block.type === 'samples') return sampleJoinsNeeded(block.sampleFilters).observation;
  const filters =
    block.facilityFilters ??
    block.waterBodyFilters ??
    block.wellFilters ??
    block.aquiferFilters ??
    block.streamFilters;
  return Boolean(
    filters && Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v != null)),
  );
}

// A side is constrained when the question already narrows it: a region, any
// entity filter, or an IRI pin from chunking. Unconstrained means "every
// facility in the graph", which is the side that must not lead the query.
// How narrow a side is, not whether it is narrowed at all. The seed walks
// outward from whichever side leads, so the question is always which of the two
// is *smaller*, and a boolean cannot answer it: an industry filter with no
// region says "constrained" while meaning every sewage plant in the country.
// Answering the boolean is what made "facilities upstream from PFOS samples in
// York" fail the moment an industry filter was added to block A, after the same
// question had just been fixed without one.
//
//   3  an IRI pin. The executor chose this slice; re-seeding from the other
//      side would throw the slice away.
//   2  a region. Bounded by geography at any level, and the graph is indexed
//      for it.
//   1  an entity filter only. Selective in kind, unbounded in extent.
//   0  nothing.
//
// Ties keep the anchor-first order, so this only ever changes cases where both
// sides are constrained at different levels. Every shape where one side was
// constrained and the other was not keeps the order it had.
function sideNarrowness(opts: FusedBodyOpts, side: 'anchor' | 'target'): 0 | 1 | 2 | 3 {
  const block = side === 'anchor' ? opts.anchor : opts.target;
  const region = side === 'anchor' ? opts.anchorRegion : opts.targetRegion;
  const pins = side === 'anchor' ? opts.anchorIris : opts.targetIris;
  if (pins?.length) return 3;
  if (region?.length) return 2;
  return blockIsFiltered(block) ? 1 : 0;
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
      ? entityIriVar(opts.anchor, 'A')
      : entityIriVar(opts.target, 'C');

  return `
    ${PREFIXES}
    SELECT DISTINCT (${projectVar} AS ?iri) WHERE {
      ${body}
    }
  `;
}

export interface FusedHydrologyOpts extends FusedBaseOpts {
  direction: 'downstream' | 'upstream';
  project: 'anchor' | 'target';
  anchorIris?: string[];
  targetIris?: string[];
  maxDistanceKm?: number;
}

// Server-side downstream/upstream query.
export function buildFusedHydrologyQuery(opts: FusedHydrologyOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: opts.direction,
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
      ? entityIriVar(opts.anchor, 'A')
      : entityIriVar(opts.target, 'C');

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
// templates/downstreamSamples.ts, and in bindEntityInCell above.

export interface FusedWellSideOpts extends FusedBaseOpts {
  relationship: SpatialRelationship;
  // Which way the discovery steps traced. This step re-derives the same trace,
  // so it has to be told, not re-derive it from relationship.type — that is
  // what made the well layer disagree with the IRIs discovery had found.
  direction: 'downstream' | 'upstream';
  wellSide: 'anchor' | 'target';
}

// Well hydration without IRI inlining. Re-derives the well set inside the same
// fused query body (which already applies the region + well-category filters via
// bindEntityInCell), then projects geometry + attributes from the well variable.
// Replaces buildWellsByIri (templates/hydrate.ts): statewide well sets are ~20k+
// IRIs and inlining them as VALUES makes the request body exceed hydrologykg's
// ~1MB limit (413). Server-deriving keeps the request ~1KB. Runs on federation.
export function buildFusedWellQuery(opts: FusedWellSideOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: opts.relationship.type === 'near' ? 'near' : opts.direction,
    hops: opts.relationship.hops,
    maxDistanceKm: opts.relationship.maxDistanceKm,
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
  direction: 'downstream' | 'upstream';
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
  const targetValues = pinValues(entityIriVar(opts.target, 'C'), opts.targetIris);
  // Filters stripped: the pinned IRIs are already the filtered answer set, so
  // every filter clause here is a join that can only re-confirm what the VALUES
  // list states. Passing the bare block rather than opts.target drops those
  // clauses. Measured on the York question: re-deriving the substance filter
  // cost 1s of the 8 and changed nothing.
  const targetBind = bindEntityInCell({ type: opts.target.type }, '?s2celltarget', 'C', false);
  const reach =
    opts.direction === 'downstream'
      ? `?flowline hyf:downstreamFlowPathTC ?_flTarget .`
      : `?_flTarget hyf:downstreamFlowPathTC ?flowline .`;

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
  const anchorBind = bindEntityInCell({ type: opts.anchor.type }, '?s2anchor', 'A', false);
  // ponytail: inlined as VALUES rather than re-derived. Anchor sets are small
  // (tens), unlike the sample IRI lists that forced server-side fusion.
  const anchorValues = pinValues(entityIriVar(opts.anchor, 'A'), opts.anchorIris);

  const seedCells = `{
        SELECT DISTINCT ?s2cellus WHERE {
          ${anchorValues}
          ?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
          ${anchorBind}
          ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2cellus .
        }
      }`;

  const flowlinePattern =
    opts.direction === 'downstream'
      ? `?upstream_flowline rdf:type hyf:HY_FlowPath ;
            spatial:connectedTo ?s2cellus ;
            hyf:downstreamFlowPathTC ?flowline .`
      : `?downstream_flowline rdf:type hyf:HY_FlowPath ;
            spatial:connectedTo ?s2cellus .
        ?flowline hyf:downstreamFlowPathTC ?downstream_flowline .`;

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
  const boundedTraceInner =
    opts.direction === 'downstream'
      ? `?_flSeed hyf:downstreamFlowPathTC ?_flMid .
                  ?_flMid hyf:downstreamFlowPathTC ?_flEnd .`
      : `?_flEnd hyf:downstreamFlowPathTC ?_flMid .
                  ?_flMid hyf:downstreamFlowPathTC ?_flSeed .`;

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
          ${fringePath(opts.direction, '?_flEnd', '?flowline')}
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
