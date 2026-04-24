import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';
import type { SampleFilters } from '../../types/query';

function wrapUri(uri: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return `<${uri}>`;
  return uri;
}

function buildSampleFilterClauses(filters?: SampleFilters): string {
  if (!filters) return '';
  let clauses = '';

  if (filters.substances?.length) {
    clauses += `VALUES ?substance { ${filters.substances.map(wrapUri).join(' ')} }\n      `;
  }
  if (filters.materialTypes?.length) {
    clauses += `VALUES ?matType { ${filters.materialTypes.map(wrapUri).join(' ')} }\n      `;
  }
  if (filters.minConcentration != null) {
    clauses += `FILTER (?result_value > ${filters.minConcentration})\n      `;
  }
  if (filters.maxConcentration != null) {
    clauses += `FILTER (?result_value < ${filters.maxConcentration})\n      `;
  }
  return clauses;
}

export function buildSampleS2Query(filters?: SampleFilters, regionCodes?: string[]): string {
  const filterClauses = buildSampleFilterClauses(filters);

  const regionFilterClause = buildRegionFilterClause(regionCodes);

  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?sp rdf:type coso:SamplePoint ;
          spatial:connectedTo ?s2cell .
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
      ${regionFilterClause}
      ?observation rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofSubstance ?substance ;
          coso:analyzedSample ?sample ;
          coso:hasResult ?result .
      ?sample coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?result coso:measurementValue ?result_value ;
          coso:measurementUnit ?unit .
      ${filterClauses}
    } GROUP BY ?s2cell
  `;
}

export function buildSampleRetrievalQuery(
  s2ValuesString: string,
  filters?: SampleFilters
): string {
  const filterClauses = buildSampleFilterClauses(filters);

  return `
    ${PREFIXES}
    SELECT
      (COUNT(DISTINCT ?subVal) as ?resultCount)
      (MAX(?result_value) as ?max)
      (GROUP_CONCAT(DISTINCT ?substance; separator="; ") as ?substances)
      (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator="; ") as ?materials)
      ?sp ?spWKT ?s2cell
    WHERE {
      ?sp rdf:type coso:SamplePoint ;
          spatial:connectedTo ?s2cell ;
          geo:hasGeometry/geo:asWKT ?spWKT .
      VALUES ?s2cell { ${s2ValuesString} }
      ?observation rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofSubstance ?substance ;
          coso:analyzedSample ?sample ;
          coso:hasResult ?result .
      ?sample rdfs:label ?sampleLabel ;
          coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?result coso:measurementValue ?result_value ;
          coso:measurementUnit ?unit .
      ?unit qudt:symbol ?unit_sym .
      ${filterClauses}
      BIND((CONCAT(str(?result_value), " ", ?unit_sym)) as ?subVal)
    } GROUP BY ?sp ?spWKT ?s2cell
  `;
}
