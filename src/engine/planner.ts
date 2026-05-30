import type { AnalysisQuestion, EntityBlock } from '../types/query';
import type { EndpointKey } from '../constants/endpoints';
import type { SparqlRow } from '../types/sparql';
import {
  buildFusedNearQuery,
  buildFusedHydrologyQuery,
  buildFusedFlowlineQuery,
  buildFusedSampleAggregateQuery,
  buildFusedSampleDetailsQuery,
} from './templates/fusedQueries';
import {
  buildFacilitiesByIri,
  buildWaterBodiesByIri,
  buildWellsByIri,
} from './templates/hydrate';
import { buildRegionBoundaryQuery } from './templates/spatial';

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
  buildQuery: (context: PipelineContext) => string;
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
      return 'hydrologykg';
  }
}

interface FusedContext {
  anchorBlock: EntityBlock;
  targetBlock: EntityBlock;
  relationship: AnalysisQuestion['relationship'];
  anchorRegion?: string[];
  targetRegion?: string[];
}

function hydrateStep(
  block: EntityBlock,
  side: 'target' | 'anchor',
  fused: FusedContext,
): PipelineStep {
  const type = side === 'target' ? 'HYDRATE_TARGET_BY_IRI' : 'HYDRATE_ANCHOR_BY_IRI';
  // Sample hydration is server-fused (re-derives sample IRIs via inner
  // subquery) — statewide queries can have 1000+ sample IRIs and inlining
  // them as VALUES makes the request body 502 the gateway. Other entity
  // types stay on IRI-based hydration where the IRI list is small.
  const endpoint = block.type === 'samples' ? 'federation' : entityEndpoint(block);
  const description = `Loading ${side === 'target' ? 'target' : 'anchor'} ${block.type} details`;

  return {
    type,
    endpoint,
    description,
    buildQuery: (ctx) => {
      if (block.type === 'samples') {
        return buildFusedSampleAggregateQuery({
          anchor: fused.anchorBlock,
          target: fused.targetBlock,
          relationship: fused.relationship,
          anchorRegion: fused.anchorRegion,
          targetRegion: fused.targetRegion,
          sampleSide: side === 'target' ? 'target' : 'anchor',
        });
      }
      const iris = side === 'target' ? ctx.targetIris : ctx.anchorIris;
      switch (block.type) {
        case 'facilities':
          return buildFacilitiesByIri(iris, block.facilityFilters);
        case 'waterBodies':
          return buildWaterBodiesByIri(iris, block.waterBodyFilters);
        case 'wells':
          return buildWellsByIri(iris, block.wellFilters);
      }
    },
  };
}

function buildFusedSteps(question: AnalysisQuestion): PipelineStep[] {
  const { blockA, relationship, blockC } = question;

  // Map the question's anchor/target semantics consistently:
  //   - near:       anchor=blockC, target=blockA
  //   - downstream: anchor=blockC, target=blockA (samples downstream of facilities)
  //   - upstream:   anchor=blockA, target=blockC
  let anchorBlock: EntityBlock;
  let targetBlock: EntityBlock;
  if (relationship.type === 'upstream') {
    anchorBlock = blockA;
    targetBlock = blockC;
  } else {
    anchorBlock = blockC;
    targetBlock = blockA;
  }

  const anchorRegion = getRegionCodes(anchorBlock);
  const targetRegion = getRegionCodes(targetBlock);
  const anchorRegionOpt = anchorRegion.length ? anchorRegion : undefined;
  const targetRegionOpt = targetRegion.length ? targetRegion : undefined;

  const steps: PipelineStep[] = [];

  const buildIriQuery = (project: 'target' | 'anchor'): string => {
    if (relationship.type === 'near') {
      return buildFusedNearQuery({
        anchor: anchorBlock,
        target: targetBlock,
        hops: relationship.hops || 1,
        project,
        anchorRegion: anchorRegionOpt,
        targetRegion: targetRegionOpt,
      });
    }
    return buildFusedHydrologyQuery({
      anchor: anchorBlock,
      target: targetBlock,
      direction: relationship.type === 'downstream' ? 'downstream' : 'upstream',
      project,
      anchorRegion: anchorRegionOpt,
      targetRegion: targetRegionOpt,
    });
  };

  const verb = relationship.type === 'near' ? 'nearby' : relationship.type;
  steps.push({
    type: 'FIND_TARGET_IRIS',
    endpoint: 'federation',
    description: `Finding ${verb} ${targetBlock.type}`,
    buildQuery: () => buildIriQuery('target'),
  });
  steps.push({
    type: 'FIND_ANCHOR_IRIS',
    endpoint: 'federation',
    description: `Finding ${anchorBlock.type} with ${verb} ${targetBlock.type}`,
    buildQuery: () => buildIriQuery('anchor'),
  });

  if (relationship.type !== 'near') {
    steps.push({
      type: 'GET_FLOWLINE_GEOMETRIES',
      endpoint: 'federation',
      description: `Loading ${relationship.type} stream geometries`,
      buildQuery: () =>
        buildFusedFlowlineQuery({
          anchor: anchorBlock,
          direction: relationship.type === 'downstream' ? 'downstream' : 'upstream',
          anchorRegion: anchorRegionOpt,
        }),
    });
  }

  const fusedCtx: FusedContext = {
    anchorBlock,
    targetBlock,
    relationship,
    anchorRegion: anchorRegionOpt,
    targetRegion: targetRegionOpt,
  };

  steps.push(hydrateStep(targetBlock, 'target', fusedCtx));
  steps.push(hydrateStep(anchorBlock, 'anchor', fusedCtx));

  // Per-observation sample details for popups, if either side is samples.
  // Server-fused (re-derives sample IRIs in an inner subquery) for the same
  // wire-size reason as sample hydration above. If both sides are samples,
  // the target side is used — covering both would require a UNION and the
  // anchor IRI set is typically a subset anyway when proximity is reciprocal.
  const sampleSide: 'target' | 'anchor' | null =
    targetBlock.type === 'samples'
      ? 'target'
      : anchorBlock.type === 'samples'
        ? 'anchor'
        : null;

  if (sampleSide) {
    steps.push({
      type: 'GET_SAMPLE_DETAILS',
      endpoint: 'federation',
      description: 'Loading sample observation details',
      buildQuery: () =>
        buildFusedSampleDetailsQuery({
          anchor: anchorBlock,
          target: targetBlock,
          relationship,
          anchorRegion: anchorRegionOpt,
          targetRegion: targetRegionOpt,
          sampleSide,
        }),
    });
  }

  // Region boundaries
  const stateCode = blockA.region?.stateCode || blockC.region?.stateCode;
  const hasRegion = anchorRegion.length > 0 || targetRegion.length > 0;
  if (hasRegion && stateCode) {
    steps.push({
      type: 'GET_REGION_BOUNDARIES',
      endpoint: 'spatialkg',
      description: 'Loading region boundaries',
      buildQuery: () => buildRegionBoundaryQuery(stateCode),
    });
  }

  return steps;
}

export function planPipeline(question: AnalysisQuestion): PipelineStep[] {
  return buildFusedSteps(question);
}
