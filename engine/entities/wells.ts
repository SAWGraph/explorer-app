import { buildWellCategoryFilter } from '../templates/wells';
import { anyFilterSlotSet, type EntityModule } from './types';
import { extractLabel, summarize } from './wording';

const LABEL = 'wells';

const iriVar = (suffix: string): string => `?well${suffix}`;

export const wells: EntityModule = {
  type: 'wells',
  label: LABEL,
  isFlowline: false,
  // Wells re-derive their set server-side (buildFusedWellQuery): a statewide
  // set runs to 80k+ IRIs, and inlining them made the request too big (413).
  details: { kind: 'rederive', endpoint: 'federation' },
  iriVar,
  bindInCell(block, s2Var, suffix) {
    const typeFilter = buildWellCategoryFilter(block.wellFilters?.wellCategories, `?well${suffix}`);
    return `${s2Var} spatial:connectedTo ?well${suffix} .
      ${typeFilter}`;
  },
  // One row per entity and cell already (measured in Maine, 2026-11-06).
  fansOut: () => false,
  isFiltered: anyFilterSlotSet,
  describe(block) {
    const tokens = block.wellFilters?.wellCategories ?? [];
    if (!tokens.length) return LABEL;
    // A token ends in its category IRI, whose last segment ("Drilled") is
    // the fallback when the save predates stored labels.
    const labels = block.wellFilters?.wellCategoryLabels ?? {};
    const items = tokens.map((t) => labels[t] || extractLabel(t));
    return `${summarize(items, undefined, 'well types', 'well type', ', ', 'any')} ${LABEL}`;
  },
  // A cell that crosses the county line touches the county, so the cell check
  // alone lets in wells from the next county (35 of 2,264 for Hancock, #96).
  // Wells link to the county subdivision they sit in, which rolls up to county
  // and state. The cell check stays too, because it narrows first.
  //
  // Its own variable, so the well's region need not be the one its cell
  // touches. Sharing ?_region lost 1 of 17,092 wells in York, Cumberland and
  // Androscoggin, 1 cell away.
  regionCheck(suffix, anyOf) {
    const well = anyOf(`?_wellRegion${suffix}`);
    const subdivision = `?_subdivision${suffix}`;
    return `${well.values}${iriVar(suffix)} spatial:connectedTo ${subdivision} .
      ${subdivision} kwg-ont:administrativePartOf+ ${well.region} .`;
  },
};
