import type { LatLngExpression } from 'leaflet';

export interface MapLayer {
  id: string;
  label: string;
  type: 'samples' | 'facilities' | 'waterBodies' | 'wells' | 'streams' | 'regionBoundary';
  visible: boolean;
  data: MapFeature[];
}

export interface MapFeature {
  id: string;
  geometry: PointGeometry | LineGeometry | PolygonGeometry;
  properties: Record<string, string | number>;
  sampleDetails?: SamplePointDetail;
}

export interface SampleObservation {
  substance: string;
  // null when the lab reported no number. The graph distinguishes two reasons
  // and `status` carries which: coso:NonDetectQuantityValue ("non-detect",
  // looked for and not found) and coso:NonQuantifiedQuantityValue
  // ("non-quantified", no value reported). Both are real results and both were
  // invisible before: 227 of 271 at one Indiana point, 1,171 of 1,650 in Maine.
  result: number | null;
  unit: string;
  status?: string;
}

export interface SampleRecord {
  sampleUri: string;
  sampleId: string;
  date: string;
  sampleType: string;
  observations: SampleObservation[];
}

export interface SamplePointDetail {
  samplePointName: string;
  maxResult: { substance: string; value: number; unit: string; sampleId: string; date: string } | null;
  samples: SampleRecord[];
}

export interface PointGeometry {
  type: 'Point';
  coordinates: LatLngExpression;
}

export interface LineGeometry {
  type: 'LineString';
  coordinates: LatLngExpression[];
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: LatLngExpression[][];
}
