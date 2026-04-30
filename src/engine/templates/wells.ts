import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';
import type { WellFilters } from '../../types/query';

export function buildWellS2Query(filters?: WellFilters, regionCodes?: string[]): string {
  const regionFilterClause = buildRegionFilterClause(regionCodes);

  const typeFilter = buildTypeFilter(filters);

  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 ;
              spatial:connectedTo ?well .
      ${regionFilterClause}
      ${typeFilter}
    }
  `;
}

export function buildWellRetrievalQuery(
  s2ValuesString: string,
  filters?: WellFilters
): string {
  const typeFilter = buildTypeFilter(filters);

  return `
    ${PREFIXES}
    SELECT DISTINCT ?well ?wellWKT ?wellName ?s2cell
      ?meUse ?meWellType ?meDepth ?meOverburden
      ?ilOwner ?ilDepth ?ilPurpose ?ilYield
    WHERE {
      VALUES ?s2cell { ${s2ValuesString} }
      ?s2cell spatial:connectedTo ?well .
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

function buildTypeFilter(filters?: WellFilters): string {
  // Default: query both IL and ME wells
  const types = filters?.wellTypes;

  if (!types?.length) {
    return `{ ?well rdf:type il_isgs:ISGS-Well } UNION { ?well rdf:type me_mgs:MGS-Well }`;
  }

  const clauses: string[] = [];
  for (const t of types) {
    switch (t) {
      case 'ISGS-Well':
        clauses.push('{ ?well rdf:type il_isgs:ISGS-Well }');
        break;
      case 'MGS-Well':
        clauses.push('{ ?well rdf:type me_mgs:MGS-Well }');
        break;
    }
  }

  return clauses.length ? clauses.join(' UNION ') : `{ ?well rdf:type il_isgs:ISGS-Well } UNION { ?well rdf:type me_mgs:MGS-Well }`;
}
