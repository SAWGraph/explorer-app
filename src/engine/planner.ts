import type { AnalysisQuestion, EntityBlock } from '../types/query';
import type { EndpointKey } from '../constants/endpoints';
import type { SparqlRow } from '../types/sparql';
import { entityTypeLabel } from '../utils/questionGenerator';
import {
  buildFusedNearQuery,
  buildFusedHydrologyQuery,
  buildFusedFlowlineQuery,
  buildFusedWellQuery,
} from './templates/fusedQueries';
import {
  buildFacilitiesByIri,
  buildStreamsByIri,
  buildWaterBodiesByIri,
  buildSamplesByIri,
} from './templates/hydrate';
import { buildAquifersByIri } from './templates/aquifers';
import { buildRegionBoundaryQuery } from './templates/spatial';
import {
  chooseAxis,
  refineRegionScope,
  halve,
  chunk,
  IRI_CHUNK,
  type Scope,
} from './scope';

// Reads the way the user chose it: these are the three labels in
// RELATIONSHIP_TYPES (src/components/QueryEditor/RelationshipSelector.tsx).
// 'within' is in the type union but is never offered and never planned for.
const RELATIONSHIP_PREPOSITION: Record<AnalysisQuestion['relationship']['type'], string> = {
  near: 'near',
  downstream: 'downstream of',
  upstream: 'upstream from',
  within: 'within',
};

export type PipelineStepType =
  | 'FIND_TARGET_IRIS'
  | 'FIND_ANCHOR_IRIS'
  | 'HYDRATE_TARGET_BY_IRI'
  | 'HYDRATE_ANCHOR_BY_IRI'
  | 'GET_SAMPLE_DETAILS'
  | 'GET_FLOWLINE_GEOMETRIES'
  | 'GET_REGION_BOUNDARIES';

export interface PipelineStep {
  type: PipelineStepType;
  endpoint: EndpointKey;
  description: string;
  buildQuery: (context: PipelineContext, scope?: Scope) => string;
  // Pre-split before the first attempt. Only for steps that inline a list of
  // IRIs, where the list length is already known and a single request would
  // exceed the gateway's body limit.
  initialScopes?: (context: PipelineContext) => Scope[] | undefined;
  // Called when a scope fails with a splittable error. Returns smaller scopes,
  // or null when this step cannot be divided any further.
  divide?: (context: PipelineContext, scope: Scope | undefined) => Promise<Scope[] | null>;
  // Losing this step degrades the map but still leaves a usable answer.
  optional?: boolean;
  // Reuse the response for the rest of the session (immutable reference data).
  cache?: boolean;
}

export interface PipelineContext {
  question: AnalysisQuestion;
  targetIris: string[];
  anchorIris: string[];
  results: Record<string, SparqlRow[]>;
}

function getRegionCodes(block: EntityBlock): string[] {
  const region = block.region;
  if (!region) return [];
  if (region.countyCodes?.length) return region.countyCodes;
  if (region.stateCode) return [region.stateCode];
  return [];
}

function entityEndpoint(block: EntityBlock): EndpointKey {
  switch (block.type) {
    case 'facilities':
      return 'federation';
    case 'samples':
      return 'sawgraph';
    case 'waterBodies':
    case 'wells':
    case 'aquifers':
    case 'streams':
      return 'hydrologykg';
  }
}

interface FusedContext {
  anchorBlock: EntityBlock;
  targetBlock: EntityBlock;
  relationship: AnalysisQuestion['relationship'];
  direction: 'downstream' | 'upstream';
  anchorRegion?: string[];
  targetRegion?: string[];
}

function hydrateStep(
  block: EntityBlock,
  side: 'target' | 'anchor',
  fused: FusedContext,
): PipelineStep {
  const type = side === 'target' ? 'HYDRATE_TARGET_BY_IRI' : 'HYDRATE_ANCHOR_BY_IRI';
  // Samples and wells are server-fused (re-derive their entity set inside one
  // federated query) — statewide sets are thousands of IRIs and inlining them
  // as VALUES makes the request body exceed the gateway limit (502/413). Other
  // entity types stay on IRI-based hydration where the IRI list is small.
  const endpoint =
    block.type === 'samples' || block.type === 'wells'
      ? 'federation'
      : entityEndpoint(block);
  // "target"/"anchor" are planner concepts, and which block they name flips
  // between relationship types, so they have no business in a user-facing
  // label. Wells are the one case where this understates the work: their step
  // re-derives the whole set server-side (see above) rather than loading
  // details of what discovery found. The label describes what the step
  // delivers, which is what the progress strip is for.
  const description = `Loading details for ${entityTypeLabel(block.type)}`;

  return {
    type,
    endpoint,
    description,
    buildQuery: (ctx, scope) => {
      if (block.type === 'samples') {
        // Hydrate from the IRIs the previous step already resolved. Re-deriving
        // the spatial/hydrology trace here is what used to time out; chunking
        // (see initialScopes below) removes the size limit that made the old
        // by-IRI path conditional.
        return buildSamplesByIri(irisFor(ctx, scope, side), block.sampleFilters);
      }
      if (block.type === 'wells') {
        return buildFusedWellQuery({
          anchor: fused.anchorBlock,
          target: fused.targetBlock,
          relationship: fused.relationship,
          direction: fused.direction,
          anchorRegion: fused.anchorRegion,
          targetRegion: fused.targetRegion,
          wellSide: side === 'target' ? 'target' : 'anchor',
        });
      }
      const iris = irisFor(ctx, scope, side);
      switch (block.type) {
        case 'facilities':
          return buildFacilitiesByIri(iris, block.facilityFilters);
        case 'waterBodies':
          return buildWaterBodiesByIri(iris, block.waterBodyFilters);
        case 'aquifers':
          return buildAquifersByIri(iris);
        case 'streams':
          return buildStreamsByIri(iris, block.streamFilters);
      }
    },
    // Wells re-derive their set server-side (they can run to 80k+ IRIs), so
    // there is no IRI list to pre-split for them.
    initialScopes:
      block.type === 'wells'
        ? undefined
        : (ctx) => iriScopes(side === 'target' ? ctx.targetIris : ctx.anchorIris, side),
    divide: async (ctx, scope) =>
      divideIriList(scope, side === 'target' ? ctx.targetIris : ctx.anchorIris, side),
  };
}

