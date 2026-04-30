import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';
import type { WaterBodyFilters } from '../../types/query';

export function buildWaterBodyS2Query(filters?: WaterBodyFilters, regionCodes?: string[]): string {
  let filterClauses = '';
  if (filters?.ftypes?.length) {
    const ftypeValues = filters.ftypes.map(f => `"${f}"`).join(' ');
    filterClauses += `?waterBody nhdplusv2:hasFTYPE ?ftype .\n      `;
    filterClauses += `VALUES ?ftype { ${ftypeValues} }\n      `;
  }

  const regionFilterClause = buildRegionFilterClause(regionCodes);

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
    filterClauses += `?waterBody nhdplusv2:hasFTYPE ?ftype .\n      `;
    filterClauses += `VALUES ?ftype { ${ftypeValues} }\n      `;
  }

  return `
    ${PREFIXES}
    SELECT DISTINCT ?waterBody ?wbWKT ?wbName ?ftype ?comid ?reachcode ?fcode ?s2cell WHERE {
      VALUES ?s2cell { ${s2ValuesString} }
      ?s2cell spatial:connectedTo ?waterBody .
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
