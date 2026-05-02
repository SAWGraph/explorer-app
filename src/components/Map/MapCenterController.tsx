import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { MapLayerData } from '../../hooks/useMapLayers';
import L from 'leaflet';

interface MapCenterControllerProps {
  layers: MapLayerData;
}

function calculateBounds(layers: MapLayerData): L.LatLngBounds | null {
  const allCoordinates: [number, number][] = [];

  // Samples (Point)
  for (const feature of layers.samples) {
    if (feature.geometry.type === 'Point') {
      allCoordinates.push(feature.geometry.coordinates as [number, number]);
    }
  }

  // Facilities (Point)
  for (const feature of layers.facilities) {
    if (feature.geometry.type === 'Point') {
      allCoordinates.push(feature.geometry.coordinates as [number, number]);
    }
  }

  // Wells (Point)
  for (const feature of layers.wells) {
    if (feature.geometry.type === 'Point') {
      allCoordinates.push(feature.geometry.coordinates as [number, number]);
    }
  }

  // Water Bodies (Point | LineString | Polygon)
  for (const feature of layers.waterBodies) {
    if (feature.geometry.type === 'Point') {
      allCoordinates.push(feature.geometry.coordinates as [number, number]);
    } else if (feature.geometry.type === 'LineString') {
      allCoordinates.push(...(feature.geometry.coordinates as [number, number][]));
    } else if (feature.geometry.type === 'Polygon') {
      // Only outer ring to avoid over-weighting complex polygons
      allCoordinates.push(...(feature.geometry.coordinates[0] as [number, number][]));
    }
  }

  // Streams (LineString) — use only endpoints to avoid spreading thousands of coords
  for (const feature of layers.streams) {
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as [number, number][];
      if (coords.length > 0) {
        allCoordinates.push(coords[0], coords[coords.length - 1]);
      }
    }
  }

  // Region boundaries ONLY if no data features
  if (allCoordinates.length === 0) {
    for (const feature of layers.regionBoundaries) {
      if (feature.geometry.type === 'Polygon') {
        allCoordinates.push(...(feature.geometry.coordinates[0] as [number, number][]));
      }
    }
  }

  if (allCoordinates.length === 0) return null;
  return L.latLngBounds(allCoordinates);
}

export function MapCenterController({ layers }: MapCenterControllerProps) {
  const map = useMap();

  useEffect(() => {
    const bounds = calculateBounds(layers);

    if (!bounds) return;

    // Single point — center with fixed zoom
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), 10);
      return;
    }

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 15,
      animate: true,
      duration: 0.5,
    });
  }, [layers, map]);

  return null;
}
