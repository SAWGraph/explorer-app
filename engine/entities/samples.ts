import type { SampleFilters } from '../types/query';
import { buildSampleFilterClauses, needsUnitJoin, resultValueClauses } from '../templates/samples';
import { buildSamplesByIri } from '../templates/hydrate';
import { FALLBACK_MATERIAL_TYPES } from '../constants/materialTypes';
import type { EntityModule } from './types';
import { LIST_THRESHOLD, extractLabel, summarize } from './wording';

const LABEL = 'samples';

// Concentration range and the non-detect exclusion, as one parenthetical:
// " (10-1000 ng/L, detections only)". The editor's inputs are ng/L and the
// query compares in ng/L, so that is the unit when none is stored.
function describeConcentration(f?: SampleFilters): string {
  if (!f) return '';
  const { minConcentration: min, maxConcentration: max } = f;
  const u = ` ${f.unit ?? 'ng/L'}`;
  const parts: string[] = [];
  if (min !== undefined && max !== undefined) parts.push(`${min}-${max}${u}`);
  else if (min !== undefined) parts.push(`above ${min}${u}`);
  else if (max !== undefined) parts.push(`below ${max}${u}`);
  if (f.includeNondetects === false) parts.push('detections only');
  return parts.length ? ` (${parts.join(', ')})` : '';
}

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
  label: LABEL,
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
  describe(block, totals) {
    const conc = describeConcentration(block.sampleFilters);
    const subs = block.sampleFilters?.substances ?? [];
    const mats = block.sampleFilters?.materialTypes ?? [];
    const subLabels = block.sampleFilters?.substanceLabels ?? {};
    const subItems = subs.map((uri) => subLabels[uri] || extractLabel(uri));
    const matLabels = block.sampleFilters?.materialTypeLabels ?? {};
    // Prebuilt questions and older saves carry no label map.
    const matItems = mats.map(
      (uri) =>
        matLabels[uri] ||
        FALLBACK_MATERIAL_TYPES.find((m) => m.uri === uri)?.label ||
        extractLabel(uri),
    );

    const subAll =
      totals?.substances !== undefined &&
      totals.substances > 0 &&
      subItems.length === totals.substances;
    const matAll =
      totals?.materialTypes !== undefined &&
      totals.materialTypes > 0 &&
      matItems.length === totals.materialTypes;
    const subLong = subItems.length > LIST_THRESHOLD || subAll;
    const matLong = matItems.length > LIST_THRESHOLD || matAll;

    // Inline adjective form when both lists are short, which preserves today's phrasing.
    if (!subLong && !matLong) {
      const parts: string[] = [];
      if (subItems.length) parts.push(subItems.join('/'));
      if (matItems.length) parts.push(matItems.join('/'));
      return (parts.length ? `${parts.join(' ')} ${LABEL}` : LABEL) + conc;
    }

    // Postfix form for long/all selections: reads naturally.
    const clauses: string[] = [];
    if (subItems.length) {
      clauses.push(
        summarize(subItems, totals?.substances, 'substances', 'substance', '/', 'any'),
      );
    }
    if (matItems.length) {
      clauses.push(
        summarize(
          matItems,
          totals?.materialTypes,
          'material types',
          'material type',
          '/',
          'any',
        ),
      );
    }
    return (clauses.length ? `${LABEL} with ${clauses.join(' and ')}` : LABEL) + conc;
  },
};
