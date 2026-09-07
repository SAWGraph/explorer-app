import { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { WATER_COLORS } from './mapColors';
// Imported (not from public/) so Vite fingerprints it: a content-hashed,
// immutable URL that never serves stale, and changes when the data changes.
import aquifersUrl from '../../assets/aquifers.geojson?url';

// Precomputed by scripts/precompute_aquifers.py (aquifers have no geometry in
// the KG — this dissolves their S2 cells into boundaries). Lazy-loaded on first
// enable; the file is ~6.8MB so we don't fetch it until the layer is toggled on.
// ponytail: module-level cache so re-toggling doesn't refetch.
let cache: FeatureCollection | null = null;

// Canvas renderer: 8k+ polygons on the default SVG renderer janks the map.
const renderer = L.canvas({ padding: 0.5 });

interface AquiferBoundaryLayerProps {
  visible: boolean;
  // KG IRIs of aquifers matched by the current query. When non-empty, the
  // overlay is scoped to those (near-sample aquifers); when empty it shows all.
  matchedIris?: string[];
}

export function AquiferBoundaryLayer({ visible, matchedIris }: AquiferBoundaryLayerProps) {
  const [data, setData] = useState<FeatureCollection | null>(cache);

  useEffect(() => {
    if (!visible || data) return;
    let alive = true;
    fetch(aquifersUrl)
      .then((r) => {
        // Don't gate on Content-Type: servers vary (Railway serves .geojson as
        // text/plain). r.json() is MIME-agnostic and throws on the SPA
        // index.html fallback that a missing asset returns, which is the only
        // case we need to guard.
        if (!r.ok) throw new Error(`aquifers.geojson: HTTP ${r.status}`);
        return r.json();
      })
      .then((fc: FeatureCollection) => {
        cache = fc;
        if (alive) setData(fc);
      })
      .catch((e) => console.warn('Aquifer overlay failed to load:', e));
    return () => {
      alive = false;
    };
  }, [visible, data]);

  // Scope to matched aquifers when the query returned some. Maine features are
  // keyed by KG IRI so they filter exactly; Illinois features use a synthetic
  // isgs.* id (no KG-IRI join), so they can't be matched and are left in.
  // ponytail: IL scoping needs a KG-IRI bridge in the precompute — follow-up.
  const filtered = useMemo<FeatureCollection | null>(() => {
    if (!data) return null;
    if (!matchedIris?.length) return data;
    const matched = new Set(matchedIris);
    return {
      ...data,
      features: data.features.filter((f) => {
        const id = f.properties?.id;
        if (typeof id !== 'string' || !id.startsWith('http')) return true; // IL / non-KG
        return matched.has(id);
      }),
    };
  }, [data, matchedIris]);

  if (!visible || !filtered) return null;

  return (
    <GeoJSON
      // GeoJSON's `data` is not reactive; remount when the scoped set changes.
      key={matchedIris?.length ? matchedIris.slice().sort().join('|') : 'all'}
      data={filtered}
      style={(feature) => {
        const bedrock = feature?.properties?.kind === 'bedrock';
        const fill = bedrock ? WATER_COLORS.watershed : WATER_COLORS.aquifer;
        // Same pattern as water bodies: light fill + dark #045a8d stroke, which
        // clears WCAG 3:1 on every basemap (the light fill alone does not). The
        // defined edge is what makes the extent readable over water tiles.
        return {
          renderer,
          color: WATER_COLORS.well,
          weight: 1,
          opacity: 1,
          fillColor: fill,
          fillOpacity: 0.45,
        };
      }}
      onEachFeature={(feature, layer) => {
        const p = feature.properties ?? {};
        const id = typeof p.id === 'string' ? p.id.split('#').pop() : '';
        const yieldRow = p.yield ? `<br/>Yield: ${p.yield}` : '';
        layer.bindPopup(
          `<strong>Aquifer: ${p.aquiferType || p.kind || 'unknown'}</strong>` +
            `<br/>${p.state ?? ''}${yieldRow}<br/><small>${id ?? ''}</small>`,
        );
      }}
    />
  );
}
