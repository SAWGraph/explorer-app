import { point, type Map, type Point } from 'leaflet';

const GAP = 8;
// The least map a popup or a fit needs. An open Map Layers on a phone (about
// 280px of a 390px map) would leave a sliver, so then it reserves nothing.
const MIN_FREE = { x: 320, y: 220 };

// How far in from each edge of the map to keep clear of what covers it: the
// saved or partial results banner along the top, and Map Layers and Basemaps
// down the right while they are open (#88). Collapsed, those panels are small
// corner buttons, so they only count when open, and only while enough of the
// map stays free. Never less than `min`.
export function panelPadding(map: Map, min: number): { topLeft: Point; bottomRight: Point } {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  // Something with no size covers nothing.
  const shown = (selector: string, root: ParentNode | null | undefined) =>
    [...(root?.querySelectorAll(selector) ?? [])].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);

  const banners = shown('.cached-result-notice, .partial-results-notice', container.parentElement);
  const openPanels = shown('.custom-layer-panel > details[open], .basemap-selector > details[open]', container);
  let top = Math.max(min, ...banners.map((r) => r.bottom - box.top + GAP));
  let right = Math.max(min, ...openPanels.map((r) => box.right - r.left + GAP));
  if (box.height - top - min < MIN_FREE.y) top = min;
  if (box.width - right - min < MIN_FREE.x) right = min;
  return { topLeft: point(min, top), bottomRight: point(right, min) };
}
