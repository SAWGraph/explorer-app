import { PREFIXES } from '../../constants/prefixes';
import type { SampleFilters } from '../../types/query';
import { wrapUri, buildSampleFilterClauses } from './samples';

function spValues(spIris: string[]): string {
  return spIris.map(wrapUri).join(' ');
}

export function buildSampleRetrievalByIriQuery(
  spIris: string[],
  filters?: SampleFilters,
): string {
  const filterClauses = buildSampleFilterClauses(filters);
  const vals = spValues(spIris);

  return `
    ${PREFIXES}
    SELECT
      (COUNT(DISTINCT ?observation) as ?resultCount)
      (COUNT(DISTINCT ?sample) as ?sampleCount)
      (MAX(?result_value) as ?max)
      (GROUP_CONCAT(DISTINCT ?substance; separator="; ") as ?substances)
      (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator="; ") as ?materials)
      ?sp ?spWKT ?s2cell
    WHERE {
      VALUES ?sp { ${vals} }
      ?sp spatial:connectedTo ?s2cell ;
          geo:hasGeometry/geo:asWKT ?spWKT .
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
      ?observation rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance ?substance ;
          coso:analyzedSample ?sample ;
          coso:hasResult ?result .
      ?sample rdfs:label ?sampleLabel ;
          coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?result coso:measurementValue ?result_value ;
          coso:measurementUnit ?unit .
      ${filterClauses}
    } GROUP BY ?sp ?spWKT ?s2cell
  `;
}

// ?substance is the displayed label (URI projection conflicts with the label
// path on observations). Substance URI filter is applied via ?substanceUri.
export function buildSampleDetailByIriQuery(
  spIris: string[],
  filters?: SampleFilters,
): string {
  const { substances, ...nonSubstanceFilters } = filters ?? {};
  const filterClauses = buildSampleFilterClauses(
    Object.keys(nonSubstanceFilters).length ? nonSubstanceFilters : undefined,
  );
  const substanceClause = substances?.length
    ? `VALUES ?substanceUri { ${substances.map(wrapUri).join(' ')} }\n      `
    : '';
  const vals = spValues(spIris);

  return `
    ${PREFIXES}
    SELECT DISTINCT
      ?sp ?spWKT
      (SAMPLE(?spName) as ?samplePointName)
      ?sample
      (GROUP_CONCAT(DISTINCT ?sampleId; separator="; ") as ?sampleIdentifier)
      ?observation
      ?date
      ?substance
      ?result_value
      ?unit_sym
      (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator=", ") as ?sampleType)
    WHERE {
      VALUES ?sp { ${vals} }
      ?sp geo:hasGeometry/geo:asWKT ?spWKT .
      OPTIONAL { ?sp rdfs:label ?spName }
      ?sample coso:fromSamplePoint ?sp ;
          coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?observation rdf:type coso:ContaminantObservation ;
          coso:analyzedSample ?sample ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance ?substanceUri ;
          coso:hasResult ?result .
      ${substanceClause}
      OPTIONAL { ?substanceUri skos:altLabel ?altLabel }
      OPTIONAL { ?substanceUri rdfs:label ?rdfLabel }
      BIND(COALESCE(?altLabel, ?rdfLabel, REPLACE(STR(?substanceUri), "^.*[#/]", "")) AS ?substance)
      ?result coso:measurementValue ?result_value ;
          coso:measurementUnit ?unit .
      OPTIONAL { ?unit qudt:symbol ?unit_sym0 }
      BIND(COALESCE(?unit_sym0, REPLACE(STR(?unit), "^.*[#/]", "")) AS ?unit_sym)
      OPTIONAL { ?observation sosa:resultTime ?date }
      OPTIONAL { ?sample dcterms:identifier ?sampleId }
      ${filterClauses}
    }
    GROUP BY ?sp ?spWKT ?sample ?observation ?date ?substance ?result_value ?unit_sym
    ORDER BY ?sp ?sample ?substance DESC(?date)
  `;
}
