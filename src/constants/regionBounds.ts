import type { AnalysisQuestion, RegionFilter } from '../types/query';

/** [west, south, east, north] in WGS84 degrees. */
export type Bbox = [number, number, number, number];

// ponytail: a hand-written table, not a boundary lookup. Every prebuilt
// question is scoped to one of these, and the thumbnail only needs to be
// recognisable. Add a row when a question uses a region that is not here; the
// fallback is the lower 48, which is honest about knowing nothing.
const COUNTY_BOUNDS: Record<string, Bbox> = {
  '17031': [-88.27, 41.47, -87.52, 42.15], // Cook County, Illinois
  '23005': [-70.65, 43.55, -69.85, 44.1], // Cumberland County, Maine
  '23013': [-69.35, 43.75, -68.65, 44.35], // Knox County, Maine
  '23019': [-69.35, 44.68, -68.0, 46.05], // Penobscot County, Maine
};

const STATE_BOUNDS: Record<string, Bbox> = {
  '17': [-91.6, 36.9, -87.4, 42.6], // Illinois
  '18': [-88.1, 37.7, -84.7, 41.8], // Indiana
  '23': [-71.1, 42.9, -66.9, 47.5], // Maine
};

const LOWER_48: Bbox = [-125, 24, -66.9, 49.4];

function union(a: Bbox, b: Bbox): Bbox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function boundsFor(region: RegionFilter | undefined): Bbox | null {
  if (!region) return null;
  const counties = (region.countyCodes ?? [])
    .map((code) => COUNTY_BOUNDS[code])
    .filter((b): b is Bbox => Boolean(b));
  if (counties.length > 0) return counties.reduce(union);
  return (region.stateCode && STATE_BOUNDS[region.stateCode]) || null;
}

/** Where a question looks, before any results come back. */
export function boundsForQuestion(question: AnalysisQuestion): Bbox {
  const a = boundsFor(question.blockA?.region);
  const c = boundsFor(question.blockC?.region);
  return a && c ? union(a, c) : (a ?? c ?? LOWER_48);
}

/**
 * Plain basemap of the question's region. Used only as the fallback for a card
 * whose thumbnail has not been generated yet; the real thumbnails are built by
 * scripts/build-thumbnails.mts and show the actual results.
 */
export function questionThumbnailUrl(question: AnalysisQuestion): string {
  const bbox = boundsForQuestion(question);
  // Pad so the region does not touch the frame.
  const padX = (bbox[2] - bbox[0]) * 0.12;
  const padY = (bbox[3] - bbox[1]) * 0.12;
  const padded = [
    bbox[0] - padX,
    bbox[1] - padY,
    bbox[2] + padX,
    bbox[3] + padY,
  ].join(',');
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/export?bbox=${padded}&bboxSR=4326&size=440,300&format=png&f=image`;
}
