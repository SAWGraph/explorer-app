import type { AnalysisQuestion, EntityBlock } from '../types/query';
import type { EndpointKey } from '../constants/endpoints';
import type { SparqlRow } from '../types/sparql';
import { s2CellsToValuesString } from '../utils/s2cells';
import { buildFacilityS2Query, buildFacilityDetailsQuery } from './templates/facilities';
import { buildSampleS2Query, buildSampleRetrievalQuery } from './templates/samples';
import { buildWaterBodyS2Query, buildWaterBodyRetrievalQuery } from './templates/waterBodies';
import { buildRegionFilterQuery, buildStrictRegionFilterQuery, buildNearExpansionQuery, buildRegionBoundaryQuery } from './templates/spatial';
import { buildDownstreamTraceQuery, buildUpstreamTraceQuery } from './templates/hydrology';

export type PipelineStepType =
  | 'GET_S2_FOR_ANCHOR'
  | 'FILTER_S2_TO_REGION'
  | 'EXPAND_S2_NEAR'
  | 'TRACE_DOWNSTREAM'
  | 'TRACE_UPSTREAM'
  | 'FILTER_S2_POST_SPATIAL'
  | 'FIND_TARGET_ENTITIES'
  | 'GET_ANCHOR_DETAILS'
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
  results: Record<string, SparqlRow[]>;
}

function getS2Step(block: EntityBlock): PipelineStep {
  switch (block.type) {
    case 'facilities':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'federation',
        description: 'Finding S2 cells containing matching facilities',
        buildQuery: () => buildFacilityS2Query(block.facilityFilters),
      };
    case 'samples':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'sawgraph',
        description: 'Finding S2 cells containing matching samples',
        buildQuery: () => buildSampleS2Query(block.sampleFilters),
      };
    case 'waterBodies':
      return {
        type: 'GET_S2_FOR_ANCHOR',
        endpoint: 'hydrologykg',
        description: 'Finding S2 cells containing water bodies',
        buildQuery: () => buildWaterBodyS2Query(block.waterBodyFilters),
      };
  }
}

function filterS2ToRegionStep(regionCode: string): PipelineStep {
  return {
    type: 'FILTER_S2_TO_REGION',
    endpoint: 'spatialkg',
    description: `Filtering to region ${regionCode}`,
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildRegionFilterQuery(vals, regionCode);
    },
  };
}

function strictRegionFilterStep(regionCode: string): PipelineStep {
  return {
    type: 'FILTER_S2_POST_SPATIAL',
    endpoint: 'spatialkg',
    description: `Filtering to region ${regionCode}`,
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildStrictRegionFilterQuery(vals, regionCode);
    },
  };
}

function expandNearStep(): PipelineStep {
  return {
    type: 'EXPAND_S2_NEAR',
    endpoint: 'spatialkg',
    description: 'Expanding to neighboring S2 cells (~10km)',
    buildQuery: (ctx) => {
      const vals = s2CellsToValuesString(ctx.s2Cells);
      return buildNearExpansionQuery(vals);
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
        endpoint: 'fiokg',
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
  }
}

function getDetailsStep(block: EntityBlock): PipelineStep {
  switch (block.type) {
    case 'facilities':
      return {
        type: 'GET_ANCHOR_DETAILS',
        endpoint: 'fiokg',
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
  }
}

function getRegionCode(block: EntityBlock): string | undefined {
  const region = block.region;
  if (!region) return undefined;
  if (region.countyCodes?.length) return region.countyCodes[0];
  return region.stateCode;
}

export function planPipeline(question: AnalysisQuestion): PipelineStep[] {
  const { blockA, relationship, blockC } = question;
  const steps: PipelineStep[] = [];

  if (relationship.type === 'near') {
    // Start from Block C (the anchor entity), find Block A nearby
    steps.push(getS2Step(blockC));

    // Filter to region BEFORE expanding to keep S2 cell count manageable
    const regionCodeC = getRegionCode(blockC);
    const regionCodeA = getRegionCode(blockA);
    const preExpandRegion = regionCodeC || regionCodeA;
    if (preExpandRegion) steps.push(filterS2ToRegionStep(preExpandRegion));

    steps.push(expandNearStep());

    // Also filter AFTER expanding to the target region
    if (regionCodeA) {
      steps.push({
        ...strictRegionFilterStep(regionCodeA),
        type: 'FILTER_S2_POST_SPATIAL',
      });
    }

    steps.push(findEntitiesStep(blockA));
    steps.push(getDetailsStep(blockC));
  } else if (relationship.type === 'downstream') {
    // Start from Block C (facilities), trace downstream, find Block A
    steps.push(getS2Step(blockC));

    // Filter to region BEFORE tracing to keep S2 cell count manageable
    const regionCodeC = getRegionCode(blockC);
    const regionCodeA = getRegionCode(blockA);
    const preTraceRegion = regionCodeC || regionCodeA;
    if (preTraceRegion) steps.push(filterS2ToRegionStep(preTraceRegion));

    steps.push(traceDownstreamStep());

    // Also filter AFTER tracing to the target region (strict, no expansion)
    if (regionCodeA) {
      steps.push(strictRegionFilterStep(regionCodeA));
    }

    steps.push(findEntitiesStep(blockA));
    steps.push(getDetailsStep(blockC));
  } else if (relationship.type === 'upstream') {
    // Start from Block A (samples), trace upstream, find Block C
    steps.push(getS2Step(blockA));

    const regionCodeA = getRegionCode(blockA);
    if (regionCodeA) steps.push(filterS2ToRegionStep(regionCodeA));

    steps.push(traceUpstreamStep());

    steps.push(findEntitiesStep(blockC));
    steps.push(getDetailsStep(blockA));
  }

  // Region boundaries
  const regionA = getRegionCode(blockA);
  const regionC = getRegionCode(blockC);
  const boundaryRegion = regionA || regionC;
  if (boundaryRegion) {
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
