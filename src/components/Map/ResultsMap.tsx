import { useState, type ComponentType } from 'react';
import { MapContainer, TileLayer, Pane } from 'react-leaflet';
import type { MapLayerData } from '../../hooks/useMapLayers';
import type { MapFeature } from '../../types/map';
import { SampleLayer } from './SampleLayer';
import { FacilityLayer } from './FacilityLayer';
import { WaterBodyLayer } from './WaterBodyLayer';
import { WellLayer } from './WellLayer';
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
  regionBoundaries: RegionBoundaryLayer,
};

export function ResultsMap({ layers }: ResultsMapProps) {
  const [visibility, setVisibility] = useState(getDefaultVisibility);
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP);

  const hasData =
    layers.samples.length > 0 ||
    layers.facilities.length > 0 ||
    layers.waterBodies.length > 0 ||
    layers.wells.length > 0;

  const handleToggle = (key: string) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <MapContainer
      center={[44.0, -69.0]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        key={basemapKey}
        attribution={BASEMAPS.find((b) => b.key === basemapKey)!.attribution}
        url={BASEMAPS.find((b) => b.key === basemapKey)!.url}
      />

      <MapCenterController layers={layers} />

      {LAYER_REGISTRY.map(({ key }) => {
        const features = layers[key as keyof MapLayerData];
        const Component = LAYER_COMPONENTS[key];
        if (!visibility[key] || !features.length || !Component) return null;
        if (key === 'regionBoundaries') {
          return (
            <Pane key={key} name="regionPane" style={{ zIndex: 350 }}>
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
