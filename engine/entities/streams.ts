import type { StreamFilters } from '../types/query';
import { buildStreamsByIri } from '../templates/hydrate';
import { STREAM_FTYPES } from '../constants/featureTypes';
import { ownFilterSet, type EntityModule } from './types';
import { ftypeLabels, summarize } from './wording';

const LABEL = 'streams';

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
  iriVar: (suffix) => `?stream${suffix}`,
  bindInCell(block, s2Var, suffix) {
    return `${s2Var} spatial:connectedTo ?stream${suffix} .
      ?stream${suffix} rdf:type hyf:HY_FlowPath .
      ${streamFtypeFilter(block.streamFilters, suffix)}`;
  },
  // One row per entity and cell already (measured in Maine, 2026-11-06).
  fansOut: () => false,
  filterSlot: 'streamFilters',
  isFiltered: ownFilterSet('streamFilters', ['ftypes']),
  describe(block) {
    const ftypes = block.streamFilters?.ftypes ?? [];
    if (!ftypes.length) return LABEL;
    const items = ftypeLabels(ftypes, STREAM_FTYPES);
    return `${summarize(items, undefined, 'stream types', 'stream type', ', ', 'any')} ${LABEL}`;
  },
};
