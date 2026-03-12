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
