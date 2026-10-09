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
import { LOOKUPS, type Lookup } from '../lookupQueries';
import { buildEntityProbeQuery } from '../templates/fusedQueries';
import { PREFIXES } from '../../constants/prefixes';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import type { AnalysisQuestion, EntityType, SpatialRelationship } from '../../types/query';

export interface CatalogStep {
  type: string;
  endpoint: string;
  query: string;
  // What the step is called in the app's progress strip, for pipeline steps.
  description?: string;
}

export interface CatalogEntry {
  name: string;
  steps: CatalogStep[];
  question?: AnalysisQuestion;
  // Where the app sends it from, for entries outside a question's pipeline.
  usedBy?: string;
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
    steps: planPipeline(question).map((step) => ({
      type: step.type,
      endpoint: step.endpoint,
      query: step.buildQuery(ctx),
      description: step.description,
    })),
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

const ME = { stateCode: '23' };
const ME_COUNTIES = { stateCode: '23', countyCodes: ['23005', '23019'] };
const step = (type: string, { endpoint, query }: Lookup): CatalogStep => ({ type, endpoint, query });
const DISCOVERY_HOOKS = 'src/hooks/useDiscoveryQueries.ts';

// Everything outside a question's pipeline. Each region-aware dropdown is
// recorded three ways because the region decides both the endpoint and the
// shape of the region join: none, a state, and counties.
export function lookupEntries(): CatalogEntry[] {
  const regional = (label: string, hook: string, key: 'substances' | 'materialTypes'): CatalogEntry[] => [
    { name: `DROPDOWN: ${label}, no region`, usedBy: `${hook} in ${DISCOVERY_HOOKS}`, steps: [step(key, LOOKUPS[key]())] },
    { name: `DROPDOWN: ${label}, state`, usedBy: `${hook} in ${DISCOVERY_HOOKS}`, steps: [step(key, LOOKUPS[key](ME))] },
    { name: `DROPDOWN: ${label}, counties`, usedBy: `${hook} in ${DISCOVERY_HOOKS}`, steps: [step(key, LOOKUPS[key](ME_COUNTIES))] },
  ];
  const popupUsedBy = 'useSampleDetails in src/hooks/useSampleDetails.ts, when a sample popup opens';
  const samplePoint = 'http://example.org/samplepoint/1';
  return [
    { name: 'DROPDOWN: Industry', usedBy: `useIndustries in ${DISCOVERY_HOOKS}`, steps: [step('industries', LOOKUPS.industries())] },
    {
      name: 'DROPDOWN: Industry counts, state',
      usedBy: `useIndustryCounts in ${DISCOVERY_HOOKS}`,
      steps: [step('industryCounts', LOOKUPS.industryCounts(ME))],
    },
    {
      name: 'DROPDOWN: Industry counts, counties',
      usedBy: `useIndustryCounts in ${DISCOVERY_HOOKS}`,
      steps: [step('industryCounts', LOOKUPS.industryCounts(ME_COUNTIES))],
    },
    ...regional('Substance', 'useSubstances', 'substances'),
    ...regional('Material', 'useMaterialTypes', 'materialTypes'),
    {
      name: 'DROPDOWN: County',
      usedBy: `useCounties in ${DISCOVERY_HOOKS}, and expandToCounties in src/engine/scope.ts`,
      steps: [step('counties', LOOKUPS.counties('23'))],
    },
    {
      name: 'DROPDOWN: Well classification',
      usedBy: `useWellClassifications in ${DISCOVERY_HOOKS}, three queries run together`,
      steps: [
        step('illinoisWellPurposes', LOOKUPS.illinoisWellPurposes()),
        step('maineWellTypes', LOOKUPS.maineWellTypes()),
        step('maineWellUses', LOOKUPS.maineWellUses()),
      ],
    },
    { name: 'POPUP: Sample point', usedBy: popupUsedBy, steps: [step('sampleDetails', LOOKUPS.sampleDetails(samplePoint))] },
    {
      name: 'POPUP: Sample point, with sample filters',
      usedBy: popupUsedBy,
      steps: [
        step(
          'sampleDetails',
          LOOKUPS.sampleDetails(samplePoint, {
            substances: ['http://w3id.org/DSSTox/v1/DTXSID3031864'],
            includeNondetects: false,
          }),
        ),
      ],
    },
    // The probe counts one side of a question that was too big to run whole,
    // to decide how to slice it. It runs on the failing step's endpoint, which
    // is federation for every discovery step; 201 is PROBE_LIMIT in scope.ts.
    ...ENTITY_TYPES.map((type) => ({
      name: `PROBE: ${type}`,
      usedBy: 'chooseAxis in src/engine/scope.ts, after a step times out',
      steps: [{ type: 'probe', endpoint: 'federation', query: buildEntityProbeQuery({ type }, ['23'], 201) }],
    })),
  ];
}

// The dashboard questions, exactly as the landing page runs them. Each one also
// gets a generated page in docs/queries/.
export function prebuiltEntries(): CatalogEntry[] {
  return PREBUILT_QUERIES.map((p) => analysisEntry(`PREBUILT: ${p.id}`, p.question));
}

// Oldest sections first and new ones appended, so adding a section never moves
// the snapshot's existing lines.
export function catalog(): CatalogEntry[] {
  return [...analysisEntries(), ...lookupEntries(), ...prebuiltEntries()];
}

// A query as a person reads it: the shared PREFIX block taken out (it is the
// same in every query and printed once in docs/QUERIES.md), indentation made
// consistent, runs of blank lines collapsed.
export function pretty(query: string): string {
  const lines = query.replace(PREFIXES, '').split('\n').map((l) => l.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return lines
    .map((l) => l.slice(indent))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
