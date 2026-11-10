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
  // The slot of the block this type's filters live in.
  readonly filterSlot: FilterSlot;
  // Whether the block narrows this type at all, read from its own slot only.
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

// The region check for a type with subdivision links (GLOSSARY.md): the entity
// links to a county subdivision that rolls up to a selected region. An entity
// linked to several subdivisions (an aquifer polygon) passes when any one of
// them does.
//
// The region gets its own variable (`?_wellRegionC`), so the entity's region
// need not be the one its cell touches. Sharing ?_region lost 1 of 17,092
// wells in York, Cumberland and Androscoggin, 1 cell away (#96).
export function subdivisionRegionCheck(
  iriVar: (suffix: string) => string,
  name: string,
): NonNullable<EntityModule['regionCheck']> {
  return (suffix, anyOf) => {
    const match = anyOf(`?_${name}Region${suffix}`);
    const subdivision = `?_subdivision${suffix}`;
    return `${match.values}${iriVar(suffix)} spatial:connectedTo ${subdivision} .
      ${subdivision} kwg-ont:administrativePartOf+ ${match.region} .`;
  };
}

// The filter slot each type reads. Any other slot a block carries is a
// leftover (an older save, a published link) and reaches no query.
export type FilterSlot =
  | 'sampleFilters'
  | 'facilityFilters'
  | 'waterBodyFilters'
  | 'wellFilters'
  | 'aquiferFilters'
  | 'streamFilters';

// Whether any of `fields` is set in the block's own slot. Only fields a query
// reads count: a label map (industryLabels, wellCategoryLabels) is display text,
// and one left after its codes were cleared used to read as a filter. The old
// rule also read the first slot it found whatever the type, so a leftover slot
// decided which side a trace started from (engine/tests/filterSlots.test.ts).
export function ownFilterSet(slot: FilterSlot, fields: string[]): (block: EntityBlock) => boolean {
  return (block) => {
    const filters = block[slot] as Record<string, unknown> | undefined;
    return fields.some((field) => {
      const value = filters?.[field];
      return Array.isArray(value) ? value.length > 0 : value != null;
    });
  };
}
