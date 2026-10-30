// One entry per control in the question editor, for engine/tests/questionText.test.ts.
//
// Every filter here narrows the SPARQL, so the Analysis Question sentence has
// to say so, on whichever block it is set. Block A and Block C render through
// the same EntityBlock editor, so each block filter is checked on both sides.
//
// The ceiling: this list is written by hand. A new filter or relationship
// option added to the editor is not covered until a line is added here.
import type { EntityBlock, EntityType, SpatialRelationship } from '../../types/query';

export interface BlockFilterCase {
  name: string;
  type: EntityType;
  // Merged onto `{ type }` to get the filtered block.
  filter: Omit<EntityBlock, 'type'>;
}

export interface RelationshipCase {
  name: string;
  from: SpatialRelationship;
  to: SpatialRelationship;
}

const PFOA = 'http://w3id.org/DSSTox/v1/DTXSID8031865';
const GW = 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.GW';
const BEDROCK = 'meType||http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellType.Bedrock';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];

// Region applies to every entity type.
const REGION_CASES: BlockFilterCase[] = ENTITY_TYPES.flatMap((type) => [
  { name: `${type}: state`, type, filter: { region: { stateCode: '23' } } },
  {
    name: `${type}: county`,
    type,
    filter: { region: { stateCode: '23', countyCodes: ['23031'], countyLabels: { '23031': 'York County' } } },
  },
]);

export const BLOCK_FILTERS: BlockFilterCase[] = [
  ...REGION_CASES,
  { name: 'samples: substance', type: 'samples', filter: { sampleFilters: { substances: [PFOA], substanceLabels: { [PFOA]: 'PFOA' } } } },
  { name: 'samples: material with label', type: 'samples', filter: { sampleFilters: { materialTypes: [GW], materialTypeLabels: { [GW]: 'Groundwater (GW)' } } } },
  // Prebuilt questions and older saves carry no label map.
  { name: 'samples: material without label', type: 'samples', filter: { sampleFilters: { materialTypes: [GW] } } },
  { name: 'samples: min concentration', type: 'samples', filter: { sampleFilters: { minConcentration: 4 } } },
  { name: 'samples: max concentration', type: 'samples', filter: { sampleFilters: { maxConcentration: 70 } } },
  { name: 'samples: concentration range', type: 'samples', filter: { sampleFilters: { minConcentration: 10, maxConcentration: 1000 } } },
  { name: 'samples: exclude non-detects', type: 'samples', filter: { sampleFilters: { includeNondetects: false } } },
  {
    name: 'samples: range and exclude non-detects',
    type: 'samples',
    filter: { sampleFilters: { minConcentration: 4, includeNondetects: false } },
  },
  { name: 'facilities: industry', type: 'facilities', filter: { facilityFilters: { industryCodes: ['562212'], industryLabels: { '562212': 'Solid Waste Landfill' } } } },
  { name: 'waterBodies: water type', type: 'waterBodies', filter: { waterBodyFilters: { ftypes: ['LakePond'] } } },
  { name: 'waterBodies: two water types', type: 'waterBodies', filter: { waterBodyFilters: { ftypes: ['LakePond', 'Reservoir'] } } },
  { name: 'streams: stream type', type: 'streams', filter: { streamFilters: { ftypes: ['StreamRiver'] } } },
  { name: 'wells: classification with label', type: 'wells', filter: { wellFilters: { wellCategories: [BEDROCK], wellCategoryLabels: { [BEDROCK]: 'Bedrock' } } } },
  { name: 'wells: classification without label', type: 'wells', filter: { wellFilters: { wellCategories: [BEDROCK] } } },
  { name: 'aquifers: bedrock', type: 'aquifers', filter: { aquiferFilters: { aquiferTypes: ['bedrock'] } } },
  { name: 'aquifers: surficial', type: 'aquifers', filter: { aquiferFilters: { aquiferTypes: ['surficial'] } } },
];

// Settings the query ignores, so the sentence must ignore them too.
export const NO_OP_FILTERS: BlockFilterCase[] = [
  { name: 'samples: include non-detects (the default)', type: 'samples', filter: { sampleFilters: { includeNondetects: true } } },
  { name: 'samples: empty substance list', type: 'samples', filter: { sampleFilters: { substances: [] } } },
  { name: 'wells: empty classification list', type: 'wells', filter: { wellFilters: { wellCategories: [] } } },
];

// Every option RelationshipSelector offers, as a change from a neighbour.
export const RELATIONSHIPS: RelationshipCase[] = [
  { name: 'near 0 -> 1 mile', from: { type: 'near', hops: 0 }, to: { type: 'near', hops: 1 } },
  { name: 'near 1 -> 2 miles', from: { type: 'near', hops: 1 }, to: { type: 'near', hops: 2 } },
  { name: 'near 2 -> 3 miles', from: { type: 'near', hops: 2 }, to: { type: 'near', hops: 3 } },
  { name: 'near 3 -> 4 miles', from: { type: 'near', hops: 3 }, to: { type: 'near', hops: 4 } },
  { name: 'near -> downstream', from: { type: 'near', hops: 1 }, to: { type: 'downstream' } },
  { name: 'near -> upstream', from: { type: 'near', hops: 1 }, to: { type: 'upstream' } },
  { name: 'downstream -> upstream', from: { type: 'downstream' }, to: { type: 'upstream' } },
  ...[5, 10, 30, 50, 100].flatMap((km): RelationshipCase[] => [
    { name: `downstream any -> ${km} km`, from: { type: 'downstream' }, to: { type: 'downstream', maxDistanceKm: km } },
    { name: `upstream any -> ${km} km`, from: { type: 'upstream' }, to: { type: 'upstream', maxDistanceKm: km } },
  ]),
];

// Leftovers from switching the relationship dropdown, which the query ignores.
export const NO_OP_RELATIONSHIPS: RelationshipCase[] = [
  { name: 'downstream with leftover hops', from: { type: 'downstream' }, to: { type: 'downstream', hops: 3 } },
  { name: 'upstream with leftover hops', from: { type: 'upstream' }, to: { type: 'upstream', hops: 3 } },
  { name: 'near with leftover distance', from: { type: 'near', hops: 1 }, to: { type: 'near', hops: 1, maxDistanceKm: 30 } },
];
