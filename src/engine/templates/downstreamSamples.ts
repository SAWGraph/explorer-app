import { PREFIXES } from '../../constants/prefixes';
import type { FacilityFilters, SampleFilters } from '../../types/query';
import { buildIndustryValues } from './facilities';
import { wrapUri, buildSampleFilterClauses } from './samples';
import { buildRegionFilterClause } from './shared';

export interface FederatedDownstreamSamplesOpts {
  facilityFilters?: FacilityFilters;
  anchorRegionCodes?: string[];
  targetRegionCodes?: string[];
  sampleFilters?: SampleFilters;
  direction: 'downstream' | 'upstream';
}

// Single federated query: facility S2 → sfTouches → hydrology trace → sample-point match.
// Returns ?sp IRIs only; intermediate S2 sets never cross the wire.
export function buildFederatedSamplePointAnchorQuery(
  opts: FederatedDownstreamSamplesOpts,
): string {
  const industryValues = buildIndustryValues(opts.facilityFilters?.industryCodes);
  const facRegion = buildRegionFilterClause(opts.anchorRegionCodes, '?s2anchor', '?_facRegion');
  const targetRegion = buildRegionFilterClause(opts.targetRegionCodes, '?ds_s2cell', '?_targRegion');
  const substanceUris = opts.sampleFilters?.substances ?? [];
  const substanceValues = substanceUris.length
    ? `VALUES ?substance { ${substanceUris.map(wrapUri).join(' ')} }\n      `
    : '';

  const traceTriple =
    opts.direction === 'downstream'
      ? `?upstream_flowline hyf:downstreamFlowPathTC ?ds_s2_flowline .`
      : `?ds_s2_flowline hyf:downstreamFlowPathTC ?upstream_flowline .`;

  return `
    ${PREFIXES}
    SELECT DISTINCT ?sp WHERE {
      {
        SELECT DISTINCT ?ds_s2cell WHERE {
          ?s2anchor rdf:type kwg-ont:S2Cell_Level13 ;
                    kwg-ont:sfContains ?facility .
          ${facRegion}
          ?facility fio:ofIndustry ?industryGroup ;
                    fio:ofIndustry ?industryCode .
          ?industryCode a naics:NAICS-IndustryCode ;
                        fio:subcodeOf ?industryGroup .
          ${industryValues}
          ?s2anchor kwg-ont:sfTouches | owl:sameAs ?s2neighbor .
          ?s2neighbor spatial:connectedTo ?upstream_flowline .
          ?upstream_flowline rdf:type hyf:HY_FlowPath .
          ${traceTriple}
          ?ds_s2cell spatial:connectedTo ?ds_s2_flowline ;
                     rdf:type kwg-ont:S2Cell_Level13 .
          ${targetRegion}
        }
      }
      ?sp rdf:type coso:SamplePoint ;
          spatial:connectedTo ?ds_s2cell .
      ?observation rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp ;
          coso:ofDSSToxSubstance ?substance .
      ${substanceValues}
    }
  `;
}

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
      (COUNT(DISTINCT ?subVal) as ?resultCount)
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
      ?unit qudt:symbol ?unit_sym .
      ${filterClauses}
      BIND((CONCAT(str(?result_value), " ", ?unit_sym)) as ?subVal)
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
      ?substanceUri skos:altLabel ?substance .
      ${substanceClause}
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