// Splitting a by-IRI step. With a scope in hand we halve it; without one the
// step ran the full list in a single request (under IRI_CHUNK), so halve that
// list instead of giving up.
function divideIriList(
  scope: Scope | undefined,
  allIris: string[],
  side: 'target' | 'anchor',
): Scope[] | null {
  if (scope) return halve(scope);
  if (allIris.length < 2) return null;
  return halve({
    label: 'all',
    ...(side === 'target' ? { targetIris: allIris } : { anchorIris: allIris }),
  });
}

// The IRIs a by-IRI step should hydrate: the chunk's slice when running a chunk,
// otherwise everything the discovery step found.
function irisFor(
  ctx: PipelineContext,
  scope: Scope | undefined,
  side: 'target' | 'anchor',
): string[] {
  const scoped = side === 'target' ? scope?.targetIris : scope?.anchorIris;
  return scoped ?? (side === 'target' ? ctx.targetIris : ctx.anchorIris);
}

function iriScopes(iris: string[], side: 'target' | 'anchor'): Scope[] | undefined {
  if (iris.length <= IRI_CHUNK) return undefined;
  return chunk(iris, IRI_CHUNK).map((slice, i) => ({
    label: `batch ${i + 1}`,
    ...(side === 'target' ? { targetIris: slice } : { anchorIris: slice }),
  }));
}

