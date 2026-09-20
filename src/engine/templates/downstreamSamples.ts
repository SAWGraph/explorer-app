import { PREFIXES } from '../../constants/prefixes';
import type { SampleFilters } from '../../types/query';
import { wrapUri, buildSampleFilterClauses, resultValueClauses, needsUnitJoin } from './samples';

function spValues(spIris: string[]): string {
  return spIris.map(wrapUri).join(' ');
}

// A non-detect has no coso:measurementUnit, so requiring the unit join hid
// every non-detect from the popup's observation table: on sample point 64220,
// 474 of 3,334 rows survived and the other 2,860 were non-detects. Making it
// OPTIONAL in place OOMs (819.7MB); joining it after resultValueClauses() with
// the symbol lookup nested inside costs the same as before, 6.88s vs 6.59s.
// ?unit_sym stays bound either way because it is a GROUP BY key.
const UNIT_SYMBOL_CLAUSES = `OPTIONAL { ?result coso:measurementUnit ?unit .
                 OPTIONAL { ?unit qudt:symbol ?unit_sym0 } }
      BIND(COALESCE(?unit_sym0,
             IF(BOUND(?unit), REPLACE(STR(?unit), "^.*[#/]", ""), "")) AS ?unit_sym)`;

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
      (MAX(?numericResult) as ?max)
      (GROUP_CONCAT(DISTINCT ?substance; separator="; ") as ?substances)
      (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator="; ") as ?materials)
      (SAMPLE(?spName) as ?samplePointName)
      ?sp ?spWKT ?s2cell
    WHERE {
      VALUES ?sp { ${vals} }
      ?sp spatial:connectedTo ?s2cell ;
          geo:hasGeometry/geo:asWKT ?spWKT .
      OPTIONAL { ?sp rdfs:label ?spName }
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
      ?observation rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance ?substance ;
          coso:analyzedSample ?sample ;
          coso:hasResult ?result .
      ?sample rdfs:label ?sampleLabel ;
          coso:sampleOfMaterialType ?matType .
      ?matType rdfs:label ?matTypeLabel .
      ${needsUnitJoin(filters) ? '?result coso:measurementUnit ?unit .' : ''}
      ${resultValueClauses()}
      ${filterClauses}
    } GROUP BY ?sp ?spWKT ?s2cell
  `;
}

// Projects the substance's label parts rather than one display label: the
// naming rule lives in substanceLabel() so the popup and the filter dropdown
// cannot drift apart again. Aggregating them (SAMPLE/MIN) also keeps a
// substance with two labels from duplicating its observation's row.
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
      ?substanceUri
      (SAMPLE(?shortLabel) as ?substanceShortLabel)
      (SAMPLE(?fullLabel) as ?substanceLabel)
      (MIN(?paramLabel) as ?substanceParamLabel)
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
      OPTIONAL { ?substanceUri skos:altLabel ?shortLabel }
      OPTIONAL { ?substanceUri rdfs:label ?fullLabel }
      OPTIONAL { ?sourceParam comptox:sameAsDSSToxSubstance ?substanceUri ;
                              rdfs:label ?paramLabel }
      ${resultValueClauses()}
      ${UNIT_SYMBOL_CLAUSES}
      OPTIONAL { ?observation sosa:resultTime ?date }
      OPTIONAL { ?sample dcterms:identifier ?sampleId }
      ${filterClauses}
    }
    GROUP BY ?sp ?spWKT ?sample ?observation ?date ?substanceUri ?result_value ?unit_sym
    ORDER BY ?sp ?sample ?substanceUri DESC(?date)
  `;
}
