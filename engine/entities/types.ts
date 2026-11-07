import type { EndpointKey } from '../constants/endpoints';
import type { EntityBlock, EntityType } from '../types/query';
import type { QuestionTotals } from './wording';

// Everything the engine knows about one type of entity. The stages ask this
// instead of switching on the type, so adding a type is one new module.
export interface EntityModule {
  readonly type: EntityType;
  // The plural noun with no filters applied ("surface water bodies"), shared by
  // the step labels and the question sentence so they cannot drift apart.
  readonly label: string;
  // The trace result is this entity itself (streams): a trace needs no hop from
  // a flowline onto a cell, and the question needs no separate stream layer.
  // The flowline form of the trace (binding ?ds_flowline as the entity, with
  // streamFtypeFilter) is still written in templates/fusedQueries.ts.
  readonly isFlowline: boolean;
  // How the details step loads this type.
  readonly details: DetailsLoad;
  // The variable a fused query binds this entity to, e.g. `?facilityA`.
  iriVar(suffix: string): string;
  // Binds the entity inside the S2 cell `s2Var`, with the block's filters, and
  // only entities the map can draw.
  bindInCell(block: EntityBlock, s2Var: string, suffix: string): string;
  // Whether the bind can yield more than one row per entity and cell (a join
  // on a field with several values: a sample's measurements, a facility's
  // industry codes). Such a side is collapsed to one row per entity and cell
  // before it meets the other side (templates/fusedQueries.ts), so the join
  // multiplies entities, not their fields. Multi-valued fields are read only
  // by the details step.
  fansOut(block: EntityBlock): boolean;
  // Whether the block narrows this type at all.
  isFiltered(block: EntityBlock): boolean;
  // The block in words, filters included ("PFOS samples", "landfill
  // facilities"), for the question sentence. `totals` lets a selection of
  // every option read as "any".
  describe(block: EntityBlock, totals?: QuestionTotals): string;
  // A check that the entity itself, not only its cell, lies in the region.
  // Absent where the cell check is enough.
  regionCheck?(suffix: string, anyOf: (variable: string) => RegionMatch): string;
}

export type DetailsLoad =
  // Load the IRIs discovery found, in request-size chunks.
  | { kind: 'by-iri'; endpoint: EndpointKey; buildQuery(iris: string[], block: EntityBlock): string }
  // Re-derive the entity set server-side inside one federated query, sending no
  // IRI list. Such a step cannot be sliced by IRI. Wells are the only type, and
  // the planner builds their query (buildFusedWellQuery) itself, so a second
  // type here would need its own builder first. Wells move to by-IRI in Phase 2.
  | { kind: 'rederive'; endpoint: EndpointKey };

// A region match: a VALUES line when there are several regions (else empty),
// and the term to match against (a variable or the single region IRI).
export interface RegionMatch {
  values: string;
  region: string;
}

// "Any filter field set" across every filter slot the block carries, whatever
// its type. This is today's rule for every type but samples, kept as is in the
// move to modules; it reads a stale slot left by a type change as a filter, and
// fixing that changes which side a query starts from, so it is a Phase 1 fix.
export function anyFilterSlotSet(block: EntityBlock): boolean {
  const filters =
    block.facilityFilters ??
    block.waterBodyFilters ??
    block.wellFilters ??
    block.aquiferFilters ??
    block.streamFilters;
  return Boolean(
    filters && Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v != null)),
  );
}
