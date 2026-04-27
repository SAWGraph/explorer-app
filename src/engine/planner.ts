import type { AnalysisQuestion, EntityBlock } from '../types/query';
import type { EndpointKey } from '../constants/endpoints';
import type { SparqlRow } from '../types/sparql';
import { s2CellsToValuesString } from '../utils/s2cells';
import { buildFacilityS2Query, buildFacilityDetailsQuery } from './templates/facilities';
import { buildSampleS2Query, buildSampleRetrievalQuery, buildSampleDetailQuery } from './templates/samples';
import { buildWaterBodyS2Query, buildWaterBodyRetrievalQuery } from './templates/waterBodies';
import { buildWellS2Query, buildWellRetrievalQuery } from './templates/wells';
import { buildStrictRegionFilterQuery, buildNearExpansionQuery, buildAnchorFilterByTargetProximity, buildRegionBoundaryQuery } from './templates/spatial';
import { buildDownstreamTraceQuery, buildUpstreamTraceQuery } from './templates/hydrology';

export type PipelineStepType =
  | 'GET_S2_FOR_ANCHOR'
  | 'FILTER_S2_TO_REGION'
  | 'EXPAND_S2_NEAR'
  | 'EXPAND_TARGET_S2_NEAR'
  | 'TRACE_DOWNSTREAM'
  | 'TRACE_UPSTREAM'
  | 'FILTER_S2_POST_SPATIAL'
  | 'FIND_TARGET_ENTITIES'
  | 'FILTER_ANCHOR_TO_NEARBY_TARGETS'
  | 'GET_ANCHOR_DETAILS'
  | 'GET_SAMPLE_DETAILS'
  | 'GET_REGION_BOUNDARIES';

export interface PipelineStep {
  type: PipelineStepType;
  endpoint: EndpointKey;
  description: string;
  buildQuery: (context: PipelineContext) => string;
}

export interface PipelineContext {
  question: AnalysisQuestion;
  s2Cells: string[];
  anchorS2Cells: string[];
  targetS2Cells: string[];
  results: Record<string, SparqlRow[]>;
}

function getS2Step(block: EntityBlock, regionCodes?: string[]): PipelineStep {
  switch (block.type) {
    case 'facilities':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'federation',
        description: 'Finding S2 cells containing matching facilities',
        buildQuery: () => buildFacilityS2Query(block.facilityFilters, regionCodes),
      };
    case 'samples':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'sawgraph',
        description: 'Finding S2 cells containing matching samples',
        buildQuery: () => buildSampleS2Query(block.sampleFilters, regionCodes),
      };
    case 'waterBodies':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'hydrologykg',
        description: 'Finding S2 cells containing water bodies',
        buildQuery: () => buildWaterBodyS2Query(block.waterBodyFilters, regionCodes),
      };
    case 'wells':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'hydrologykg',
        description: 'Finding S2 cells containing wells',
        buildQuery: () => buildWellS2Query(block.wellFilters, regionCodes),
      };
  }
}


function strictRegionFilterStep(regionCodes: string[]): PipelineStep {
  return {
    type: 'FILTER_S2_POST_SPATIAL',
    endpoint: 'spatialkg',
    description: `Filtering to region ${regionCodes.join(', ')}`,
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildStrictRegionFilterQuery(vals, regionCodes);
    },
  };
}

function expandNearStep(): PipelineStep {
  return {
    type: 'EXPAND_S2_NEAR',
    endpoint: 'spatialkg',
    description: 'Expanding to neighboring S2 cells (touching neighbors)',
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildNearExpansionQuery(vals);
    },
  };
}

function expandTargetNearStep(): PipelineStep {
  return {
    type: 'EXPAND_TARGET_S2_NEAR',
    endpoint: 'spatialkg',
    description: 'Expanding target S2 cells to neighbors',
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.targetS2Cells);
      return buildNearExpansionQuery(vals);
    },
  };
}

function filterAnchorToNearbyTargetsStep(): PipelineStep {
  return {
    type: 'FILTER_ANCHOR_TO_NEARBY_TARGETS',
    endpoint: 'spatialkg',
    description: 'Filtering anchors to only those near found targets',
    buildQuery: (ctx) => {
      const anchorVals = s2CellsToValuesString(ctx.anchorS2Cells);
      const targetVals = s2CellsToValuesString(ctx.targetS2Cells);
      return buildAnchorFilterByTargetProximity(anchorVals, targetVals);
    },
  };
}

