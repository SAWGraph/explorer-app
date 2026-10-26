// Well classification (Approach B): each state classified by its own native field.
// Illinois by purpose; Maine by both construction type and use.

import type { WellFilters } from '../types/query';

export type WellField = 'ilPurpose' | 'meType' | 'meUse';

export interface WellClassification {
  key: string; // encoded token: `${field}||${uris.join(' ')}`
  label: string; // e.g. "Water Well"
  count?: number;
  state: 'IL' | 'ME';
  field: WellField;
  group: string; // section header, e.g. "Illinois · Purpose"
}

export const WELL_STATE_FIPS = { IL: '17', ME: '23' } as const;

// Shown under the greyed Wells option in the Type menu.
export const WELLS_UNAVAILABLE_HINT = 'Illinois and Maine only';

// No state chosen counts as covered: the wells query then spans both states.
export function stateHasWells(stateCode?: string): boolean {
  return !stateCode || stateCode === WELL_STATE_FIPS.IL || stateCode === WELL_STATE_FIPS.ME;
}

export const WELL_GROUP_LABEL: Record<WellField, string> = {
  ilPurpose: 'Illinois · Purpose',
  meType: 'Maine · Type',
  meUse: 'Maine · Use',
};

// Used once a state is chosen, when the state name in the header is redundant.
export const WELL_GROUP_SHORT_LABEL: Record<WellField, string> = {
  ilPurpose: 'Purpose',
  meType: 'Type',
  meUse: 'Use',
};

const WELL_FIELD_STATE: Record<WellField, 'IL' | 'ME'> = {
  ilPurpose: 'IL',
  meType: 'ME',
  meUse: 'ME',
};

// Drops picks that belong to the other well state, so a state switch can't
// leave hidden categories in the query. With no IL/ME state, every pick stays.
export function keepWellPicksForState(
  filters: WellFilters | undefined,
  stateCode?: string,
): WellFilters | undefined {
  const state =
    stateCode === WELL_STATE_FIPS.IL ? 'IL' : stateCode === WELL_STATE_FIPS.ME ? 'ME' : undefined;
  if (!state || !filters?.wellCategories) return filters;
  const kept = filters.wellCategories.filter((t) => WELL_FIELD_STATE[parseWellToken(t).field] === state);
  const labels = filters.wellCategoryLabels ?? {};
  return {
    wellCategories: kept,
    wellCategoryLabels: Object.fromEntries(kept.filter((t) => t in labels).map((t) => [t, labels[t]])),
  };
}

// A well category token bundles the field with one or more IRIs (a collapsed
// Illinois option carries active + plugged IRIs). `||` and spaces never occur
// in these IRIs, so the token is safe to split.
export function encodeWellToken(field: WellField, uris: string[]): string {
  return `${field}||${uris.join(' ')}`;
}

export function parseWellToken(token: string): { field: WellField; uris: string[] } {
  const [field, rest = ''] = token.split('||');
  return { field: field as WellField, uris: rest.split(' ').filter(Boolean) };
}

// Shown only if the live discovery query fails, so the dropdown is never empty.
export const FALLBACK_WELL_CLASSIFICATIONS: WellClassification[] = [
  {
    key: encodeWellToken('ilPurpose', ['http://sawgraph.spatialai.org/v1/il-isgs-data#d.ISGS-WellPurpose.WATER']),
    label: 'Water Well',
    state: 'IL',
    field: 'ilPurpose',
    group: WELL_GROUP_LABEL.ilPurpose,
  },
  {
    key: encodeWellToken('meType', ['http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellType.Bedrock']),
    label: 'Bedrock',
    state: 'ME',
    field: 'meType',
    group: WELL_GROUP_LABEL.meType,
  },
  {
    key: encodeWellToken('meType', ['http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellType.Gravel']),
    label: 'Gravel',
    state: 'ME',
    field: 'meType',
    group: WELL_GROUP_LABEL.meType,
  },
  {
    key: encodeWellToken('meUse', ['http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellUse.Domestic']),
    label: 'Domestic',
    state: 'ME',
    field: 'meUse',
    group: WELL_GROUP_LABEL.meUse,
  },
];