function buildFusedSteps(question: AnalysisQuestion): PipelineStep[] {
  const { blockA, relationship, blockC } = question;

  // Map the question's anchor/target semantics consistently:
  //   - near:       anchor=blockC, target=blockA
  //   - downstream: anchor=blockC, target=blockA (samples downstream of facilities)
  //   - upstream:   anchor=blockA, target=blockC
  //
  // The anchor is the side the fused templates seed from, and seeding an
  // unfiltered side (every stream in the country) times out — so the anchor is
  // the side the question filtered, which for an upstream question is block A.
  let anchorBlock: EntityBlock;
  let targetBlock: EntityBlock;
  if (relationship.type === 'upstream') {
    anchorBlock = blockA;
    targetBlock = blockC;
  } else {
    anchorBlock = blockC;
    targetBlock = blockA;
  }

  // The templates only trace one way: the target comes out `direction` of the
  // anchor. With the anchor always on the upstream side of the question — C for
  // "A downstream from C", A for "A upstream from C" — the trace is always
  // downstream from it. Passing 'upstream' here alongside anchor=blockA, as
  // this did, answered the mirror question: streams upstream of the facilities
  // instead of the facilities upstream of the streams.
  const traceDirection = 'downstream' as const;

  const anchorRegion = getRegionCodes(anchorBlock);
  const targetRegion = getRegionCodes(targetBlock);
  const anchorRegionOpt = anchorRegion.length ? anchorRegion : undefined;
  const targetRegionOpt = targetRegion.length ? targetRegion : undefined;

  const steps: PipelineStep[] = [];

  // A scope narrows one side of the question: either to a slice of IRIs, or to
  // a subset of the region that side was already filtered to.
  const scopedRegions = (scope?: Scope) => ({
    anchorRegion:
      scope?.regionSide === 'anchor' ? scope.regionCodes : anchorRegionOpt,
    targetRegion:
      scope?.regionSide === 'target' ? scope.regionCodes : targetRegionOpt,
  });

  const buildIriQuery = (project: 'target' | 'anchor', scope?: Scope): string => {
    const shared = {
      anchor: anchorBlock,
      target: targetBlock,
      project,
      anchorIris: scope?.anchorIris,
      targetIris: scope?.targetIris,
      ...scopedRegions(scope),
    };
    if (relationship.type === 'near') {
      return buildFusedNearQuery({ ...shared, hops: relationship.hops ?? 1 });
    }
    return buildFusedHydrologyQuery({
      ...shared,
      direction: traceDirection,
      maxDistanceKm: relationship.maxDistanceKm,
    });
  };

  // Splitting a discovery query: halve a slice we already have, otherwise work
  // out which side can be enumerated (see chooseAxis in scope.ts).
  const axisContext = {
    anchorBlock,
    targetBlock,
    anchorRegion: anchorRegionOpt,
    targetRegion: targetRegionOpt,
    endpoint: 'federation' as const,
  };

  const divideDiscovery = async (_ctx: PipelineContext, scope: Scope | undefined) => {
    if (!scope) return chooseAxis(axisContext);
    // Halve what we have; when a region slice is down to one county and still
    // fails, switch axis and chunk the targets inside it.
    return halve(scope) ?? refineRegionScope(axisContext, scope);
  };

  // Both discovery steps are one fused query that resolves block A and block C
  // together, so a label naming only one side reads as though the other had not
  // been queried yet — which is exactly how it was reported. Name both, in the
  // words of the question the user asked ("What <A> are <rel> <C>?").
  //
  // Which step returns which block is not fixed: the anchor/target mapping
  // above puts block A on the target side for near and downstream, and on the
  // anchor side for upstream. Key the label off the block the step returns, not
  // off its target/anchor role, or the upstream labels come out swapped.
  const prep = RELATIONSHIP_PREPOSITION[relationship.type];
  const aLabel = entityTypeLabel(blockA.type);
  const cLabel = entityTypeLabel(blockC.type);
  const findingA = `Finding ${aLabel} ${prep} ${cLabel}`;
  const findingC = `Finding ${cLabel} with ${aLabel} ${prep} them`;
  const targetIsBlockA = relationship.type !== 'upstream';

  steps.push({
    type: 'FIND_TARGET_IRIS',
    endpoint: 'federation',
    description: targetIsBlockA ? findingA : findingC,
    buildQuery: (_ctx, scope) => buildIriQuery('target', scope),
    divide: divideDiscovery,
  });
  steps.push({
    type: 'FIND_ANCHOR_IRIS',
    endpoint: 'federation',
    description: targetIsBlockA ? findingC : findingA,
    buildQuery: (_ctx, scope) => buildIriQuery('anchor', scope),
    divide: divideDiscovery,
  });

  // Supporting stream layer. Skipped when a side is already streams — those
  // flowlines come back as the answer set and would be drawn twice.
  const streamsAreAnswer =
    targetBlock.type === 'streams' || anchorBlock.type === 'streams';
  if (relationship.type !== 'near' && !streamsAreAnswer) {
    steps.push({
      type: 'GET_FLOWLINE_GEOMETRIES',
      endpoint: 'federation',
      description: `Loading ${relationship.type} stream geometries`,
      // Runs after FIND_ANCHOR_IRIS so it can trace from the resolved anchors.
      buildQuery: (ctx, scope) =>
        buildFusedFlowlineQuery({
          anchor: anchorBlock,
          target: targetBlock,
          direction: traceDirection,
          anchorIris: scope?.anchorIris ?? ctx.anchorIris,
          // Never sliced: the target set bounds the trace, so a partial list
          // would silently shrink the drawn network rather than split it.
          targetIris: ctx.targetIris,
          maxDistanceKm: relationship.maxDistanceKm,
        }),
      initialScopes: (ctx) => iriScopes(ctx.anchorIris, 'anchor'),
      divide: async (ctx, scope) => divideIriList(scope, ctx.anchorIris, 'anchor'),
      // Stream geometry is map decoration — losing a slice of it should not
      // discard the samples and facilities the run already found.
      optional: true,
    });
  }

  const fusedCtx: FusedContext = {
    anchorBlock,
    targetBlock,
    relationship,
    direction: traceDirection,
    anchorRegion: anchorRegionOpt,
    targetRegion: targetRegionOpt,
  };

  steps.push(hydrateStep(targetBlock, 'target', fusedCtx));
  steps.push(hydrateStep(anchorBlock, 'anchor', fusedCtx));

  // Per-observation detail is no longer fetched up front. It filled map popups
  // one click at a time but cost 18–37MB per run (one sample point is ~30KB);
  // useSampleDetails fetches it per sample when a popup opens.
  // Region boundaries
  const stateCode = blockA.region?.stateCode || blockC.region?.stateCode;
  const hasRegion = anchorRegion.length > 0 || targetRegion.length > 0;
  if (hasRegion && stateCode) {
    steps.push({
      type: 'GET_REGION_BOUNDARIES',
      endpoint: 'spatialkg',
      description: 'Loading region boundaries',
      buildQuery: () => buildRegionBoundaryQuery(stateCode),
      // County outlines never change within a session, and this step was
      // measured at 25.5s on a cold cache (docs/QUERY-MATRIX.md 3.8).
      cache: true,
      optional: true,
    });
  }

  return steps;
}

export function planPipeline(question: AnalysisQuestion): PipelineStep[] {
  return buildFusedSteps(question);
}
