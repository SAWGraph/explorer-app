import type { StreamFilters } from '../types/query';
import { buildStreamsByIri } from '../templates/hydrate';
import { anyFilterSlotSet, type EntityModule } from './types';

// FTYPE restriction for flowlines, shared by the cell bind below and by the
// trace query, where a streams target is the traced flowline itself.
export function streamFtypeFilter(filters: StreamFilters | undefined, suffix: string): string {
  if (!filters?.ftypes?.length) return '';
  const values = filters.ftypes.map((f) => `"${f}"`).join(' ');
  return `?stream${suffix} nhdplusv2:hasFTYPE ?flFtype${suffix} .
      VALUES ?flFtype${suffix} { ${values} }`;
}

export const streams: EntityModule = {
  type: 'streams',
  label: 'streams',
  isFlowline: true,
  details: {
    kind: 'by-iri',
    endpoint: 'hydrologykg',
    buildQuery: (iris, block) => buildStreamsByIri(iris, block.streamFilters),
  },
  iriVar: (suffix) => `?stream${suffix}`,
  bindInCell(block, s2Var, suffix) {
    return `${s2Var} spatial:connectedTo ?stream${suffix} .
      ?stream${suffix} rdf:type hyf:HY_FlowPath .
      ${streamFtypeFilter(block.streamFilters, suffix)}`;
  },
  isFiltered: anyFilterSlotSet,
};
