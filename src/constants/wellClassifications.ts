// Well classification (Approach B): each state classified by its own native field.
// Illinois by purpose; Maine by both construction type and use.

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

export const WELL_GROUP_LABEL: Record<WellField, string> = {
  ilPurpose: 'Illinois · Purpose',
  meType: 'Maine · Type',
  meUse: 'Maine · Use',
};

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
    key: encodeWellToken('meUse', ['http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellUse.Domestic']),
    label: 'Domestic',
    state: 'ME',
    field: 'meUse',
    group: WELL_GROUP_LABEL.meUse,
  },
];
