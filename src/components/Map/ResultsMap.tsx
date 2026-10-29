import { useEffect, useState, type ComponentType } from 'react';
import { MapContainer, TileLayer, Pane, useMap, useMapEvent } from 'react-leaflet';
import type { Popup } from 'leaflet';
import type { MapLayerData } from '../../hooks/useMapLayers';
import type { MapFeature } from '../../types/map';
import { SampleLayer } from './SampleLayer';
import { FacilityLayer } from './FacilityLayer';
import { WaterBodyLayer } from './WaterBodyLayer';
import { WellLayer } from './WellLayer';
import { StreamLayer } from './StreamLayer';
import { RegionBoundaryLayer } from './RegionBoundaryLayer';
import { AquiferBoundaryLayer } from './AquiferBoundaryLayer';
import { MapCenterController } from './MapCenterController';
import { LayerPanel } from './LayerPanel';
import { BasemapSelector } from './BasemapSelector';
import { MeasureControl } from './MeasureControl';
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

// Tablets, phones and short windows: the open panels (~280px wide each, the
// basemap grid 263px tall) would cover too much of the map, so they start
// closed there. Read once when the map loads, never on resize, so a panel the
// user opened is not snapped shut by a rotation.
const COMPACT_SCREEN = '(max-width: 1024px), (max-height: 600px)';

// Every layer has its own pane, so the stacking order stays fixed whatever is
// toggled (#88). Bottom to top: aquifers, counties, water body areas, streams,
// water body lines (overlayPane, 400), samples, wells, facility squares and
// water body points (markerPane, 600), measure lines (just under tooltips,
// 650). Each layer names its pane with a pane prop: wrapping it in <Pane>
// would hand the pane to its popups too, under the data (#86). Render this
// before the layers, which need their panes to exist.
export function MapPanes() {
  return (
    <>
      <Pane name="aquiferPane" style={{ zIndex: 340 }} />
      <Pane name="regionPane" style={{ zIndex: 350 }} />
      <Pane name="waterAreasPane" style={{ zIndex: 360 }} />
      <Pane name="streamsPane" style={{ zIndex: 380 }} />
      <Pane name="samplesPane" style={{ zIndex: 410 }} />
      <Pane name="wellsPane" style={{ zIndex: 420 }} />
      <Pane name="measurePane" style={{ zIndex: 640 }} />
    </>
  );
}

// Room Leaflet needs around a popup's content inside the map: the content
// margins, the tip, the offset from its anchor and the 5px pan padding.
const POPUP_CHROME = { x: 60, y: 90 };
const ownPopupSize = new WeakMap<Popup, { maxWidth?: number; maxHeight?: number }>();

// Leaflet sizes a popup from its own maxWidth and maxHeight, never from the
// map, so on a phone or a short window popups ran off the map, close button
// included (#88). Cap both to the map as each popup opens; Leaflet then
// scrolls what is taller and pans the popup into view.
function FitPopupsToMap() {
  const map = useMap();

  // Leaflet caches the map's size and re-reads it only on a window resize, but
  // the map also shrinks when the question text above it lays out (622px to
  // 392px on a phone). Popups were then capped and panned for a map that
  // wasn't there and ran off its bottom (#88).
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useMapEvent('popupopen', ({ popup }) => {
    const { x, y } = map.getSize();
    if (!x || !y) return; // a map that isn't laid out has nothing to fit
    if (!ownPopupSize.has(popup)) {
      ownPopupSize.set(popup, { maxWidth: popup.options.maxWidth, maxHeight: popup.options.maxHeight ?? undefined });
    }
    const own = ownPopupSize.get(popup)!;
    popup.options.maxWidth = Math.min(own.maxWidth ?? 300, x - POPUP_CHROME.x);
    popup.options.maxHeight = Math.min(own.maxHeight ?? Infinity, y - POPUP_CHROME.y);
    popup.update();
  });
  return null;
}

export function ResultsMap({ layers }: ResultsMapProps) {
  // What the user ticked or unticked; every other layer follows its default.
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP);
  const [panelsOpen] = useState(() => !window.matchMedia(COMPACT_SCREEN).matches);

  const hasData =
    layers.samples.length > 0 ||
    layers.facilities.length > 0 ||
    layers.waterBodies.length > 0 ||
    layers.wells.length > 0 ||
    layers.streams.length > 0;

  // County outlines are off by default, but on a result with no data layers
  // they are all there is to show, so there they start ticked (#88).
  const visibility: Record<string, boolean> = {
    ...getDefaultVisibility(),
    ...(hasData ? {} : { regionBoundaries: true }),
    ...choices,
  };

  const handleToggle = (key: string) => {
    setChoices((prev) => ({ ...prev, [key]: !visibility[key] }));
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
      <FitPopupsToMap />

      <MapPanes />

      <AquiferBoundaryLayer
        visible={!!visibility.aquiferBoundaries}
        matchedIris={layers.matchedAquiferIris}
      />

      {LAYER_REGISTRY.map(({ key }) => {
        // Registry keys are all feature layers; matchedAquiferIris (string[]) is
        // not in the registry, so this narrowing is safe.
        const features = (layers[key as keyof MapLayerData] ?? []) as MapFeature[];
        const Component = LAYER_COMPONENTS[key];
        if (!visibility[key] || !features.length || !Component) return null;
        return <Component key={key} features={features} />;
      })}

      {/* Panel shows when there's query data OR a static overlay (aquifers) to toggle */}
      {(hasData || LAYER_REGISTRY.some((e) => e.static)) && (
        <LayerPanel
          visibility={visibility}
          onToggle={handleToggle}
          layers={layers}
          defaultOpen={panelsOpen}
        />
      )}

      <BasemapSelector current={basemapKey} onChange={setBasemapKey} defaultOpen={panelsOpen} />
      <MeasureControl />
    </MapContainer>
  );
}
