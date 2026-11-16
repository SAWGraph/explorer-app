import type { MapFeature } from '../../../engine/types/map';

// What a facility with no NAICS code shows as its industry. With no industry
// filter the map includes them, about three of every four facilities (#145).
// A link to a code the graph does not type as a NAICS industry code (an older
// NAICS version, a sector) counts as no code too.
export const UNKNOWN_INDUSTRY = 'Unspecified or Unknown';

// Every industry the facility came back with, by name, for one line of text
// (the hover tooltip, the list of facilities on a shared point).
export function industryNames(feature: MapFeature): string {
  const names = feature.industries?.length
    ? feature.industries.map((i) => i.name).filter(Boolean).join(', ')
    : String(feature.properties.industryName || '');
  return names || UNKNOWN_INDUSTRY;
}
