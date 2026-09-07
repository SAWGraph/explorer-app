import { useMemo } from 'react';
import type { PipelineResult } from '../engine/executor';
import type { MapFeature } from '../types/map';
import {
  transformSamplesToFeatures,
  transformFacilitiesToFeatures,
  transformWaterBodiesToFeatures,
  transformWellsToFeatures,
  transformFlowlinesToFeatures,
  transformRegionBoundaries,
  enrichSampleFeaturesWithDetails,
} from '../engine/resultTransformer';

export interface MapLayerData {
  samples: MapFeature[];
  facilities: MapFeature[];
  waterBodies: MapFeature[];
  wells: MapFeature[];
  streams: MapFeature[];
  regionBoundaries: MapFeature[];
  // KG IRIs of aquifers matched by the current query (empty when the query has
  // no aquifer side). Used to scope the aquifer overlay to near-sample aquifers.
  matchedAquiferIris: string[];
}

export function useMapLayers(result: PipelineResult | null): MapLayerData {
  return useMemo(() => {
    const empty: MapLayerData = {
      samples: [],
      facilities: [],
      waterBodies: [],
      wells: [],
      streams: [],
      regionBoundaries: [],
      matchedAquiferIris: [],
    };

    if (!result || result.status !== 'success') return empty;

    const data = result.data;

    const targetRows = data['FIND_TARGET_ENTITIES'] || [];
    const anchorRows = data['GET_ANCHOR_DETAILS'] || [];
    const boundaryRows = data['GET_REGION_BOUNDARIES'] || [];
    const sampleDetailRows = data['GET_SAMPLE_DETAILS'] || [];
    const flowlineRows = data['GET_FLOWLINE_GEOMETRIES'] || [];

    // Determine what types came back by checking row shapes
    const allRows = [...targetRows, ...anchorRows];

    const sampleRows = allRows.filter((r) => r.spWKT);
    const facilityRows = allRows.filter((r) => r.facWKT);
    const waterBodyRows = allRows.filter((r) => r.wbWKT);
    const wellRows = allRows.filter((r) => r.wellWKT);

    const sampleFeatures = transformSamplesToFeatures(sampleRows);
    if (sampleDetailRows.length > 0) {
      enrichSampleFeaturesWithDetails(sampleFeatures, sampleDetailRows);
    }

    const matchedAquiferIris = [
      ...new Set(
        allRows
          .filter((r) => r.aquifer)
          .map((r) => r.aquifer as string),
      ),
    ];

    return {
      samples: sampleFeatures,
      facilities: transformFacilitiesToFeatures(facilityRows),
      waterBodies: transformWaterBodiesToFeatures(waterBodyRows),
      wells: transformWellsToFeatures(wellRows),
      streams: transformFlowlinesToFeatures(flowlineRows),
      regionBoundaries: transformRegionBoundaries(boundaryRows),
      matchedAquiferIris,
    };
  }, [result]);
}
