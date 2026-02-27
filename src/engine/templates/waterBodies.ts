import { PREFIXES } from '../../constants/prefixes';
import type { WaterBodyFilters } from '../../types/query';

export function buildWaterBodyS2Query(filters?: WaterBodyFilters, regionCode?: string): string {
  let filterClauses = '';
  if (filters?.ftypes?.length) {
    const ftypeValues = filters.ftypes.map(f => `"${f}"`).join(' ');
    filterClauses += `VALUES ?ftype { ${ftypeValues} }\n      `;
  }

  const regionFilterClause = regionCode
    ? `?s2cell spatial:connectedTo kwgr:administrativeRegion.USA.${regionCode} .`
    : '';

  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 ;
              spatial:connectedTo ?waterBody .
      ${regionFilterClause}
      ?waterBody rdf:type hyf:HY_WaterBody .
      ${filterClauses}
    } GROUP BY ?s2cell
  `;
}

export function buildWaterBodyRetrievalQuery(
  s2ValuesString: string,
  filters?: WaterBodyFilters
): string {
  let filterClauses = '';
  if (filters?.ftypes?.length) {
    const ftypeValues = filters.ftypes.map(f => `"${f}"`).join(' ');
    filterClauses += `VALUES ?ftype { ${ftypeValues} }\n      `;
  }

  return `
    ${PREFIXES}
    SELECT DISTINCT ?waterBody ?wbWKT ?wbName WHERE {
      VALUES ?s2cell { ${s2ValuesString} }
      ?s2cell spatial:connectedTo ?waterBody .
      ?waterBody rdf:type hyf:HY_WaterBody ;
                 geo:hasGeometry/geo:asWKT ?wbWKT .
      OPTIONAL { ?waterBody schema:name ?wbName . }
      ${filterClauses}
    }
  `;
}
