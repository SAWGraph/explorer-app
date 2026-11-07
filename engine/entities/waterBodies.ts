import { buildWaterBodiesByIri } from '../templates/hydrate';
import { WATER_BODY_FTYPES } from '../constants/featureTypes';
import { ownFilterSet, type EntityModule } from './types';
import { ftypeLabels, summarize } from './wording';

const LABEL = 'surface water bodies';

export const waterBodies: EntityModule = {
  type: 'waterBodies',
  label: LABEL,
  isFlowline: false,
  details: {
    kind: 'by-iri',
    endpoint: 'hydrologykg',
    buildQuery: (iris, block) => buildWaterBodiesByIri(iris, block.waterBodyFilters),
  },
  iriVar: (suffix) => `?waterBody${suffix}`,
  bindInCell(block, s2Var, suffix) {
    let filterClauses = '';
    if (block.waterBodyFilters?.ftypes?.length) {
      const ftypeValues = block.waterBodyFilters.ftypes.map((f) => `"${f}"`).join(' ');
      filterClauses = `?waterBody${suffix} nhdplusv2:hasFTYPE ?ftype${suffix} .
      VALUES ?ftype${suffix} { ${ftypeValues} }`;
    }
    return `${s2Var} spatial:connectedTo ?waterBody${suffix} .
      ?waterBody${suffix} rdf:type hyf:HY_WaterBody .
      ${filterClauses}`;
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
    return `${summarize(items, undefined, 'water types', 'water type', ', ', 'any')} ${LABEL}`;
  },
};
