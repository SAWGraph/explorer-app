import type { AquiferFilters } from '../types/query';
import { AQUIFER_TYPE_VALUES, buildAquifersByIri } from '../templates/aquifers';
import { ownFilterSet, type EntityModule } from './types';

const LABEL = 'aquifers';
// One kind selected reads as an adjective ("bedrock aquifers").
const KIND_WORDS: Record<string, string> = {
  surficial: 'sand & gravel',
  bedrock: 'bedrock',
};

function aquiferTypeFilter(filters: AquiferFilters | undefined, suffix: string): string {
  const kinds = filters?.aquiferTypes;
  if (!kinds?.length) return '';
  const vals = kinds
    .flatMap((k) => AQUIFER_TYPE_VALUES[k] ?? [])
    .map((v) => `"${v}"`);
  if (!vals.length) return '';
  return `?aquifer${suffix} saw_water:aquiferType ?aqType${suffix} .
      VALUES ?aqType${suffix} { ${vals.join(' ')} }`;
}

export const aquifers: EntityModule = {
  type: 'aquifers',
  label: LABEL,
  isFlowline: false,
  details: {
    kind: 'by-iri',
    endpoint: 'hydrologykg',
    buildQuery: (iris) => buildAquifersByIri(iris),
  },
  iriVar: (suffix) => `?aquifer${suffix}`,
  bindInCell(block, s2Var, suffix) {
    const typeFilter = aquiferTypeFilter(block.aquiferFilters, suffix);
    return `${s2Var} spatial:connectedTo ?aquifer${suffix} .
      ?aquifer${suffix} rdf:type gwml2:GW_Aquifer .
      ${typeFilter}`;
  },
  // One row per entity and cell already (measured in Maine, 2026-11-06).
  fansOut: () => false,
  filterSlot: 'aquiferFilters',
  isFiltered: ownFilterSet('aquiferFilters', ['aquiferTypes']),
  describe(block) {
    const kinds = block.aquiferFilters?.aquiferTypes ?? [];
    // None or both selected: the bare label.
    if (kinds.length === 1 && KIND_WORDS[kinds[0]]) {
      return `${KIND_WORDS[kinds[0]]} ${LABEL}`;
    }
    return LABEL;
  },
};
