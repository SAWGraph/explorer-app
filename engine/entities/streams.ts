import type { StreamFilters } from '../types/query';
import { buildStreamsByIri } from '../templates/hydrate';
import { STREAM_FTYPES } from '../constants/featureTypes';
import { ownFilterSet, type EntityModule } from './types';
import { ftypeLabels, namedOrCounted } from './wording';

const LABEL = 'streams and flowlines';

const iriVar = (suffix: string): string => `?stream${suffix}`;
const inCell = (s2Var: string, suffix: string): string => `${s2Var} spatial:connectedTo ${iriVar(suffix)} .
      ${iriVar(suffix)} rdf:type hyf:HY_FlowPath .`;

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
  label: LABEL,
  isFlowline: true,
  details: {
    kind: 'by-iri',
    endpoint: 'hydrologykg',
    buildQuery: (iris, block) => buildStreamsByIri(iris, block.streamFilters),
  },
  iriVar,
  bindInCell(block, s2Var, suffix) {
    return `${inCell(s2Var, suffix)}
      ${streamFtypeFilter(block.streamFilters, suffix)}`;
  },
  options: {
    bind: (s2Var, suffix, optionVar) => `${inCell(s2Var, suffix)}
      ${iriVar(suffix)} nhdplusv2:hasFTYPE ${optionVar} .`,
  },
  // One row per entity and cell already (measured in Maine, 2026-11-06).
  fansOut: () => false,
  filterSlot: 'streamFilters',
  isFiltered: ownFilterSet('streamFilters', ['ftypes']),
  describe(block) {
    const ftypes = block.streamFilters?.ftypes ?? [];
    if (!ftypes.length) return LABEL;
    const items = ftypeLabels(ftypes, STREAM_FTYPES);
    return namedOrCounted(items, LABEL, ', ', (n) => `of ${n} types`);
  },
};
