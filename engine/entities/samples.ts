import type { SampleFilters } from '../types/query';
import { buildSampleFilterClauses, needsUnitJoin, resultValueClauses } from '../templates/samples';
import { buildSamplesByIri } from '../templates/hydrate';
import type { EntityModule } from './types';

// The observation joins a samples block needs to *filter*, which is a smaller
// set than the joins it needs to *display*. Every required triple is also a
// filter, so asking for detail the filters never read deletes rows: the unit
// join is the worst of them, because a non-detect has no coso:measurementUnit
// (see needsUnitJoin in templates/samples.ts) and requiring it dropped 774 of
// 1,688 Cumberland PFOS observations while "include non-detects" was ticked.
function sampleJoinsNeeded(filters: SampleFilters | undefined) {
  const range = needsUnitJoin(filters);
  // buildSampleFilterClauses reads ?numericResult / ?nonDetect for both of
  // these, and resultValueClauses is what binds them.
  const result = range || filters?.includeNondetects === false;
  return {
    substance: Boolean(filters?.substances?.length),
    material: Boolean(filters?.materialTypes?.length),
    result,
    // The ng/L comparison is the only thing that reads the unit.
    unit: range,
    observation: Boolean(filters?.substances?.length || filters?.materialTypes?.length || result),
  };
}

export const samples: EntityModule = {
  type: 'samples',
  label: 'samples',
  isFlowline: false,
  // By IRI on federation, in request-size chunks (planner.ts iriScopes).
  // Re-deriving the trace here is what used to time out.
  details: {
    kind: 'by-iri',
    endpoint: 'federation',
    buildQuery: (iris, block) => buildSamplesByIri(iris, block.sampleFilters),
  },
  iriVar: (suffix) => `?sp${suffix}`,
  // `observations: false` drops the observation joins outright. Only the
  // IRI-finding queries may pass it: they project just the sample-point IRI,
  // and re-deriving every observation there is what pushes the hydrology
  // queries past QLever's 30s limit / memory ceiling (429/500).
  // buildFusedWellQuery is the one caller left on `true`: it projects well
  // columns from a body that may carry a samples block on the other side.
  //
  // With `false` and an active sample filter the block is rebuilt from
  // sampleJoinsNeeded: enough to honour the filter, nothing that only feeds a
  // popup.
  bindInCell(block, s2Var, suffix, observations) {
    const point = `?sp${suffix} rdf:type coso:SamplePoint ;
                spatial:connectedTo ${s2Var} .`;
    const filters = buildSampleFilterClauses(block.sampleFilters, suffix);

    if (!observations) {
      const need = sampleJoinsNeeded(block.sampleFilters);
      if (!need.observation) return point;
      const parts = [
        point,
        `?observation${suffix} coso:observedAtSamplePoint ?sp${suffix} .`,
      ];
      if (need.substance) {
        parts.push(`?observation${suffix} coso:ofDSSToxSubstance ?substance${suffix} .`);
      }
      if (need.material) {
        // The material lives on the analysed sample, not the observation.
        parts.push(`?observation${suffix} coso:analyzedSample ?sample${suffix} .
      ?sample${suffix} coso:sampleOfMaterialType ?matType${suffix} .`);
      }
      if (need.result) {
        parts.push(`?observation${suffix} coso:hasResult ?result${suffix} .
      ${resultValueClauses(suffix)}`);
      }
      if (need.unit) {
        parts.push(`?result${suffix} coso:measurementUnit ?unit${suffix} .`);
      }
      parts.push(filters);
      return parts.join('\n      ');
    }

    return `${point}
      ?observation${suffix} rdf:type coso:ContaminantObservation ;
          coso:observedAtSamplePoint ?sp${suffix} ;
          coso:ofDSSToxSubstance ?substance${suffix} ;
          coso:analyzedSample ?sample${suffix} ;
          coso:hasResult ?result${suffix} .
      ?sample${suffix} coso:sampleOfMaterialType ?matType${suffix} .
      ?matType${suffix} rdfs:label ?matTypeLabel${suffix} .
      ?result${suffix} coso:measurementUnit ?unit${suffix} .
      ${resultValueClauses(suffix)}
      ${filters}`;
  },
  // Samples are the one type with a filter that defaults to set:
  // `includeNondetects: true` is the UI's default checked state and narrows
  // nothing, so only `=== false` counts. sampleJoinsNeeded draws that line; a
  // generic "any field is non-null" scan does not, and read
  // `includeNondetects: true` alone as a reason to reorder the whole body.
  isFiltered: (block) => sampleJoinsNeeded(block.sampleFilters).observation,
};
