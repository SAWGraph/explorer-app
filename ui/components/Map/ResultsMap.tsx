import { useEffect, useState, type ComponentType } from 'react';
import { MapContainer, TileLayer, Pane, useMap, useMapEvent } from 'react-leaflet';
import type { Popup } from 'leaflet';
import type { MapLayerData } from '../../hooks/useMapLayers';
import type { MapFeature } from '../../../engine/types/map';
import type { EntityType } from '../../../engine/types/query';
import { useQueryStore } from '../../store/queryStore';
import { SampleLayer } from './SampleLayer';
import { FacilityLayer } from './FacilityLayer';
import { WaterBodyLayer } from './WaterBodyLayer';
import { WellLayer } from './WellLayer';
import { StreamLayer } from './StreamLayer';
import { RegionBoundaryLayer } from './RegionBoundaryLayer';
import { AquiferBoundaryLayer } from './AquiferBoundaryLayer';
import { MapCenterController } from './MapCenterController';
import { panelPadding } from './panelPadding';
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
export function MapPanes({ answer }: { answer?: EntityType }) {
  const map = useMap();

  // The 14px facility squares hid most samples and wells near them, and
  // drawing those on top for every question buried the squares instead. So
  // the question's answer (block A) draws above the squares (#88). Set here,
  // not on <Pane>, which applies its style once; the question can change
  // under a mounted map.
  useEffect(() => {
    map.getPane('samplesPane')!.style.zIndex = answer === 'samples' ? '610' : '410';
    map.getPane('wellsPane')!.style.zIndex = answer === 'wells' ? '620' : '420';
  }, [map, answer]);

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

// Room Leaflet needs around a popup's content, besides the pan padding: the
// content margins, the tip and the offset from its anchor.
const POPUP_CHROME = { x: 50, y: 80 };
// Never cap a popup below this, however small the map: a negative cap is
// dropped by the browser, and Leaflet would still mark the popup scrolled.
const POPUP_MIN = { width: 150, height: 100 };
const ownPopupSize = new WeakMap<Popup, { maxWidth?: number; maxHeight?: number }>();

// Leaflet sizes a popup from its own maxWidth and maxHeight, never from the
// map, and pans it only 5px clear of the edges. So on a phone popups ran off
// the map, and anywhere they opened under the banner or an open panel, close
// button included (#88). As each popup opens, pad it clear of those and cap
// its size to the space left; Leaflet scrolls what is taller and pans it in.
function FitPopupsToMap() {
  const map = useMap();

  // Leaflet caches the map's size and re-reads it only on a window resize, but
  // the map also shrinks when the question text above it lays out (622px to
  // 392px on a phone). Popups were then capped and panned for a map that
  // wasn't there and ran off its bottom (#88).
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
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
    const { topLeft, bottomRight } = panelPadding(map, 5);
    popup.options.autoPanPaddingTopLeft = topLeft;
    popup.options.autoPanPaddingBottomRight = bottomRight;
    const roomX = Math.max(POPUP_MIN.width, x - topLeft.x - bottomRight.x - POPUP_CHROME.x);
    const roomY = Math.max(POPUP_MIN.height, y - topLeft.y - bottomRight.y - POPUP_CHROME.y);
    popup.options.maxWidth = Math.min(own.maxWidth ?? 300, roomX);
    popup.options.maxHeight = Math.min(own.maxHeight ?? Infinity, roomY);
    // Leaflet measures the content with last time's scrolled class still on,
    // and with it the sample table drops its own scroll (App.css), so a popup
    // that once scrolled whole would stay that way on a bigger map.
    popup.getElement()?.querySelector('.leaflet-popup-scrolled')?.classList.remove('leaflet-popup-scrolled');
    popup.update();
  });
  return null;
}

export function ResultsMap({ layers }: ResultsMapProps) {
  // What the user ticked or unticked; every other layer follows its default.
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP);
  // Block A of the question behind the result on screen, not of the question
  // being edited: a cancelled or still-running edit leaves the old result up.
  // Every result is set after its question, so catch block A as it changes.
  const blockA = useQueryStore((s) => s.question.blockA.type);
  const [shown, setShown] = useState({ layers, answer: blockA });
  if (shown.layers !== layers) setShown({ layers, answer: blockA });
  const answer = shown.layers === layers ? shown.answer : blockA;
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

      <MapPanes answer={answer} />

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
