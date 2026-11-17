import { buildWaterBodiesByIri } from '../templates/hydrate';
import { WATER_BODY_FTYPES } from '../constants/featureTypes';
import { ownFilterSet, type EntityModule } from './types';
import { ftypeLabels, namedOrCounted } from './wording';

const LABEL = 'surface water bodies';

const iriVar = (suffix: string): string => `?waterBody${suffix}`;
const inCell = (s2Var: string, suffix: string): string => `${s2Var} spatial:connectedTo ${iriVar(suffix)} .
      ${iriVar(suffix)} rdf:type hyf:HY_WaterBody .`;

export const waterBodies: EntityModule = {
  type: 'waterBodies',
  label: LABEL,
  isFlowline: false,
  details: {
    kind: 'by-iri',
    endpoint: 'hydrologykg',
    buildQuery: (iris, block) => buildWaterBodiesByIri(iris, block.waterBodyFilters),
  },
  iriVar,
  bindInCell(block, s2Var, suffix) {
    let filterClauses = '';
    if (block.waterBodyFilters?.ftypes?.length) {
      const ftypeValues = block.waterBodyFilters.ftypes.map((f) => `"${f}"`).join(' ');
      filterClauses = `?waterBody${suffix} nhdplusv2:hasFTYPE ?ftype${suffix} .
      VALUES ?ftype${suffix} { ${ftypeValues} }`;
    }
    return `${inCell(s2Var, suffix)}
      ${filterClauses}`;
  },
  options: {
    bind: (s2Var, suffix, optionVar) => `${inCell(s2Var, suffix)}
      ${iriVar(suffix)} nhdplusv2:hasFTYPE ${optionVar} .`,
  },
  // One row per entity and cell already (measured in Maine, 2026-11-06).
  fansOut: () => false,
  filterSlot: 'waterBodyFilters',
  isFiltered: ownFilterSet('waterBodyFilters', ['ftypes']),
  describe(block) {
    const ftypes = block.waterBodyFilters?.ftypes ?? [];
    if (!ftypes.length) return LABEL;
    // Labels contain " / " themselves, so they are joined with commas.
    const items = ftypeLabels(ftypes, WATER_BODY_FTYPES);
    return namedOrCounted(items, LABEL, ', ', (n) => `of ${n} types`);
  },
};
