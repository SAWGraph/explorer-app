import { PREFIXES } from '../../constants/prefixes';
import type {
  EntityBlock,
  FacilityFilters,
  StreamFilters,
  WellFilters,
  SpatialRelationship,
} from '../../types/query';
import { wrapUri, buildSampleFilterClauses } from './samples';
import { buildIndustryValues } from './facilities';

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
    case 'streams':
      return `?stream${suffix}`;
  }
}

function buildWellTypeFilterSuffixed(filters: WellFilters | undefined, suffix: string): string {
  const wellVar = `?well${suffix}`;
  const types = filters?.wellTypes;
  if (!types?.length) {
    return `{ ${wellVar} rdf:type il_isgs:ISGS-Well } UNION { ${wellVar} rdf:type me_mgs:MGS-Well }`;
  }
  const clauses: string[] = [];
  for (const t of types) {
    if (t === 'ISGS-Well') clauses.push(`{ ${wellVar} rdf:type il_isgs:ISGS-Well }`);
    else if (t === 'MGS-Well') clauses.push(`{ ${wellVar} rdf:type me_mgs:MGS-Well }`);
  }
  return clauses.length
    ? clauses.join(' UNION ')
    : `{ ${wellVar} rdf:type il_isgs:ISGS-Well } UNION { ${wellVar} rdf:type me_mgs:MGS-Well }`;
}

// SPARQL fragment binding the block's entity inside ?s2cell (the s2Var name
// is supplied so the same helper can fill either ?s2anchor or ?s2target).
// `suffix` disambiguates internal variables so same-type anchor+target queries
// don't collide.
export function bindEntityInCell(block: EntityBlock, s2Var: string, suffix: string): string {
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
      const filters = buildSampleFilterClauses(block.sampleFilters, suffix);
      return `?sp${suffix} rdf:type coso:SamplePoint ;
                spatial:connectedTo ${s2Var} .
      ?observation${suffix} rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp${suffix} ;
          coso:ofDSSToxSubstance ?substance${suffix} ;
          coso:analyzedSample ?sample${suffix} ;
          coso:hasResult ?result${suffix} .
      ?sample${suffix} coso:sampleOfMaterialType ?matType${suffix} .
      ?matType${suffix} rdfs:label ?matTypeLabel${suffix} .
      ?result${suffix} coso:measurementValue ?result_value${suffix} ;
                       coso:measurementUnit ?unit${suffix} .
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
      const typeFilter = buildWellTypeFilterSuffixed(block.wellFilters, suffix);
      return `${s2Var} spatial:connectedTo ?well${suffix} .
      ${typeFilter}`;
    }
    case 'streams': {
      return `${s2Var} spatial:connectedTo ?stream${suffix} .
      ?stream${suffix} rdf:type hyf:HY_FlowPath .
      ${streamFtypeFilter(block.streamFilters, suffix)}`;
    }
  }
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
function boundedTrace(
  seed: string,
  direction: 'downstream' | 'upstream',
  maxDistanceKm: number,
): string {
  const trace =
    direction === 'downstream'
      ? `?upstream_flowline hyf:downstreamFlowPathTC ?_flMid .
                ?_flMid hyf:downstreamFlowPathTC ?_flEnd .`
      : `?_flEnd hyf:downstreamFlowPathTC ?_flMid .
                ?_flMid hyf:downstreamFlowPathTC ?upstream_flowline .`;

  return `{
        SELECT DISTINCT ?upstream_flowline ?ds_flowline WHERE {
          {
            SELECT ?upstream_flowline ?_flEnd (SUM(?_flLen) AS ?_plen) WHERE {
              {
                SELECT ?upstream_flowline ?_flMid ?_flEnd WHERE {
                  { SELECT DISTINCT ?upstream_flowline WHERE { ${seed} } }
                  ${trace}
                }
              }
              ?_flMid nhdplusv2:hasFlowPathLength/qudt:quantityValue/qudt:numericValue ?_flLen .
            } GROUP BY ?upstream_flowline ?_flEnd
          }
          FILTER (xsd:float(?_plen) < xsd:float(${maxDistanceKm}))
          ${fringePath(direction, '?_flEnd', '?ds_flowline')}
        }
      }`;
}

// Returns just the inner WHERE-body patterns shared across all fused queries:
// anchor binding + spatial path (neighbor expansion for "near", hydrology trace
// for downstream/upstream) + target binding + region clauses on each side.
function buildFusedWhereBody(opts: FusedBodyOpts): string {
  const anchorBind = bindEntityInCell(opts.anchor, '?s2anchor', 'A');
  const targetBind = bindEntityInCell(opts.target, '?s2target', 'C');
  const aRegion = regionClause(opts.anchorRegion, '?s2anchor', '?_regionA');
  const tRegion = regionClause(opts.targetRegion, '?s2target', '?_regionC');

  if (opts.mode === 'near') {
    const hopPath = neighborPath(opts.hops ?? 1, '?s2anchor', '?s2target');
    return `?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
      ${aRegion}
      ${anchorBind}
      ${hopPath}
      ?s2target rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}
      ${targetBind}`;
  }

  const seed = `?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
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

  return `${seed}
      ${trace}
      ${targetPart}`;
}

