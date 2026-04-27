import type { LatLngExpression } from 'leaflet';

export interface MapLayer {
  id: string;
  label: string;
  type: 'samples' | 'facilities' | 'waterBodies' | 'wells' | 'regionBoundary';
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
  result: number;
  unit: string;
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
