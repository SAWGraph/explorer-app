import type { FacilityFilters } from '../types/query';
import { buildIndustryValues } from '../templates/facilities';
import { buildFacilitiesByIri } from '../templates/hydrate';
import { NAICS_SECTOR_SHORT } from '../constants/naics';
import { anyRegionLinkCheck, ownFilterSet, type EntityModule } from './types';
import { namedOrCounted } from './wording';

const LABEL = 'facilities';

const iriVar = (suffix: string): string => `?facility${suffix}`;

export const facilities: EntityModule = {
  type: 'facilities',
  label: LABEL,
  isFlowline: false,
  details: {
    kind: 'by-iri',
    endpoint: 'federation',
    buildQuery: (iris, block) => buildFacilitiesByIri(iris, block.facilityFilters),
  },
  iriVar,
  // With no industry filter every facility counts, coded or not: about three
  // of every four have no NAICS code (Cumberland: 603 with a code of 2,203,
  // 2026-11-16, #145). The geometry is required because the details step
  // cannot draw a facility without one (Cumberland: 2,595 without the check).
  bindInCell(block, s2Var, suffix) {
    const facility = iriVar(suffix);
    const inCell = `${s2Var} kwg-ont:sfContains ${facility} .`;
    const codes = (block.facilityFilters as FacilityFilters | undefined)?.industryCodes;
    if (!codes?.length) {
      return `${inCell}
      ${facility} a fio:Facility ; geo:hasGeometry ?_facilityGeom${suffix} .`;
    }
    return `${inCell}
      ${facility} fio:ofIndustry ?industryCode${suffix} .
      ?industryCode${suffix} a naics:NAICS-IndustryCode .
      ${buildIndustryValues(codes, suffix)}`;
  },
  // A facility has one row per industry code that passes the filter. A full
  // 6-digit code matches itself only, so those sides are one row per facility
  // already (landfills and DoD sites nationwide: 5,922 rows for 5,908); a
  // shorter code matches every code under it (5622 nationwide: 13,413 rows for
  // 6,372). With no filter the bind reads no industry, so it is one row per
  // facility and cell (Cumberland: 2,203 for 2,203). Collapsing a side that
  // does not fan out only costs: the two Maine wells dashboard questions'
  // discovery went from 6s to
  // 20s, where Cook's sector-coded side went from 12.5s to 4.2s (2026-11-06).
  //
  // A region fans out too: the region check matches a facility once for each
  // linked region in the selected one, usually its subdivision and its county
  // (Cook: 80,145 rows for 40,299 facilities, 2026-11-16).
  fansOut: (block) => {
    if (block.region?.countyCodes?.length || block.region?.stateCode) return true;
    const codes = (block.facilityFilters as FacilityFilters | undefined)?.industryCodes ?? [];
    return codes.some((code) => code.length < 6);
  },
  filterSlot: 'facilityFilters',
  isFiltered: ownFilterSet('facilityFilters', ['industryCodes']),
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
      // Every industry picked. Not the bare 'facilities': with no filter the
      // map also shows facilities with no code, and this does not (#145).
      // Compare pre-dedupe so all 20 NAICS roots still trigger this even
      // though Manufacturing/Retail/Transportation dedupe to fewer short labels.
      if (totals?.industries !== undefined && topLevel.length === totals.industries) {
        return `${LABEL} with an industry code`;
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
      return namedOrCounted(displayLabels, LABEL, ', ', (n) => `in ${n} industries`);
    }
    return LABEL;
  },
  // The cell check alone let in facilities from the next county (#145,
  // measured in docs/DEBUGGING.md).
  regionCheck: anyRegionLinkCheck(iriVar, 'facility'),
};
