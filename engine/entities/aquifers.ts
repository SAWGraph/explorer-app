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
  // A cell that crosses the county line touches the county, so the cell check
  // alone let in aquifers from the next county: 635 of 10,432 county and
  // aquifer pairs across Maine and Illinois, 16 of 197 in Hancock (#144). Every
  // aquifer links to the subdivisions it lies within, overlaps or contains,
  // all through spatial:connectedTo, so "in the region" means any overlap: an
  // aquifer that crosses the county line counts in both counties. The cell
  // check stays too, because it narrows first; the link check dropped no
  // aquifer the cell check kept (2026-11-10).
  regionCheck: (suffix, anyOf) => subdivisionRegionCheck(iriVar(suffix), `?_aquiferRegion${suffix}`, suffix, anyOf),
};
