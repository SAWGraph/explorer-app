import L from 'leaflet';

export interface LayerConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
  legendSvg: string;
}

export const LAYER_REGISTRY: LayerConfig[] = [
  {
    key: 'samples',
    label: 'Samples',
    defaultVisible: true,
    legendSvg:
      '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#f1a340" stroke="#b35806" stroke-width="1.5"/></svg>',
  },
  {
    key: 'facilities',
    label: 'Facilities',
    defaultVisible: true,
    legendSvg:
      '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" fill="#cb181d" stroke="#7a0e11" stroke-width="2"/></svg>',
  },
  {
    key: 'waterBodies',
    label: 'Surface Water Bodies',
    defaultVisible: true,
    legendSvg:
      '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 15,14 1,14" fill="#a6bddb" stroke="#045a8d" stroke-width="2"/></svg>',
  },
  {
    key: 'wells',
    label: 'Subsurface Water Bodies',
    defaultVisible: true,
    legendSvg:
      '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="#74a9cf" stroke="#045a8d" stroke-width="2"/></svg>',
  },
  {
    key: 'regionBoundaries',
    label: 'Region Boundaries',
    defaultVisible: false,
    legendSvg:
      '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="#4a5568" stroke-width="2" stroke-dasharray="3,2"/></svg>',
  },
];

export function getDefaultVisibility(): Record<string, boolean> {
  const vis: Record<string, boolean> = {};
  for (const entry of LAYER_REGISTRY) {
    vis[entry.key] = entry.defaultVisible;
  }
  return vis;
}

// --- Icon factories ---

const squareIconCache = new Map<string, L.DivIcon>();

export function createSquareIcon(color: string, strokeColor?: string): L.DivIcon {
  const stroke = strokeColor ?? color;
  const cacheKey = `${color}|${stroke}`;
  const cached = squareIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
    html: `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="1.5" fill="${color}" stroke="${stroke}" stroke-width="2" fill-opacity="0.7"/></svg>`,
  });

  squareIconCache.set(cacheKey, icon);
  return icon;
}

export const triangleIcon = L.divIcon({
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -7],
  html: '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="7,1 13,13 1,13" fill="#a6bddb" stroke="#045a8d" stroke-width="2" fill-opacity="0.6"/></svg>',
});
