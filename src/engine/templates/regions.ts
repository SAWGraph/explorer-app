import { PREFIXES } from '../../constants/prefixes';

export function buildDiscoverCountiesQuery(stateCode: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?county ?countyName WHERE {
      ?county kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.${stateCode} ;
              rdfs:label ?countyName .
      FILTER(STRSTARTS(STR(?county), STR(kwgr:)))
    } ORDER BY ?countyName
  `;
}

export function buildDiscoverIndustriesQuery(): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?code ?label ?groupCode ?groupLabel WHERE {
      ?industryCode a naics:NAICS-IndustryCode ;
          rdfs:label ?label ;
          fio:subcodeOf ?group .
      ?group rdfs:label ?groupLabel .
      BIND(REPLACE(STR(?industryCode), STR(naics:NAICS-), "") AS ?code)
      BIND(REPLACE(STR(?group), STR(naics:NAICS-), "") AS ?groupCode)
    } ORDER BY ?groupCode ?code
  `;
}

export function buildDiscoverSubstancesQuery(): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?substance
      (SAMPLE(?_label) AS ?label)
      (SAMPLE(?_short) AS ?short_label)
    WHERE {
      ?observation coso:ofDSSToxSubstance ?substance .
      ?substance a comptox:ChemicalEntity .
      ?substance dcterms:alternative ?_label .
      OPTIONAL { ?substance skos:altLabel ?_short . }
    } GROUP BY ?substance
    ORDER BY ?label
  `;
}

export function buildDiscoverMaterialTypesQuery(): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?matType ?label WHERE {
      ?sample coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?label .
    } ORDER BY ?label
  `;
}