function traceDownstreamStep(): PipelineStep {
  return {
    type: 'TRACE_DOWNSTREAM',
    endpoint: 'hydrologykg',
    description: 'Tracing downstream flow paths',
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildDownstreamTraceQuery(vals);
    },
  };
}

function traceUpstreamStep(): PipelineStep {
  return {
    type: 'TRACE_UPSTREAM',
    endpoint: 'hydrologykg',
    description: 'Tracing upstream flow paths',
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildUpstreamTraceQuery(vals);
    },
  };
}

function findEntitiesStep(block: EntityBlock): PipelineStep {
  switch (block.type) {
    case 'samples':
      return {
        type: 'FIND_TARGET_ENTITIES',
        endpoint: 'sawgraph',
        description: 'Finding samples in target area',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.s2Cells);
          return buildSampleRetrievalQuery(vals, block.sampleFilters);
        },
      };
    case 'facilities':
      return {
        type: 'FIND_TARGET_ENTITIES',
        endpoint: 'federation',
        description: 'Finding facilities in target area',
        buildQuery: (ctx) => buildFacilityDetailsQuery(block.facilityFilters, ctx.s2Cells),
      };
    case 'waterBodies':
      return {
        type: 'FIND_TARGET_ENTITIES',
        endpoint: 'hydrologykg',
        description: 'Finding water bodies in target area',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.s2Cells);
          return buildWaterBodyRetrievalQuery(vals, block.waterBodyFilters);
        },
      };
    case 'wells':
      return {
        type: 'FIND_TARGET_ENTITIES',
        endpoint: 'hydrologykg',
        description: 'Finding wells in target area',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.s2Cells);
          return buildWellRetrievalQuery(vals, block.wellFilters);
        },
      };
  }
}

function getDetailsStep(block: EntityBlock): PipelineStep {
  switch (block.type) {
    case 'facilities':
      return {
        type: 'GET_ANCHOR_DETAILS',
        endpoint: 'federation',
        description: 'Getting facility details for map',
        buildQuery: (ctx) => buildFacilityDetailsQuery(block.facilityFilters, ctx.anchorS2Cells),
      };
    case 'samples':
      return {
        type: 'GET_ANCHOR_DETAILS',
        endpoint: 'sawgraph',
        description: 'Getting sample details for map',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.anchorS2Cells);
          return buildSampleRetrievalQuery(vals, block.sampleFilters);
        },
      };
    case 'waterBodies':
      return {
        type: 'GET_ANCHOR_DETAILS',
        endpoint: 'hydrologykg',
        description: 'Getting water body details for map',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.anchorS2Cells);
          return buildWaterBodyRetrievalQuery(vals, block.waterBodyFilters);
        },
      };
    case 'wells':
      return {
        type: 'GET_ANCHOR_DETAILS',
        endpoint: 'hydrologykg',
        description: 'Getting well details for map',
        buildQuery: (ctx) => {
          const vals = s2CellsToValuesString(ctx.anchorS2Cells);
          return buildWellRetrievalQuery(vals, block.wellFilters);
        },
      };
  }
}

function getRegionCodes(block: EntityBlock): string[] {
  const region = block.region;
  if (!region) return [];
  if (region.countyCodes?.length) return region.countyCodes;
  if (region.stateCode) return [region.stateCode];
  return [];
}

