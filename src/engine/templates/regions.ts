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

export function buildIndustryCountsQuery(region: { stateCode: string; countyCodes?: string[] }): string {
  const codes = region.countyCodes?.length ? region.countyCodes : [region.stateCode];
  const values = codes
    .map((c) => `kwgr:administrativeRegion.USA.${c}`)
    .join(' ');
  return `
    ${PREFIXES}
    SELECT ?industryCode (COUNT(DISTINCT ?facility) AS ?num) WHERE {
      VALUES ?_regionRoot { ${values} }
      ?s2 rdf:type kwg-ont:S2Cell_Level13 ;
          spatial:connectedTo ?_regionRoot ;
          kwg-ont:sfContains ?facility .
      ?facility fio:ofIndustry ?industryCode .
      ?industryCode a naics:NAICS-IndustryCode .
    } GROUP BY ?industryCode
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

function buildSamplePointRegionPattern(region?: { stateCode?: string; countyCodes?: string[] }): string {
  if (!region?.stateCode) return '';
  const codes = region.countyCodes?.length ? region.countyCodes : [region.stateCode];
  const subdivisions = codes.filter((c) => c.length > 5);
  const fips = codes.filter((c) => c.length <= 5);

  if (subdivisions.length && !fips.length) {
    const values = subdivisions.map((c) => `<https://datacommons.org/browser/geoId/${c}>`).join(' ');
    return `
      VALUES ?_region { ${values} }
      ?sp kwg-ont:sfWithin|kwg-ont:sfTouches ?_region .
    `;
  }

  const values = fips
    .map((c) => `kwgr:administrativeRegion.USA.${c}`)
    .join(' ');
  return `
      ?sp spatial:connectedTo ?_region .
      ?_region rdf:type kwg-ont:AdministrativeRegion_3 ;
               kwg-ont:administrativePartOf+ ?_regionRoot .
      VALUES ?_regionRoot { ${values} }
  `;
}

export function buildDiscoverSubstancesQuery(region?: { stateCode?: string; countyCodes?: string[] }): string {
  const regionPattern = buildSamplePointRegionPattern(region);
  const spType = regionPattern ? '?sp rdf:type coso:SamplePoint .' : '';
  return `
    ${PREFIXES}
    SELECT ?substance
      (SAMPLE(?_label) AS ?label)
      (SAMPLE(?_short) AS ?short_label)
      (COUNT(DISTINCT ?observation) AS ?num)
    WHERE {
      ${spType}
      ${regionPattern}
      ?observation rdf:type coso:ContaminantObservation ;
                   ${regionPattern ? 'coso:observedAtSamplePoint ?sp ;' : ''}
                   coso:ofDSSToxSubstance ?substance .
      ?substance a comptox:ChemicalEntity ;
                 dcterms:alternative ?_label .
      OPTIONAL { ?substance skos:altLabel ?_short . }
    } GROUP BY ?substance
    ORDER BY DESC(?num) ?label
  `;
}

// Priority VALUES: each material type is bucketed into the most specific of the four
// direct coso:MaterialSample subclasses. The data isn't perfectly disjoint (~11 material
// types are sampled under >1 bucket), so MIN(?prio) resolves ties: Biota > Solid > Water > Air.
const MATERIAL_BUCKET_VALUES = `
    OPTIONAL {
      ?sample rdf:type ?bucketClass .
      VALUES (?bucketClass ?prio) {
        (coso:BiotaSample 1)
        (coso:SolidMaterialSample 2)
        (coso:WaterSample 3)
        (coso:AirSample 4)
      }
    }`;

export function buildDiscoverMaterialTypesQuery(region?: { stateCode?: string; countyCodes?: string[] }): string {
  const regionPattern = buildSamplePointRegionPattern(region);
  if (!regionPattern) {
    return `
      ${PREFIXES}
      SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num) (MIN(?prio) AS ?bucketPrio) WHERE {
        ?observation rdf:type coso:ContaminantObservation ;
                     coso:analyzedSample ?sample .
        ?sample coso:sampleOfMaterialType ?matType .
        ${MATERIAL_BUCKET_VALUES}
        OPTIONAL { ?matType rdfs:label ?_label . }
        FILTER(STRSTARTS(STR(?matType), "http://w3id.org/"))
      } GROUP BY ?matType
      ORDER BY DESC(?num) ?label
    `;
  }
  return `
    ${PREFIXES}
    SELECT ?matType (SAMPLE(?_label) AS ?label) (COUNT(DISTINCT ?observation) AS ?num) (MIN(?prio) AS ?bucketPrio) WHERE {
      ?sp rdf:type coso:SamplePoint .
      ${regionPattern}
      ?observation rdf:type coso:ContaminantObservation ;
                   coso:observedAtSamplePoint ?sp ;
                   coso:analyzedSample ?sample .
      ?sample coso:sampleOfMaterialType ?matType .
      ${MATERIAL_BUCKET_VALUES}
      OPTIONAL { ?matType rdfs:label ?_label . }
      FILTER(STRSTARTS(STR(?matType), "http://w3id.org/"))
    } GROUP BY ?matType
    ORDER BY DESC(?num) ?label
  `;
}