function relationshipMode(
  rel: SpatialRelationship,
): 'near' | 'downstream' | 'upstream' {
  if (rel.type === 'downstream') return 'downstream';
  if (rel.type === 'upstream') return 'upstream';
  return 'near';
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
    maxDistanceKm: opts.maxDistanceKm,
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

export interface FusedSampleSideOpts extends FusedBaseOpts {
  relationship: SpatialRelationship;
  sampleSide: 'anchor' | 'target';
}

// Sample hydration without IRI inlining. The anchor/target derivation runs
// in the same query body, then per-sample aggregates project from the
// sample-side observation variables already bound by bindEntityInCell.
// Replaces buildSamplesByIri (templates/hydrate.ts) when the side is samples;
// statewide queries can have 1000+ sample IRIs and the gateway 502s on the
// inlined VALUES body — re-deriving server-side keeps the request small.
export function buildFusedSampleAggregateQuery(opts: FusedSampleSideOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: relationshipMode(opts.relationship),
    hops: opts.relationship.hops,
    maxDistanceKm: opts.relationship.maxDistanceKm,
  });
  const suffix = opts.sampleSide === 'anchor' ? 'A' : 'C';
  const s2Var = opts.sampleSide === 'anchor' ? '?s2anchor' : '?s2target';
  const spVar = `?sp${suffix}`;
  const resultVar = `?result_value${suffix}`;
  const substanceVar = `?substance${suffix}`;
  const matLabelVar = `?matTypeLabel${suffix}`;
  const observationVar = `?observation${suffix}`;
  const sampleVar = `?sample${suffix}`;

  return `
    ${PREFIXES}
    SELECT
      (COUNT(DISTINCT ${observationVar}) as ?resultCount)
      (COUNT(DISTINCT ${sampleVar}) as ?sampleCount)
      (MAX(${resultVar}) as ?max)
      (GROUP_CONCAT(DISTINCT ${substanceVar}; separator="; ") as ?substances)
      (GROUP_CONCAT(DISTINCT ${matLabelVar}; separator="; ") as ?materials)
      (${spVar} AS ?sp) ?spWKT (${s2Var} AS ?s2cell)
    WHERE {
      ${body}
      ${spVar} geo:hasGeometry/geo:asWKT ?spWKT .
    } GROUP BY ${spVar} ?spWKT ${s2Var}
  `;
}

