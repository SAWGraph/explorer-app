import { PREFIXES } from '../../constants/prefixes';
import type {
  FacilityFilters,
  WaterBodyFilters,
  WellFilters,
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
      ?facility fio:ofIndustry ?industryGroup ;
                fio:ofIndustry ?industryCode ;
                geo:hasGeometry/geo:asWKT ?facWKT ;
                rdfs:label ?facilityName .
      ?industryCode a naics:NAICS-IndustryCode ;
                    fio:subcodeOf ?industryGroup ;
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

export function buildWellsByIri(wellIris: string[], filters?: WellFilters): string {
  const wellTypes = filters?.wellTypes;
  let typeFilter: string;
  if (!wellTypes?.length) {
    typeFilter = `{ ?well rdf:type il_isgs:ISGS-Well } UNION { ?well rdf:type me_mgs:MGS-Well }`;
  } else {
    const clauses: string[] = [];
    for (const t of wellTypes) {
      if (t === 'ISGS-Well') clauses.push('{ ?well rdf:type il_isgs:ISGS-Well }');
      else if (t === 'MGS-Well') clauses.push('{ ?well rdf:type me_mgs:MGS-Well }');
    }
    typeFilter = clauses.length
      ? clauses.join(' UNION ')
      : `{ ?well rdf:type il_isgs:ISGS-Well } UNION { ?well rdf:type me_mgs:MGS-Well }`;
  }
  const vals = wellIris.map(wrapUri).join(' ');

  return `
    ${PREFIXES}
    SELECT DISTINCT ?well ?wellWKT ?wellName ?s2cell
      ?meUse ?meWellType ?meDepth ?meOverburden
      ?ilOwner ?ilDepth ?ilPurpose ?ilYield
    WHERE {
      VALUES ?well { ${vals} }
      ?s2cell spatial:connectedTo ?well ;
              rdf:type kwg-ont:S2Cell_Level13 .
      ${typeFilter}
      ?well geo:hasGeometry/geo:asWKT ?wellWKT .
      OPTIONAL { ?well rdfs:label ?wellName . }
      OPTIONAL { ?well me_mgs:hasUse ?meUse . }
      OPTIONAL { ?well me_mgs:ofWellType ?meWellType . }
      OPTIONAL { ?well me_mgs:wellDepth/qudt:numericValue ?meDepth . }
      OPTIONAL { ?well me_mgs:wellOverburden/qudt:numericValue ?meOverburden . }
      OPTIONAL { ?well il_isgs:hasOwner ?ilOwner . }
      OPTIONAL { ?well il_isgs:wellDepth/qudt:numericValue ?ilDepth . }
      OPTIONAL { ?well il_isgs:wellPurpose ?ilPurpose . }
      OPTIONAL { ?well il_isgs:wellYield/qudt:numericValue ?ilYield . }
    }
  `;
}
