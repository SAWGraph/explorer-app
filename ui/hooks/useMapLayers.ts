import { useMemo } from 'react';
import type { PipelineResult } from '../../engine/executor';
import type { MapFeature } from '../../engine/types/map';
import {
  transformSamplesToFeatures,
  transformFacilitiesToFeatures,
  transformWaterBodiesToFeatures,
  transformWellsToFeatures,
  transformFlowlinesToFeatures,
  transformRegionBoundaries,
} from '../../engine/shape';

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

    const boundaryRows = result.decoration.boundaries;
    const flowlineRows = result.decoration.streamLines;

    // Determine what types came back by checking row shapes
    const allRows = [...result.blockA, ...result.blockC];

    const sampleRows = allRows.filter((r) => r.spWKT);
    const facilityRows = allRows.filter((r) => r.facWKT);
    const waterBodyRows = allRows.filter((r) => r.wbWKT);
    const wellRows = allRows.filter((r) => r.wellWKT);
    // Streams can arrive either as the answer set (hydrated, when a block is
    // streams) or as the supporting layer traced from the anchors.
    const streamRows = allRows.filter((r) => r.flowlineWKT);

    // Popup detail is fetched per sample on open (useSampleDetails), not here.
    const sampleFeatures = transformSamplesToFeatures(sampleRows);

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
      streams: transformFlowlinesToFeatures([...streamRows, ...flowlineRows]),
      regionBoundaries: transformRegionBoundaries(boundaryRows),
      matchedAquiferIris,
    };
  }, [result]);
}
