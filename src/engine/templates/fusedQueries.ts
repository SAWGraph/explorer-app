import { PREFIXES } from '../../constants/prefixes';
import type {
  EntityBlock,
  FacilityFilters,
  AquiferFilters,
  SpatialRelationship,
} from '../../types/query';
import { wrapUri, buildSampleFilterClauses } from './samples';
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
// True when the sample block actually constrains observations. When it does not,
// the IRI-finding queries can skip the observation join entirely.
export function hasSampleFilters(block: EntityBlock): boolean {
  const f = block.type === 'samples' ? block.sampleFilters : undefined;
  if (!f) return false;
  return Boolean(
    f.substances?.length ||
      f.materialTypes?.length ||
      f.minConcentration != null ||
      f.maxConcentration != null ||
      f.includeNondetects === false,
  );
}

// `sampleObservations: false` drops the observation/material/result joins from a
// samples block. Only the IRI-finding queries may pass it: they project just the
// sample-point IRI, and re-deriving every observation there is what pushes the
// hydrology queries past QLever's 30s limit / memory ceiling (429/500). The
// hydrate queries still project those vars and must keep the full block.
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
      if (!sampleObservations) {
        return `?sp${suffix} rdf:type coso:SamplePoint ;
                spatial:connectedTo ${s2Var} .`;
      }
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
  const bind = bindEntityInCell(block, '?s2probe', 'P', hasSampleFilters(block));
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
}

// Returns just the inner WHERE-body patterns shared across all fused queries:
// anchor binding + spatial path (neighbor expansion for "near", hydrology trace
// for downstream/upstream) + target binding + region clauses on each side.
function buildFusedWhereBody(opts: FusedBodyOpts): string {
  // A sample block keeps its observation joins unless the caller drops them AND
  // no sample filter depends on them.
  const anchorObs = (opts.anchorSampleObservations ?? true) || hasSampleFilters(opts.anchor);
  const targetObs = (opts.targetSampleObservations ?? true) || hasSampleFilters(opts.target);
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

  const traceTriple =
    opts.mode === 'downstream'
      ? `?upstream_flowline hyf:downstreamFlowPathTC ?ds_flowline .`
      : `?ds_flowline hyf:downstreamFlowPathTC ?upstream_flowline .`;

  return `${anchorPin}${targetPin}?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
      ${aRegion}
      ${anchorBind}
      ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor .
      ?s2neighbor spatial:connectedTo ?upstream_flowline .
      ?upstream_flowline rdf:type hyf:HY_FlowPath .
      ${traceTriple}
      ?s2target spatial:connectedTo ?ds_flowline ;
                rdf:type kwg-ont:S2Cell_Level13 .
      ${tRegion}
      ${targetBind}`;
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
    anchorSampleObservations: opts.project !== 'anchor',
    targetSampleObservations: opts.project !== 'target',
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

export interface FusedWellSideOpts extends FusedBaseOpts {
  relationship: SpatialRelationship;
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
    mode: relationshipMode(opts.relationship),
    hops: opts.relationship.hops,
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
  direction: 'downstream' | 'upstream';
  anchorIris: string[];
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

  const flowlinePattern =
    opts.direction === 'downstream'
      ? `?upstream_flowline rdf:type hyf:HY_FlowPath ;
            spatial:connectedTo ?s2cellus ;
            hyf:downstreamFlowPathTC ?flowline .`
      : `?downstream_flowline rdf:type hyf:HY_FlowPath ;
            spatial:connectedTo ?s2cellus .
        ?flowline hyf:downstreamFlowPathTC ?downstream_flowline .`;

  return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName WHERE {
      {
        SELECT DISTINCT ?s2cellus WHERE {
          ${anchorValues}
          ?s2anchor rdf:type kwg-ont:S2Cell_Level13 .
          ${anchorBind}
          ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2cellus .
        }
      }
      ${flowlinePattern}
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
                nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
}
