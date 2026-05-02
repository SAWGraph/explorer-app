import { useState, type ComponentType } from 'react';
import { MapContainer, TileLayer, Pane } from 'react-leaflet';
import type { MapLayerData } from '../../hooks/useMapLayers';
import type { MapFeature } from '../../types/map';
import { SampleLayer } from './SampleLayer';
import { FacilityLayer } from './FacilityLayer';
import { WaterBodyLayer } from './WaterBodyLayer';
import { WellLayer } from './WellLayer';
import { StreamLayer } from './StreamLayer';
import { RegionBoundaryLayer } from './RegionBoundaryLayer';
import { MapCenterController } from './MapCenterController';
import { LayerPanel } from './LayerPanel';
import { BasemapSelector } from './BasemapSelector';
import { LAYER_REGISTRY, getDefaultVisibility } from './layerStyles';
import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps';
import 'leaflet/dist/leaflet.css';

interface ResultsMapProps {
  layers: MapLayerData;
}

const LAYER_COMPONENTS: Record<string, ComponentType<{ features: MapFeature[] }>> = {
  samples: SampleLayer,
  facilities: FacilityLayer,
  waterBodies: WaterBodyLayer,
  wells: WellLayer,
  streams: StreamLayer,
  regionBoundaries: RegionBoundaryLayer,
};

const LAYER_PANE_CONFIG: Record<string, { name: string; zIndex: number }> = {
  regionBoundaries: { name: 'regionPane', zIndex: 350 },
  streams: { name: 'streamsPane', zIndex: 380 },
};

export function ResultsMap({ layers }: ResultsMapProps) {
  const [visibility, setVisibility] = useState(getDefaultVisibility);
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP);

  const hasData =
    layers.samples.length > 0 ||
    layers.facilities.length > 0 ||
    layers.waterBodies.length > 0 ||
    layers.wells.length > 0 ||
    layers.streams.length > 0;

  const handleToggle = (key: string) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const basemap = BASEMAPS.find((b) => b.key === basemapKey)!;

  return (
    <MapContainer
      center={[44.0, -69.0]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        key={basemapKey}
        attribution={basemap.attribution}
        url={basemap.url}
        maxNativeZoom={basemap.maxNativeZoom}
        maxZoom={20}
      />
      {basemap.overlayUrl && (
        <TileLayer
          key={`${basemapKey}-overlay`}
          url={basemap.overlayUrl}
          maxNativeZoom={basemap.maxNativeZoom}
          maxZoom={20}
          opacity={0.7}
        />
      )}

      <MapCenterController layers={layers} />

      {LAYER_REGISTRY.map(({ key }) => {
        const features = layers[key as keyof MapLayerData];
        const Component = LAYER_COMPONENTS[key];
        if (!visibility[key] || !features.length || !Component) return null;
        const pane = LAYER_PANE_CONFIG[key];
        if (pane) {
          return (
            <Pane key={key} name={pane.name} style={{ zIndex: pane.zIndex }}>
              <Component features={features} />
            </Pane>
          );
        }
        return <Component key={key} features={features} />;
      })}

      {/* Standalone region boundaries when no data layers exist (always visible, no panel) */}
      {!hasData && layers.regionBoundaries.length > 0 && (
        <RegionBoundaryLayer features={layers.regionBoundaries} />
      )}

      {hasData && (
        <LayerPanel
          visibility={visibility}
          onToggle={handleToggle}
          layers={layers}
        />
      )}

      <BasemapSelector current={basemapKey} onChange={setBasemapKey} />
    </MapContainer>
  );
}
