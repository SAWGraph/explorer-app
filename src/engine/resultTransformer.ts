import type { SparqlRow } from '../types/sparql';
import type { MapFeature } from '../types/map';
import type { LatLngExpression } from 'leaflet';

function parseWKTPoint(wkt: string): LatLngExpression | null {
  const match = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;
  const lon = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  return [lat, lon];
}

function parseWKTLineString(wkt: string): LatLngExpression[] | null {
  const match = wkt.match(/LINESTRING\s*\((.+)\)/i);
  if (!match) return null;
  return match[1].split(',').map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lon] as LatLngExpression;
  });
}

function parseRing(ringStr: string): LatLngExpression[] {
  return ringStr.split(',').map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lon] as LatLngExpression;
  });
}

function parseWKTPolygon(wkt: string): LatLngExpression[][] | null {
  // Anchor with (?<!MULTI) to avoid matching MULTIPOLYGON
  const match = wkt.match(/(?<!MULTI)POLYGON\s*\(\s*\((.+)\)\s*\)/i);
  if (!match) return null;
  return match[1].split(/\)\s*,\s*\(/).map(parseRing);
}

function parseWKTMultiPolygon(wkt: string): LatLngExpression[][][] | null {
  const match = wkt.match(/MULTIPOLYGON\s*\(\s*\(\s*\((.+)\)\s*\)\s*\)/i);
  if (!match) return null;
  return match[1].split(/\)\s*\)\s*,\s*\(\s*\(/).map((polygon) =>
    polygon.split(/\)\s*,\s*\(/).map(parseRing)
  );
}

function nonNull<T>(val: T | null | undefined): val is T {
  return val != null;
}

export function transformSamplesToFeatures(rows: SparqlRow[]): MapFeature[] {
  return rows
    .filter((r) => r.spWKT)
    .map((row): MapFeature | null => {
      const coords = parseWKTPoint(row.spWKT);
      if (!coords) return null;
      return {
        id: row.sp,
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          type: 'sample',
          resultCount: row.resultCount || '0',
          maxConcentration: row.max || '',
          substances: row.substances || '',
          materials: row.materials || '',
        },
      };
    })
    .filter(nonNull);
}

export function transformFacilitiesToFeatures(rows: SparqlRow[]): MapFeature[] {
  // Deduplicate by facility URI — same facility may appear with multiple industry codes
  const seen = new Map<string, MapFeature>();
  for (const row of rows) {
    if (!row.facWKT) continue;
    if (seen.has(row.facility)) continue;
    const coords = parseWKTPoint(row.facWKT);
    if (!coords) continue;
    seen.set(row.facility, {
      id: row.facility,
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        type: 'facility',
        name: row.facilityName || '',
        industryCode: row.industryCode || '',
        industryName: row.industryName || '',
      },
    });
  }
  return Array.from(seen.values());
}

export function transformWaterBodiesToFeatures(rows: SparqlRow[]): MapFeature[] {
  const features: MapFeature[] = [];

  for (const row of rows) {
    if (!row.wbWKT) continue;
    const wkt = row.wbWKT;
    const props = { type: 'waterBody', name: row.wbName || 'Unknown Water Body' };

    const pointCoords = parseWKTPoint(wkt);
    if (pointCoords) {
      features.push({ id: row.waterBody, geometry: { type: 'Point', coordinates: pointCoords }, properties: props });
      continue;
    }

    const lineCoords = parseWKTLineString(wkt);
    if (lineCoords) {
      features.push({ id: row.waterBody, geometry: { type: 'LineString', coordinates: lineCoords }, properties: props });
      continue;
    }

    const polyCoords = parseWKTPolygon(wkt);
    if (polyCoords) {
      features.push({ id: row.waterBody, geometry: { type: 'Polygon', coordinates: polyCoords }, properties: props });
      continue;
    }

    const multiCoords = parseWKTMultiPolygon(wkt);
    if (multiCoords) {
      for (let i = 0; i < multiCoords.length; i++) {
        features.push({ id: `${row.waterBody}_${i}`, geometry: { type: 'Polygon', coordinates: multiCoords[i] }, properties: props });
      }
    }
  }

  return features;
}

export function transformWellsToFeatures(rows: SparqlRow[]): MapFeature[] {
  return rows
    .filter((r) => r.wellWKT)
    .map((row): MapFeature | null => {
      const coords = parseWKTPoint(row.wellWKT);
      if (!coords) return null;
      return {
        id: row.well,
        geometry: { type: 'Point', coordinates: coords },
        properties: { type: 'well', name: row.wellName || '' },
      };
    })
    .filter(nonNull);
}

export function transformRegionBoundaries(rows: SparqlRow[]): MapFeature[] {
  const features: MapFeature[] = [];

  for (const row of rows) {
    if (!row.regionWKT) continue;
    const wkt = row.regionWKT;
    const props = { type: 'regionBoundary', name: row.regionName || '' };

    const polyCoords = parseWKTPolygon(wkt);
    if (polyCoords) {
      features.push({ id: row.region, geometry: { type: 'Polygon', coordinates: polyCoords }, properties: props });
      continue;
    }

    const multiCoords = parseWKTMultiPolygon(wkt);
    if (multiCoords) {
      for (let i = 0; i < multiCoords.length; i++) {
        features.push({ id: `${row.region}_${i}`, geometry: { type: 'Polygon', coordinates: multiCoords[i] }, properties: props });
      }
    }
  }

  return features;
}