export function planPipeline(question: AnalysisQuestion): PipelineStep[] {
  const { blockA, relationship, blockC } = question;
  const steps: PipelineStep[] = [];

  if (relationship.type === 'near') {
    // Start from Block C (the anchor entity), find Block A nearby.
    // Step 1 filters to region directly in SPARQL, so no separate region filter
    // step is needed — that would cause a double expansion (wrong search radius).
    const regionCodesC = getRegionCodes(blockC);
    const regionCodesA = getRegionCodes(blockA);
    const preExpandRegion = regionCodesC.length ? regionCodesC : regionCodesA.length ? regionCodesA : undefined;

    steps.push(getS2Step(blockC, preExpandRegion));  // anchorS2Cells saved here

    // Expand to neighboring S2 cells. Each hop adds ~1.6 km radius.
    const hops = relationship.hops || 1;
    for (let i = 0; i < hops; i++) {
      steps.push(expandNearStep());
    }

    // Clip to Block A's region after expansion to avoid cross-border targets
    if (regionCodesA.length) {
      steps.push({
        ...strictRegionFilterStep(regionCodesA),
        type: 'FILTER_S2_POST_SPATIAL',
      });
    }

    steps.push(findEntitiesStep(blockA));  // targetS2Cells extracted here by executor

    // For multi-hop, expand target S2 cells so the reverse filter matches
    // the same radius used for forward expansion.
    for (let i = 0; i < hops - 1; i++) {
      steps.push(expandTargetNearStep());
    }

    // Reverse-lookup: only show anchor entities that are near the found targets
    steps.push(filterAnchorToNearbyTargetsStep());  // updates anchorS2Cells

    steps.push(getDetailsStep(blockC));
  } else if (relationship.type === 'downstream') {
    // Start from Block C (anchor), trace downstream, find Block A (targets).
    // Expand 1 hop before tracing to capture flow paths near the anchor cells.
    // Step 1 already filters to region, so we use expandNearStep (not filterS2ToRegionStep)
    // to avoid a redundant region filter.
    const regionCodesC = getRegionCodes(blockC);
    const regionCodesA = getRegionCodes(blockA);
    const preTraceRegion = regionCodesC.length ? regionCodesC : regionCodesA.length ? regionCodesA : undefined;

    steps.push(getS2Step(blockC, preTraceRegion));  // anchorS2Cells saved here

    // Expand to capture flow paths in adjacent cells before tracing downstream
    steps.push(expandNearStep());

    steps.push(traceDownstreamStep());

    // Strict region filter on Block A's region after tracing (no expansion)
    if (regionCodesA.length) {
      steps.push(strictRegionFilterStep(regionCodesA));
    }

    steps.push(findEntitiesStep(blockA));
    steps.push(getDetailsStep(blockC));
  } else if (relationship.type === 'upstream') {
    // Start from Block A (anchor), trace upstream, find Block C (targets).
    // Expand 1 hop before tracing to capture flow paths near the anchor cells.
    const regionCodesA = getRegionCodes(blockA);

    steps.push(getS2Step(blockA, regionCodesA.length ? regionCodesA : undefined));  // anchorS2Cells saved here

    // Expand to capture flow paths in adjacent cells before tracing upstream
    steps.push(expandNearStep());

    steps.push(traceUpstreamStep());

    steps.push(findEntitiesStep(blockC));
    steps.push(getDetailsStep(blockA));
  }

  // Sample detail query — fetch per-observation data for richer popups
  if (blockA.type === 'samples' || blockC.type === 'samples') {
    const sampleBlock = blockA.type === 'samples' ? blockA : blockC;
    steps.push({
      type: 'GET_SAMPLE_DETAILS',
      endpoint: 'sawgraph',
      description: 'Loading sample observation details',
      buildQuery: (ctx) => {
        // Combine S2 cells from both target and anchor results to cover all samples
        const allCells = [...new Set([...ctx.targetS2Cells, ...ctx.anchorS2Cells])];
        const vals = s2CellsToValuesString(allCells.length > 0 ? allCells : ctx.s2Cells);
        return buildSampleDetailQuery(vals, sampleBlock.sampleFilters);
      },
    });
  }

  // Region boundaries
  const regionCodesA = getRegionCodes(blockA);
  const regionCodesC = getRegionCodes(blockC);
  const hasBoundaryRegion = regionCodesA.length > 0 || regionCodesC.length > 0;
  if (hasBoundaryRegion) {
    // Use state code for boundaries
    const stateCode = blockA.region?.stateCode || blockC.region?.stateCode;
    if (stateCode) {
      steps.push({
        type: 'GET_REGION_BOUNDARIES',
        endpoint: 'spatialkg',
        description: 'Loading region boundaries',
        buildQuery: () => buildRegionBoundaryQuery(stateCode),
      });
    }
  }

  return steps;
}
