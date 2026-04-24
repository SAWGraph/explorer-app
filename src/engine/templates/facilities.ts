import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';
import type { FacilityFilters } from '../../types/query';

export function buildFacilityS2Query(filters?: FacilityFilters, regionCodes?: string[]): string {
  const industryValuesClause = buildIndustryValues(filters?.industryCodes);

  const regionFilterClause = buildRegionFilterClause(regionCodes);
  const limit = regionFilterClause || industryValuesClause ? '' : 'LIMIT 5000';

  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 ;
              kwg-ont:sfContains ?facility .
      ${regionFilterClause}
      ?facility fio:ofIndustry ?industryGroup ;
                fio:ofIndustry ?industryCode .
      ?industryCode a naics:NAICS-IndustryCode ;
                    fio:subcodeOf ?industryGroup ;
                    rdfs:label ?industryName .
      ${industryValuesClause}
    } GROUP BY ?s2cell ${limit}
  `;
}

export function buildFacilityDetailsQuery(
  filters?: FacilityFilters,
  s2Cells?: string[]
): string {
  const industryValuesClause = buildIndustryValues(filters?.industryCodes);
  const s2ValuesClause = s2Cells?.length
    ? `VALUES ?s2cell { ${s2Cells.join(' ')} }\n      ?s2cell kwg-ont:sfContains ?facility .`
    : '';

  const limit = s2ValuesClause ? '' : 'LIMIT 5000';

  return `
    ${PREFIXES}
    SELECT DISTINCT ?facility ?facWKT ?facilityName ?industryCode ?industryName ?s2cell WHERE {
      ${s2ValuesClause}
      ?facility fio:ofIndustry ?industryGroup ;
                fio:ofIndustry ?industryCode ;
                geo:hasGeometry/geo:asWKT ?facWKT ;
                rdfs:label ?facilityName .
      ?industryCode a naics:NAICS-IndustryCode ;
                    fio:subcodeOf ?industryGroup ;
                    rdfs:label ?industryName .
      ${industryValuesClause}
    } ${limit}
  `;
}

function buildIndustryValues(codes?: string[]): string {
  if (!codes || codes.length === 0) return '';

  const groups: string[] = [];
  const specifics: string[] = [];

  for (const code of codes) {
    if (code.length > 4) {
      specifics.push(`naics:NAICS-${code}`);
    } else {
      groups.push(`naics:NAICS-${code}`);
    }
  }

  let clause = '';
  if (groups.length > 0) {
    clause += `VALUES ?industryGroup { ${groups.join(' ')} }\n      `;
  }
  if (specifics.length > 0) {
    clause += `VALUES ?industryCode { ${specifics.join(' ')} }\n      `;
  }
  return clause;
}
