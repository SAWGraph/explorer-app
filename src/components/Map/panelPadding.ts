import { point, type Map, type Point } from 'leaflet';

const GAP = 8;

// How far in from each edge of the map to keep clear of what covers it: the
// saved or partial results banner along the top, and Map Layers and Basemaps
// down the right while they are open (#88). Collapsed, those panels are small
// corner buttons; reserving their width on a phone would squeeze popups to
// about 160px, so they only count when open. Never less than `min`.
export function panelPadding(map: Map, min: number): { topLeft: Point; bottomRight: Point } {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  // Something with no size covers nothing.
  const shown = (selector: string, root: ParentNode | null | undefined) =>
    [...(root?.querySelectorAll(selector) ?? [])].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);

  const banners = shown('.cached-result-notice, .partial-results-notice', container.parentElement);
  const openPanels = shown('.custom-layer-panel > details[open], .basemap-selector > details[open]', container);
  const top = Math.max(0, ...banners.map((r) => r.bottom - box.top + GAP));
  const right = Math.max(0, ...openPanels.map((r) => box.right - r.left + GAP));
  return { topLeft: point(min, Math.max(min, top)), bottomRight: point(Math.max(min, right), min) };
}
