// @vitest-environment jsdom
//
// Stream and county popups opened under the stream lines, the county fill and
// the facility squares, and the county popup's close button could not be
// clicked. A react-leaflet <Pane> hands its pane to every child, popups
// included, so wrapping a layer in one put its popups in streamsPane (z 380)
// or regionPane (z 350) instead of popupPane (z 700). Tooltips had been fixed
// one by one with pane="tooltipPane"; the popups added later were not. The
// aquifer canvas had the opposite problem: it ignored aquiferPane, sat in
// overlayPane above streams and counties, and swallowed their clicks even
// after the overlay was turned off. Issue #86.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import L from 'leaflet';
import type { MapFeature } from '../src/types/map';
import type { MapLayerData } from '../src/hooks/useMapLayers';
import { ResultsMap } from '../src/components/Map/ResultsMap';
import { LAYER_REGISTRY } from '../src/components/Map/layerStyles';

vi.mock('../src/engine/sparqlClient', () => ({ executeSparql: () => new Promise(() => {}) }));
window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;

// ResultsMap owns its MapContainer, so catch each map as Leaflet creates it.
let map: L.Map;
L.Map.addInitHook('whenReady', ({ target }: { target: L.Map }) => {
  map = target;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Every feature is named after its id, and every layer's tooltip shows the name
// (samples show samplePointName).
const point = (id: string, type: string, lat: number): MapFeature => ({
  id,
  geometry: { type: 'Point', coordinates: [lat, -69] },
  properties: { type, name: id, samplePointName: id, resultCount: 1 },
});
const line = (id: string, type: string): MapFeature => ({
  id,
  geometry: { type: 'LineString', coordinates: [[44, -69.2], [44.1, -69.1]] },
  properties: { type, name: id },
});
const polygon = (id: string, type: string): MapFeature => ({
  id,
  geometry: { type: 'Polygon', coordinates: [[[43.9, -69.3], [43.9, -68.9], [44.2, -68.9], [43.9, -69.3]]] },
  properties: { type, name: id },
});

const everyLayer: MapLayerData = {
  samples: [point('sample', 'sample', 44.01)],
  facilities: [point('facility', 'facility', 44.02)],
  waterBodies: [point('waterBodyPoint', 'waterBody', 44.03), line('waterBodyLine', 'waterBody'), polygon('waterBodyArea', 'waterBody')],
  wells: [point('well', 'well', 44.04)],
  streams: [line('stream', 'stream')],
  regionBoundaries: [polygon('county', 'regionBoundary')],
  matchedAquiferIris: [],
};

const paneOf = (el: Element) => el.closest('.leaflet-pane')!.className.match(/leaflet-(\w+)-pane/)![1];

// For every feature on the map: the pane its shape, its popup and its tooltip sit in.
function panes() {
  const out: Record<string, { shape: string; popup: string; tooltip: string }> = {};
  map.eachLayer((layer) => {
    const tooltip = layer.getTooltip();
    const popup = layer.getPopup();
    if (!tooltip || !popup) return;
    layer.openTooltip();
    layer.openPopup();
    const el = (layer as L.Path | L.Marker).getElement()!;
    out[tooltip.getElement()!.textContent!] = {
      shape: paneOf(el),
      popup: paneOf(popup.getElement()!),
      tooltip: paneOf(tooltip.getElement()!),
    };
    layer.closePopup();
    layer.closeTooltip();
  });
  return out;
}

// Each feature's name, read from its tooltip. Unlike panes(), this leaves the
// DOM alone, so it is safe inside waitFor, which re-runs on every DOM change.
function names() {
  const out: string[] = [];
  map.eachLayer((layer) => {
    const tooltip = layer.getTooltip();
    if (tooltip) out.push(tooltip.getElement()?.textContent ?? '');
  });
  return out;
}

// React renders a tooltip's text only once it has opened, so keep each one open
// until its text is there.
async function waitForFeatures(count: number) {
  await waitFor(() => expect(names()).toHaveLength(count));
  map.eachLayer((layer) => layer.openTooltip());
  await waitFor(() => expect(names()).not.toContain(''));
  map.eachLayer((layer) => layer.closeTooltip());
}

const renderMap = (layers: MapLayerData) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResultsMap layers={layers} />
    </QueryClientProvider>,
  );

const toggle = async (label: RegExp) =>
  fireEvent.click((await screen.findByText(label)).closest('label')!.querySelector('input')!);

it('has a fixture for every data layer, so the checks below cover each one', () => {
  for (const { key, static: isStatic } of LAYER_REGISTRY) {
    if (!isStatic) expect(everyLayer[key as keyof MapLayerData], key).not.toHaveLength(0);
  }
});

it('opens every popup and tooltip above all data, and keeps each layer in its own pane', async () => {
  renderMap(everyLayer);
  await toggle(/Region Boundaries/);
  await waitForFeatures(8);

  const top = { popup: 'popup', tooltip: 'tooltip' };
  expect(panes()).toEqual({
    sample: { shape: 'samples', ...top },
    facility: { shape: 'marker', ...top },
    waterBodyPoint: { shape: 'marker', ...top },
    waterBodyLine: { shape: 'overlay', ...top },
    waterBodyArea: { shape: 'waterAreas', ...top },
    well: { shape: 'wells', ...top },
    stream: { shape: 'streams', ...top },
    county: { shape: 'region', ...top },
  });
});

// Layers sharing a pane stack in the order they were added, so toggling one
// off and on used to move it to the top (#88). With a pane each, this order is
// the whole story.
it('stacks the panes in a fixed order, bottom to top', () => {
  renderMap(everyLayer);
  const leafletDefault: Record<string, number> = { overlayPane: 400, markerPane: 600, tooltipPane: 650, popupPane: 700 };
  const z = (name: string) => leafletDefault[name] ?? Number(map.getPane(name)!.style.zIndex);
  const bottomToTop = ['aquiferPane', 'regionPane', 'waterAreasPane', 'streamsPane', 'overlayPane', 'samplesPane', 'wellsPane', 'markerPane', 'measurePane', 'tooltipPane', 'popupPane'];
  const zs = bottomToTop.map(z);
  expect(zs).toEqual([...new Set(zs)].sort((a, b) => a - b));
});

it('does the same for county outlines on a result with no data layers', async () => {
  renderMap({ ...everyLayer, samples: [], facilities: [], waterBodies: [], wells: [], streams: [] });
  await waitForFeatures(1);
  expect(panes()).toEqual({ county: { shape: 'region', popup: 'popup', tooltip: 'tooltip' } });
});

it('draws aquifers in aquiferPane, under streams and counties, and leaves nothing above them when turned off', async () => {
  // jsdom has no canvas; Leaflet only needs the drawing calls to exist.
  const ctx = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  const aquifer = { type: 'Feature', properties: { id: 'aq' }, geometry: { type: 'Polygon', coordinates: [[[-69.3, 43.9], [-68.9, 43.9], [-68.9, 44.2], [-69.3, 43.9]]] } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [aquifer] }))));

  renderMap(everyLayer);
  await toggle(/Aquifers/);
  await waitFor(() => expect(document.querySelector('.leaflet-map-pane canvas')).not.toBeNull());
  expect(paneOf(document.querySelector('.leaflet-map-pane canvas')!)).toBe('aquifer');

  await toggle(/Aquifers/);
  expect(document.querySelector('.leaflet-overlay-pane canvas')).toBeNull();
});
