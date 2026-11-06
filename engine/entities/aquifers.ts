import type { AquiferFilters } from '../types/query';
import { AQUIFER_TYPE_VALUES, buildAquifersByIri } from '../templates/aquifers';
import { anyFilterSlotSet, type EntityModule } from './types';

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
  label: 'aquifers',
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
  isFiltered: anyFilterSlotSet,
};
