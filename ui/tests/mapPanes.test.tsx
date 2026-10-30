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
import type { MapFeature } from '../../engine/types/map';
import type { MapLayerData } from '../hooks/useMapLayers';
import { ResultsMap } from '../components/Map/ResultsMap';
import { LAYER_REGISTRY } from '../components/Map/layerStyles';

vi.mock('../../engine/sparqlClient', () => ({ executeSparql: () => new Promise(() => {}) }));
window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
// jsdom has no ResizeObserver; keep each callback so a test can fire it.
const resizeCallbacks: (() => void)[] = [];
window.ResizeObserver = class {
  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

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
const leafletDefault: Record<string, number> = { overlayPane: 400, markerPane: 600, tooltipPane: 650, popupPane: 700 };
const zOf = (name: string) => leafletDefault[name] ?? Number(map.getPane(name)!.style.zIndex);

it('stacks the panes in a fixed order, bottom to top', () => {
  renderMap(everyLayer);
  const bottomToTop = ['aquiferPane', 'regionPane', 'waterAreasPane', 'streamsPane', 'overlayPane', 'samplesPane', 'wellsPane', 'markerPane', 'measurePane', 'tooltipPane', 'popupPane'];
  const zs = bottomToTop.map(zOf);
  expect(zs).toEqual([...new Set(zs)].sort((a, b) => a - b));
});

// Leaflet sizes a popup from its own maxWidth and maxHeight, never from the
// map, so on a phone popups ran off the map, close button included. Sample
// popups also had a 400px outer scroll around their own table scroll (#88).
it('caps every popup to the size of the map it opens in', async () => {
  renderMap(everyLayer);
  await waitForFeatures(7);
  const capsAt = (width: number, height: number) => {
    // A fresh point each call, as Leaflet's own getSize() returns: callers mutate it.
    vi.spyOn(map, 'getSize').mockImplementation(() => L.point(width, height));
    const out: Record<string, [number | undefined, number | undefined]> = {};
    map.eachLayer((layer) => {
      const popup = layer.getPopup();
      const tooltip = layer.getTooltip();
      if (!popup || !tooltip) return;
      layer.openPopup();
      out[tooltip.getElement()!.textContent!] = [popup.options.maxWidth, popup.options.maxHeight ?? undefined];
      layer.closePopup();
    });
    return out;
  };

  const phone = capsAt(390, 392);
  expect(phone.facility).toEqual([330, 302]);
  expect(phone.sample).toEqual([330, 302]);
  expect(phone.stream).toEqual([330, 302]);

  // A wide map keeps each popup's own width, and the height cap follows the map.
  const desktop = capsAt(1396, 846);
  expect(desktop.facility).toEqual([600, 756]);
  expect(desktop.sample).toEqual([500, 756]);

  // A map too small for the room a popup needs: never a negative or tiny cap.
  expect(capsAt(180, 120).facility).toEqual([150, 100]);
});

// Popups opened under Map Layers or the saved results banner, close button
// included, and fitted results could land under the open panels (#88).
it('keeps popups and fitted results clear of the open panels, and only while open', async () => {
  const rect = (x: number, y: number, width: number, height: number) =>
    ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('leaflet-container')) return rect(0, 0, 1396, 846);
    if (this.matches('.custom-layer-panel > details[open]')) return rect(1136, 10, 250, 160);
    return rect(0, 0, 0, 0);
  });
  const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) {
    return this;
  });
  const empty = { ...everyLayer, samples: [], facilities: [], waterBodies: [], wells: [], streams: [], regionBoundaries: [] };
  const { rerender } = renderMap(empty);
  await screen.findByText(/Aquifers/);
  vi.spyOn(map, 'getSize').mockImplementation(() => L.point(1396, 846));
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <ResultsMap layers={everyLayer} />
    </QueryClientProvider>,
  );
  await waitForFeatures(7);

  // Map Layers spans x 1136 to 1386 of a 1396px map: 1396 - 1136 + 8.
  const fitOptions = fitBounds.mock.calls[fitBounds.mock.calls.length - 1][1]!;
  expect([fitOptions.paddingBottomRight, fitOptions.paddingTopLeft]).toEqual([L.point(268, 50), L.point(50, 50)]);

  let facility: L.Marker | undefined;
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker && layer.getTooltip()?.getElement()?.textContent === 'facility') facility = layer;
  });
  const paddingWhenOpened = () => {
    facility!.openPopup();
    const padding = facility!.getPopup()!.options.autoPanPaddingBottomRight;
    facility!.closePopup();
    return padding;
  };
  expect(paddingWhenOpened()).toEqual(L.point(268, 5));

  document.querySelector<HTMLDetailsElement>('.custom-layer-panel > details')!.open = false;
  expect(paddingWhenOpened()).toEqual(L.point(5, 5));
});

