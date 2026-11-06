import type { FacilityFilters } from '../types/query';
import { buildIndustryValues } from '../templates/facilities';
import { buildFacilitiesByIri } from '../templates/hydrate';
import { NAICS_SECTOR_SHORT } from '../constants/naics';
import { anyFilterSlotSet, type EntityModule } from './types';
import { summarize } from './wording';

const LABEL = 'facilities';

export const facilities: EntityModule = {
  type: 'facilities',
  label: LABEL,
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
  describe(block, totals) {
    const codes = block.facilityFilters?.industryCodes;
    const labels = block.facilityFilters?.industryLabels ?? {};
    if (codes?.length) {
      // Show only top-level codes (no code is a prefix of another in the set)
      const codeSet = new Set(codes);
      const topLevel = codes.filter((code) => {
        for (let len = 1; len < code.length; len++) {
          if (codeSet.has(code.substring(0, len))) return false;
        }
        return true;
      });
      // "any industry" → bare 'facilities'. Compare pre-dedupe so all 20
      // NAICS roots still trigger this even though Manufacturing/Retail/
      // Transportation dedupe to fewer short labels.
      if (totals?.industries !== undefined && topLevel.length === totals.industries) {
        return LABEL;
      }
      // Prefer curated short sector names; fall back to official label.
      const seen = new Set<string>();
      const displayLabels: string[] = [];
      for (const code of topLevel) {
        const label = NAICS_SECTOR_SHORT[code] ?? labels[code] ?? code;
        if (!seen.has(label)) {
          seen.add(label);
          displayLabels.push(label);
        }
      }
      const summary = summarize(
        displayLabels,
        undefined,
        'industries',
        'industry',
        ', ',
        'any',
      );
      return `${summary} ${LABEL}`;
    }
    return LABEL;
  },
};
