import { PREFIXES } from '../../constants/prefixes';
import type {
  FacilityFilters,
  WaterBodyFilters,
} from '../../types/query';
import { wrapUri } from './samples';
import { buildIndustryValues } from './facilities';

export {
  buildSampleRetrievalByIriQuery as buildSamplesByIri,
  buildSampleDetailByIriQuery as buildSampleDetailsByIri,
} from './downstreamSamples';

export function buildFacilitiesByIri(
  facilityIris: string[],
  filters?: FacilityFilters,
): string {
  const industryClause = buildIndustryValues(filters?.industryCodes);
  const vals = facilityIris.map(wrapUri).join(' ');

  return `
    ${PREFIXES}
    SELECT DISTINCT ?facility ?facWKT ?facilityName ?industryCode ?industryName ?s2cell WHERE {
      VALUES ?facility { ${vals} }
      ?s2cell kwg-ont:sfContains ?facility ;
              rdf:type kwg-ont:S2Cell_Level13 .
      ?facility fio:ofIndustry ?industryCode ;
                geo:hasGeometry/geo:asWKT ?facWKT ;
                rdfs:label ?facilityName .
      ?industryCode a naics:NAICS-IndustryCode ;
                    rdfs:label ?industryName .
      ${industryClause}
    }
  `;
}

export function buildWaterBodiesByIri(
  waterBodyIris: string[],
  filters?: WaterBodyFilters,
): string {
  let filterClauses = '';
  if (filters?.ftypes?.length) {
    const ftypeValues = filters.ftypes.map((f) => `"${f}"`).join(' ');
    filterClauses += `?waterBody nhdplusv2:hasFTYPE ?ftype .\n      `;
    filterClauses += `VALUES ?ftype { ${ftypeValues} }\n      `;
  }
  const vals = waterBodyIris.map(wrapUri).join(' ');

  return `
    ${PREFIXES}
    SELECT DISTINCT ?waterBody ?wbWKT ?wbName ?ftype ?comid ?reachcode ?fcode ?s2cell WHERE {
      VALUES ?waterBody { ${vals} }
      ?s2cell spatial:connectedTo ?waterBody ;
              rdf:type kwg-ont:S2Cell_Level13 .
      ?waterBody rdf:type hyf:HY_WaterBody ;
                 geo:hasGeometry/geo:asWKT ?wbWKT .
      OPTIONAL { ?waterBody schema:name ?wbName . }
      OPTIONAL { ?waterBody nhdplusv2:hasFTYPE ?ftype . }
      OPTIONAL { ?waterBody nhdplusv2:hasCOMID ?comid . }
      OPTIONAL { ?waterBody nhdplusv2:hasReachCode ?reachcode . }
      OPTIONAL { ?waterBody nhdplusv2:hasFCODE ?fcode . }
      ${filterClauses}
    }
  `;
}

