import { buildWaterBodiesByIri } from '../templates/hydrate';
import { anyFilterSlotSet, type EntityModule } from './types';

export const waterBodies: EntityModule = {
  type: 'waterBodies',
  label: 'surface water bodies',
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
  isFiltered: anyFilterSlotSet,
};