// On a phone an open Map Layers (about 280px) left popups 47px wide, or less,
// and handed fitBounds a negative size (#88).
it('reserves nothing for an open panel that would leave too little of the map', async () => {
  const rect = (x: number, y: number, width: number, height: number) =>
    ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('leaflet-container')) return rect(0, 0, 390, 392);
    if (this.matches('.custom-layer-panel > details[open]')) return rect(100, 10, 280, 300);
    return rect(0, 0, 0, 0);
  });
  const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) {
    return this;
  });
  const empty = { ...everyLayer, samples: [], facilities: [], waterBodies: [], wells: [], streams: [], regionBoundaries: [] };
  const { rerender } = renderMap(empty);
  await screen.findByText(/Aquifers/);
  vi.spyOn(map, 'getSize').mockImplementation(() => L.point(390, 392));
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <ResultsMap layers={everyLayer} />
    </QueryClientProvider>,
  );
  await waitForFeatures(7);

  expect(fitBounds.mock.calls[fitBounds.mock.calls.length - 1][1]!.paddingBottomRight).toEqual(L.point(50, 50));
  let facility: L.Marker | undefined;
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker && layer.getTooltip()?.getElement()?.textContent === 'facility') facility = layer;
  });
  facility!.openPopup();
  expect(facility!.getPopup()!.options.maxWidth).toBe(330);
  facility!.closePopup();
});

// Leaflet caches the map's size and re-reads it only on a window resize. On a
// phone the map shrank from 622px to 392px as the question text laid out, and
// popups were capped and panned for the old size, running off the bottom (#88).
it('re-reads the map size whenever its container resizes', () => {
  renderMap(everyLayer);
  const invalidateSize = vi.spyOn(map, 'invalidateSize');
  resizeCallbacks[resizeCallbacks.length - 1]();
  expect(invalidateSize).toHaveBeenCalledWith({ debounceMoveend: true });
});

const onlyCounties: MapLayerData = { ...everyLayer, samples: [], facilities: [], waterBodies: [], wells: [], streams: [] };
const regionBox = async () => (await screen.findByText(/Region Boundaries/)).closest('label')!.querySelector('input')!;
const counties = () => {
  let n = 0;
  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon) n++;
  });
  return n;
};

it('does the same for county outlines on a result with no data layers', async () => {
  renderMap(onlyCounties);
  await waitForFeatures(1);
  expect(panes()).toEqual({ county: { shape: 'region', popup: 'popup', tooltip: 'tooltip' } });
});

// A result with only county outlines drew them from a branch of its own, so
// ticking Region Boundaries drew a second copy and unticking it could never
// hide the first (#88).
it('draws county outlines once on a result with no data layers, and the box shows and hides them', async () => {
  renderMap(onlyCounties);
  const box = await regionBox();
  await waitFor(() => expect(counties()).toBe(1));
  expect(box.checked).toBe(true);

  fireEvent.click(box);
  await waitFor(() => expect(counties()).toBe(0));
  fireEvent.click(box);
  await waitFor(() => expect(counties()).toBe(1));
});

// The box's choice carried over to later results, so unticking Region
// Boundaries on one result hid the counties on a later county-only result and
// left an empty map (#88).
it('starts every county-only result with the county outlines shown', async () => {
  const { rerender } = renderMap({ ...onlyCounties, facilities: everyLayer.facilities });
  fireEvent.click(await regionBox());
  await waitFor(() => expect(counties()).toBe(1));
  fireEvent.click(await regionBox());
  await waitFor(() => expect(counties()).toBe(0));

  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <ResultsMap layers={onlyCounties} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(counties()).toBe(1));
  expect((await regionBox()).checked).toBe(true);
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
