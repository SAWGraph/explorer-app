import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';
import type { SampleFilters } from '../../types/query';

function wrapUri(uri: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return `<${uri}>`;
  return uri;
}

const NG_PER_L_UNIT_URI = 'http://qudt.org/vocab/unit/NanoGM-PER-L';

// Emits the SPARQL fragment that filters by substance / material / concentration
// range. Requires the caller to bind ?result, ?result_value, and ?unit before
// this fragment appears. Range filters pin the unit to ng/L and handle two
// numeric-value shapes (direct coso:measurementValue and nested
// qudt:quantityValue/qudt:numericValue) plus the coso:non-detect URI literal.
function buildSampleFilterClauses(filters?: SampleFilters): string {
  if (!filters) return '';
  let clauses = '';

  if (filters.substances?.length) {
    clauses += `VALUES ?substance { ${filters.substances.map(wrapUri).join(' ')} }\n      `;
  }
  if (filters.materialTypes?.length) {
    clauses += `VALUES ?matType { ${filters.materialTypes.map(wrapUri).join(' ')} }\n      `;
  }

  const hasRange =
    filters.minConcentration != null || filters.maxConcentration != null;
  const excludeNondetects = filters.includeNondetects === false;

  if (hasRange || excludeNondetects) {
    clauses += `OPTIONAL { ?result qudt:quantityValue/qudt:numericValue ?numericResult }\n      `;
    clauses += `OPTIONAL { ?result qudt:enumeratedValue ?enumDetected }\n      `;
  }

  if (hasRange) {
    clauses += `BIND(COALESCE(xsd:decimal(?numericResult), xsd:decimal(?result_value)) as ?numericValue)\n      `;
    clauses += `VALUES ?unit { <${NG_PER_L_UNIT_URI}> }\n      `;

    const numericChecks: string[] = [];
    if (filters.minConcentration != null) {
      numericChecks.push(`?numericValue >= ${filters.minConcentration}`);
    }
    if (filters.maxConcentration != null) {
      numericChecks.push(`?numericValue <= ${filters.maxConcentration}`);
    }
    const numericExpr = `BOUND(?numericValue) && ${numericChecks.join(' && ')}`;

    if (excludeNondetects) {
      clauses += `FILTER(${numericExpr})\n      `;
      clauses += `FILTER(!BOUND(?enumDetected))\n      `;
    } else {
      clauses += `FILTER((${numericExpr}) || BOUND(?enumDetected))\n      `;
    }
  } else if (excludeNondetects) {
    clauses += `FILTER(!BOUND(?enumDetected))\n      `;
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
          coso:ofDSSToxSubstance ?substance ;
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
          coso:ofDSSToxSubstance ?substance ;
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

export function buildSampleDetailQuery(
  s2ValuesString: string,
  filters?: SampleFilters
): string {
  const filterClauses = buildSampleFilterClauses(filters);

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
      ?sp rdf:type coso:SamplePoint ;
          spatial:connectedTo ?s2cell ;
          geo:hasGeometry/geo:asWKT ?spWKT .
      VALUES ?s2cell { ${s2ValuesString} }
      OPTIONAL { ?sp rdfs:label ?spName }
      ?sample coso:fromSamplePoint ?sp ;
          coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ?observation rdf:type coso:ContaminantObservation ;
          coso:analyzedSample ?sample ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance/skos:altLabel ?substance ;
          coso:hasResult ?result .
      ?result coso:measurementValue ?result_value ;
          coso:measurementUnit ?unit .
      ?unit qudt:symbol ?unit_sym .
      OPTIONAL { ?observation sosa:resultTime ?date }
      OPTIONAL { ?sample dcterms:identifier ?sampleId }
      ${filterClauses}
    }
    GROUP BY ?sp ?spWKT ?sample ?observation ?date ?substance ?result_value ?unit_sym
    ORDER BY ?sp ?sample ?substance DESC(?date)
  `;
}
