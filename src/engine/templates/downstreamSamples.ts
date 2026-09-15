import { PREFIXES } from '../../constants/prefixes';
import type { SampleFilters } from '../../types/query';
import { wrapUri, buildSampleFilterClauses, resultValueClauses, needsUnitJoin } from './samples';

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
    # No DISTINCT: GROUP BY already yields distinct groups, and the extra sort
    # is not free on a point with 1,650 results.
    SELECT
      ?sp ?spWKT
      (SAMPLE(?spName) as ?samplePointName)
      ?sample
      (GROUP_CONCAT(DISTINCT ?sampleId; separator="; ") as ?sampleIdentifier)
      ?observation
      ?date
      ?substance
      ?result_value
      ?unit_sym
      ?sampleType
    WHERE {
      VALUES ?sp { ${vals} }
      ?sp geo:hasGeometry/geo:asWKT ?spWKT .
      OPTIONAL { ?sp rdfs:label ?spName }
      ?sample coso:fromSamplePoint ?sp .
      # Material types come from a subselect, not from a join alongside the
      # observations. Joined together they are a cross product: this sample has
      # 3 material types and 26 observations, which matched 78 rows for 26
      # measurements and then tagged every measurement with all 3 species.
      # One row per sample here, so each measurement keeps its own identity.
      #
      # The VALUES inside the subselect is load-bearing. Without it the subselect
      # groups material types for every sample in the graph before joining, and
      # the endpoint dies with "Tried to allocate 818.4 MB".
      {
        SELECT ?sample (GROUP_CONCAT(DISTINCT ?matTypeLabel; separator=", ") AS ?sampleType)
        WHERE {
          VALUES ?spForMaterials { ${vals} }
          ?sample coso:fromSamplePoint ?spForMaterials ;
                  coso:sampleOfMaterialType ?matType .
          ?matType rdfs:label ?matTypeLabel .
        } GROUP BY ?sample
      }
      ?observation rdf:type coso:ContaminantObservation ;
          coso:analyzedSample ?sample ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance ?substanceUri ;
          coso:hasResult ?result .
      ${substanceClause}
      # One name per substance, resolved in its own subselect.
      #
      # The fallback order matches the substance dropdown
      # (buildDiscoverSubstancesQuery): 32 of the 101 observed substances carry no
      # label of their own, and without the sameAsDSSToxSubstance step they render
      # as a bare DTXSID here while the dropdown names them properly.
      #
      # It has to be aggregated, not a plain OPTIONAL. Some substances have
      # several sameAsDSSToxSubstance nodes carrying labels, and inline that
      # multiplied the rows: 44 became 91, 271 became 679. MIN picks one
      # deterministically, so the same substance always displays the same way.
      #
      # Bounded by VALUES for the same reason as the material subselect below.
      {
        SELECT ?substanceUri (MIN(?anyLabel) AS ?substance) WHERE {
          VALUES ?spForNames { ${vals} }
          ?obsForNames coso:observedAtSamplePoint ?spForNames ;
                       coso:ofDSSToxSubstance ?substanceUri .
          OPTIONAL { ?substanceUri skos:altLabel ?altLabel }
          OPTIONAL { ?substanceUri rdfs:label ?rdfLabel }
          OPTIONAL { ?paramL comptox:sameAsDSSToxSubstance ?substanceUri ; rdfs:label ?paramLabel }
          BIND(COALESCE(?altLabel, ?rdfLabel, ?paramLabel, REPLACE(STR(?substanceUri), "^.*[#/]", "")) AS ?anyLabel)
        } GROUP BY ?substanceUri
      }
      # Optional, not required. No non-detect carries coso:measurementUnit, so a
      # required join here hid 227 of 271 results at one Indiana sample point.
      # The equivalent join in fusedQueries.ts stays required on purpose: dropping
      # it there triples the matched rows and the endpoint runs out of memory.
      # The symbol lookup is nested inside the unit OPTIONAL, not beside it.
      # Beside it, the 227 rows with no unit each drove an OptionalJoin against
      # an unbound ?unit and the query timed out (429, "OptionalJoin on ?unit").
      OPTIONAL {
        ?result coso:measurementUnit ?unit .
        OPTIONAL { ?unit qudt:symbol ?unit_sym0 }
      }
      ${resultValueClauses()}
      BIND(COALESCE(?unit_sym0, REPLACE(STR(?unit), "^.*[#/]", ""), "") AS ?unit_sym)
      OPTIONAL { ?observation sosa:resultTime ?date }
      OPTIONAL { ?sample dcterms:identifier ?sampleId }
      ${filterClauses}
    }
    GROUP BY ?sp ?spWKT ?sample ?sampleType ?observation ?date ?substance ?result_value ?unit_sym
    ORDER BY ?sp ?sample ?substance DESC(?date)
  `;
}
