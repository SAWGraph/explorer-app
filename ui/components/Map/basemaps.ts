export interface BasemapOption {
  key: string;
  label: string;
  url: string;
  attribution: string;
  maxNativeZoom?: number;
  overlayUrl?: string;
  thumbnail: string;
}

export const BASEMAPS: BasemapOption[] = [
  {
    key: 'positron',
    label: 'Light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
    maxNativeZoom: 16,
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    thumbnail: '/basemaps/positron.png',
  },
  {
    key: 'osm',
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    thumbnail: '/basemaps/osm.png',
  },
  {
    key: 'dark',
    label: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
    maxNativeZoom: 16,
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    thumbnail: '/basemaps/dark.png',
  },
  {
    key: 'aerial',
    label: 'Aerial',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16,
    thumbnail: '/basemaps/aerial.png',
  },
  {
    key: 'hydro',
    label: 'Hydro',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16,
    overlayUrl:
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
    thumbnail: '/basemaps/hydro.png',
  },
];

export const DEFAULT_BASEMAP = 'osm';
