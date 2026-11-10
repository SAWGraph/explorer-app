import type { AquiferFilters } from '../types/query';
import { AQUIFER_TYPE_VALUES, buildAquifersByIri } from '../templates/aquifers';
import { ownFilterSet, subdivisionRegionCheck, type EntityModule } from './types';

const LABEL = 'aquifers';

const iriVar = (suffix: string): string => `?aquifer${suffix}`;
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
  iriVar,
  bindInCell(block, s2Var, suffix) {
    const typeFilter = aquiferTypeFilter(block.aquiferFilters, suffix);
    return `${s2Var} spatial:connectedTo ?aquifer${suffix} .
      ?aquifer${suffix} rdf:type gwml2:GW_Aquifer .
      ${typeFilter}`;
  },
  // The bind alone is one row per entity and cell (measured in Maine,
  // 2026-11-06). The region check is not: it joins the aquifer to each of its
  // subdivisions in the region. Collapsed first, Hancock "samples downstream
  // of aquifers" (10 km) took 2s; uncollapsed, 34s (2026-11-10).
  fansOut: (block) => Boolean(block.region?.countyCodes?.length || block.region?.stateCode),
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
  // The cell check alone let in aquifers from the next county (#144, measured
  // in docs/DEBUGGING.md). An aquifer links to every subdivision it lies
  // within, overlaps or contains, so "in the region" means any overlap: one
  // that crosses the county line counts in both counties.
  regionCheck: subdivisionRegionCheck(iriVar, 'aquifer'),
};