// Per-observation sample-detail query, server-derived. Inner subquery picks
// out sample IRIs via the same fused anchor→target logic; outer joins to
// observation/sample/result tuples and projects detail fields. Replaces
// buildSampleDetailsByIri for the same wire-size reason as the aggregate
// query above.
export function buildFusedSampleDetailsQuery(opts: FusedSampleSideOpts): string {
  const body = buildFusedWhereBody({
    anchor: opts.anchor,
    target: opts.target,
    anchorRegion: opts.anchorRegion,
    targetRegion: opts.targetRegion,
    mode: relationshipMode(opts.relationship),
    hops: opts.relationship.hops,
    maxDistanceKm: opts.relationship.maxDistanceKm,
  });
  const suffix = opts.sampleSide === 'anchor' ? 'A' : 'C';
  const spVar = `?sp${suffix}`;
  const sampleBlock = opts.sampleSide === 'anchor' ? opts.anchor : opts.target;
  const { substances, ...nonSubstanceFilters } = sampleBlock.sampleFilters ?? {};
  const substanceFilter = substances?.length
    ? `VALUES ?substanceUri { ${substances.map(wrapUri).join(' ')} }`
    : '';
  const outerFilter = buildSampleFilterClauses(
    Object.keys(nonSubstanceFilters).length ? nonSubstanceFilters : undefined,
  );

  return `
    ${PREFIXES}
    SELECT DISTINCT
      ?sp ?spWKT
      (SAMPLE(?spName) as ?samplePointName)
      ?sample
      (GROUP_CONCAT(DISTINCT ?sampleId; separator="; ") as ?sampleIdentifier)
      ?observation
      ?date
      ?substance
      ?result_value
      ?unit_sym
      (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator=", ") as ?sampleType)
    WHERE {
      {
        SELECT DISTINCT (${spVar} AS ?sp) WHERE {
          ${body}
        }
      }
      ?sp geo:hasGeometry/geo:asWKT ?spWKT .
      OPTIONAL { ?sp rdfs:label ?spName }
      ?sample coso:fromSamplePoint ?sp ;
              coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?observation rdf:type coso:ContaminantObservation ;
                   coso:analyzedSample ?sample ;
                   coso:observedAtSamplePoint ?sp ;
                   coso:ofDSSToxSubstance ?substanceUri ;
                   coso:hasResult ?result .
      ${substanceFilter}
      OPTIONAL { ?substanceUri skos:altLabel ?altLabel }
      OPTIONAL { ?substanceUri rdfs:label ?rdfLabel }
      BIND(COALESCE(?altLabel, ?rdfLabel, REPLACE(STR(?substanceUri), "^.*[#/]", "")) AS ?substance)
      ?result coso:measurementValue ?result_value ;
              coso:measurementUnit ?unit .
      OPTIONAL { ?unit qudt:symbol ?unit_sym0 }
      BIND(COALESCE(?unit_sym0, REPLACE(STR(?unit), "^.*[#/]", "")) AS ?unit_sym)
      ${outerFilter}
      OPTIONAL { ?observation sosa:resultTime ?date }
      OPTIONAL { ?sample dcterms:identifier ?sampleId }
    }
    GROUP BY ?sp ?spWKT ?sample ?observation ?date ?substance ?result_value ?unit_sym
    ORDER BY ?sp ?sample ?substance DESC(?date)
  `;
}

export interface FusedFlowlineOpts {
  anchor: EntityBlock;
  direction: 'downstream' | 'upstream';
  anchorIris: string[];
  maxDistanceKm?: number;
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
  const anchorBind = bindEntityInCell(opts.anchor, '?s2anchor', 'A');
  // ponytail: inlined as VALUES rather than re-derived. Anchor sets are small
  // (tens), unlike the sample IRI lists that forced server-side fusion.
  const anchorValues = `VALUES ${entityIriVar(opts.anchor, 'A')} { ${opts.anchorIris
    .map(wrapUri)
    .join(' ')} }`;

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

  // Unbounded: the flowline set is the plain transitive closure.
  if (!opts.maxDistanceKm) {
    return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName WHERE {
      ${seedCells}
      ${flowlinePattern}
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
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
                nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
}
