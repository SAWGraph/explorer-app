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
  substanceUri: string;
  // One entry per coso:ContaminantObservation. A substance can legitimately
  // have more than one result within a single sample: WQP records repeat
  // measurements (a fish tissue composite of two taxa, for instance) as
  // separate observations that differ only in value, with no property that
  // tells them apart. Listing them on one row keeps them from reading as
  // duplicated rows.
  results: number[];
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
