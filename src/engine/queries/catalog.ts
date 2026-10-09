// Every SPARQL query the app can send, in one list.
//
// Nothing here is a query. Each entry calls the same builders the app calls, so
// what it produces is exactly what the app would send. Four things read it:
//
//   catalog.test.ts            golden-file snapshot of every query, fails on any diff
//   docs/QUERIES.md            generated from it, so the doc cannot drift
//   catalog.live.test.ts       runs entries against the live endpoints
//   scripts/sparql-blast-radius.mts   names the entries a PR changed
//
// The analysis-question grid has four axes, and every one of them earned its
// place by hiding a bug that the others could not see:
//
//   entity pair (36)      one builder serves all of them, so a fix aimed at
//                         one pair rewrites the rest
//   relationship (3)      near and the two hydrology directions share
//                         buildFusedWhereBody
//   region placement (2)  which block carries the region decides which side is
//                         "constrained", which decides the join order. An
//                         earlier version of this grid put the region on block
//                         A always; for an upstream question that makes the
//                         anchor the constrained side, so the target-first
//                         order was never recorded, and neither was the
//                         question that broke in the app (block A wide open,
//                         block C scoped to a county).
//   flow-distance bound   the bounded trace is a different query, not a
//   (2, hydrology only)   filtered one: it seeds an aggregate. With one bounded
//                         variant in the grid, the fix that moved every bounded
//                         shape showed up as a single moved line.
//
// 6 x 6 x 3 x 2 = 216 unbounded, plus 6 x 6 x 2 x 2 = 144 bounded, plus the
// variants that reach clauses the grid does not vary.
import { planPipeline, type PipelineContext } from '../planner';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../../types/query';

export interface CatalogStep {
  type: string;
  endpoint: string;
  query: string;
}

export interface CatalogEntry {
  name: string;
  steps: CatalogStep[];
  question?: AnalysisQuestion;
}

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
// 'within' is in the type union but RelationshipSelector never offers it.
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];
const HYDROLOGY: SpatialRelationship['type'][] = ['downstream', 'upstream'];
// Which block carries the region. This is the axis that decides the join
// order, and it is not symmetric between the two relationship directions,
// because the planner maps block A to the anchor for an upstream question and
// to the target for a downstream one.
const REGION_ON = ['A', 'C'] as const;

// Fixed IRIs so pinValues output is deterministic. Two entries: enough to show
// the VALUES clause and its ordering, short enough to stay readable.
const context = (question: AnalysisQuestion): PipelineContext => ({
  question,
  targetIris: ['http://example.org/target/1', 'http://example.org/target/2'],
  anchorIris: ['http://example.org/anchor/1', 'http://example.org/anchor/2'],
  results: {},
});

export function analysisEntry(name: string, question: AnalysisQuestion): CatalogEntry {
  const ctx = context(question);
  return {
    name,
    question,
    steps: planPipeline(question).map((step) => ({ type: step.type, endpoint: step.endpoint, query: step.buildQuery(ctx) })),
  };
}

const shape = (
  a: EntityType,
  rel: SpatialRelationship['type'],
  c: EntityType,
  relExtra: Partial<SpatialRelationship> = {},
  regionOn: (typeof REGION_ON)[number] = 'A',
): AnalysisQuestion => {
  const region = { region: { stateCode: '23' } };
  return {
    blockA: { type: a, ...(regionOn === 'A' ? region : {}) },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}), ...relExtra },
    blockC: { type: c, ...(regionOn === 'C' ? region : {}) },
  } as AnalysisQuestion;
};

const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const YORK = { stateCode: '23', countyCodes: ['23031'] };

