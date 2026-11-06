import type { FacilityFilters } from '../types/query';
import { buildIndustryValues } from '../templates/facilities';
import { buildFacilitiesByIri } from '../templates/hydrate';
import { anyFilterSlotSet, type EntityModule } from './types';

export const facilities: EntityModule = {
  type: 'facilities',
  label: 'facilities',
  isFlowline: false,
  details: {
    kind: 'by-iri',
    endpoint: 'federation',
    buildQuery: (iris, block) => buildFacilitiesByIri(iris, block.facilityFilters),
  },
  iriVar: (suffix) => `?facility${suffix}`,
  bindInCell(block, s2Var, suffix) {
    const industry = buildIndustryValues(
      (block.facilityFilters as FacilityFilters | undefined)?.industryCodes,
      suffix,
    );
    return `${s2Var} kwg-ont:sfContains ?facility${suffix} .
      ?facility${suffix} fio:ofIndustry ?industryCode${suffix} .
      ?industryCode${suffix} a naics:NAICS-IndustryCode .
      ${industry}`;
  },
  isFiltered: anyFilterSlotSet,
};
