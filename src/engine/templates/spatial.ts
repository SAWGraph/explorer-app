import { PREFIXES } from '../../constants/prefixes';

export function buildRegionBoundaryQuery(regionCode: string): string {
  return `
    ${PREFIXES}
    SELECT ?region (SAMPLE(?_name) AS ?regionName) (SAMPLE(?_wkt) AS ?regionWKT) WHERE {
      ?region kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.${regionCode} ;
              rdfs:label ?_name ;
              geo:hasGeometry/geo:asWKT ?_wkt .
      FILTER(STRSTARTS(STR(?region), STR(kwgr:)))
    } GROUP BY ?region
  `;
}