// The variants that reach clauses the grid does not vary: hop counts, the
// per-type filter blocks, and the exact questions that have broken in the app.
// A change to any of these is the class of change that crosses relationship
// boundaries.
const VARIANTS: Array<[string, AnalysisQuestion]> = [
  ['near hops=0', shape('samples', 'near', 'facilities', { hops: 0 })],
  ['near hops=2', shape('samples', 'near', 'facilities', { hops: 2 })],
  ['near hops=4', shape('samples', 'near', 'facilities', { hops: 4 })],
  ['downstream maxDistanceKm=10', shape('samples', 'downstream', 'facilities', { maxDistanceKm: 10 })],
  ['upstream maxDistanceKm=10', shape('samples', 'upstream', 'facilities', { maxDistanceKm: 10 })],
  // The question behind #55 and #57, in the two states it is asked in. Block A
  // carries nothing at all, which is what makes it the expensive shape: the
  // trace has to be seeded from block C or it starts from every facility in
  // the graph. Recorded bounded and unbounded because those are two different
  // queries, not one query with a filter.
  [
    'PI question: facilities upstream from PFOS samples in York, detections only',
    {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream' },
      blockC: { type: 'samples', region: YORK, sampleFilters: { substances: [PFOS], includeNondetects: false } },
    } as AnalysisQuestion,
  ],
  [
    'PI question, bounded to 30km of flow',
    {
      blockA: { type: 'facilities' },
      relationship: { type: 'upstream', maxDistanceKm: 30 },
      blockC: { type: 'samples', region: YORK, sampleFilters: { substances: [PFOS], includeNondetects: false } },
    } as AnalysisQuestion,
  ],
  // The two sample-filter shapes that decide whether the observation chain is
  // joined at all. Substance-only is the common case and is what the
  // coso:measurementUnit join silently filtered; non-detects-off is the only
  // filter that adds the result clauses without adding the unit join.
  [
    'samples substance filter only',
    {
      blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { substances: [PFOS] } },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion,
  ],
  [
    'samples include-nondetects off only',
    {
      blockA: { type: 'samples', region: { stateCode: '23' }, sampleFilters: { includeNondetects: false } },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    } as AnalysisQuestion,
  ],
  [
    'no region either side',
    { blockA: { type: 'samples' }, relationship: { type: 'downstream' }, blockC: { type: 'facilities' } } as AnalysisQuestion,
  ],
  [
    'county-scoped both sides',
    {
      blockA: { type: 'samples', region: { stateCode: '23', countyCodes: ['23019'] } },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities', region: { stateCode: '23', countyCodes: ['23005', '23019'] } },
    } as AnalysisQuestion,
  ],
  [
    'sample filters',
    {
      blockA: {
        type: 'samples',
        region: { stateCode: '23' },
        sampleFilters: {
          substances: ['http://sawgraph.spatialai.org/v1/pfas#PFHpA'],
          materialTypes: ['http://sawgraph.spatialai.org/v1/me-egad-data#Groundwater'],
          minConcentration: 4,
          maxConcentration: 100,
          unit: 'ng/L',
          includeNondetects: false,
        },
      },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
    } as AnalysisQuestion,
  ],
  [
    'facility + water body + well + aquifer filters',
    {
      blockA: { type: 'wells', region: { stateCode: '23' }, wellFilters: { wellCategories: ['meUse||http://example.org/use/Domestic'] } },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'aquifers', aquiferFilters: { aquiferTypes: ['bedrock'] } },
    } as AnalysisQuestion,
  ],
  [
    'stream ftype filter as target',
    {
      blockA: { type: 'samples', region: { stateCode: '23' } },
      relationship: { type: 'downstream' },
      blockC: { type: 'streams', streamFilters: { ftypes: ['460'] } },
    } as AnalysisQuestion,
  ],
];

// Every analysis-question shape, in snapshot order.
export function analysisEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  // 1. Every entity pair x relationship x region placement: 6 x 6 x 3 x 2 = 216.
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of RELATIONSHIPS) {
        for (const on of REGION_ON) out.push(analysisEntry(`${a} ${rel} ${c} [ME on ${on}]`, shape(a, rel, c, {}, on)));
      }
    }
  }
  // 2. The hydrology pairs again with a flow-distance bound: 6 x 6 x 2 x 2 = 144.
  // `near` has no flow bound; its distance axis is hops, covered in the variants.
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of HYDROLOGY) {
        for (const on of REGION_ON) {
          out.push(analysisEntry(`${a} ${rel}(30km) ${c} [ME on ${on}]`, shape(a, rel, c, { maxDistanceKm: 30 }, on)));
        }
      }
    }
  }
  // 3. The variants.
  for (const [name, question] of VARIANTS) out.push(analysisEntry(`VARIANT: ${name}`, question));
  return out;
}

export function catalog(): CatalogEntry[] {
  return analysisEntries();
}
