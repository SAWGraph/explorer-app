// Self-check for the two rules in
// docs/plans/done/2026-09-17-fused-seed-side-and-observation-joins.md.
//
//   npx tsx scripts/check-query-joins.mts
//
// 1. Join order. QLever follows the query text at these body sizes, so the
//    constrained side of a hydrology question has to be written first. Leading
//    with an unfiltered side is what made "facilities upstream from PFOS
//    samples in York and Cumberland" fail with 500 out-of-memory.
//
// 2. Observation joins. Every required triple is also a filter. A samples block
//    may only join the observation detail its active filters actually read: the
//    coso:measurementUnit join in particular deletes non-detects, which have no
//    unit, and it was being emitted for substance-only questions that had
//    "include non-detects" ticked.
//
// No network: these only build query strings.
import assert from 'node:assert/strict';
import { planPipeline } from '../src/engine/planner';
import { buildFusedHydrologyQuery, buildFusedNearQuery } from '../src/engine/templates/fusedQueries';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import type { AnalysisQuestion, EntityBlock, EntityType, SampleFilters } from '../src/types/query';

const ENTITY_TYPES: EntityType[] = [
  'samples',
  'facilities',
  'waterBodies',
  'wells',
  'aquifers',
  'streams',
];
const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const GROUNDWATER = 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.GW';

let checks = 0;
const check = (cond: boolean, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

// Which side the body leads with. The first variable after WHERE { decides the
// plan; anything else in the body can follow.
function leadsWith(query: string): 'anchor' | 'target' | 'other' {
  const body = query.slice(query.indexOf('WHERE {') + 'WHERE {'.length).trimStart();
  if (body.startsWith('?s2target') || body.startsWith('?ds_flowline')) return 'target';
  if (body.startsWith('?s2anchor')) return 'anchor';
  // A pinned side leads with its VALUES block, so neither branch above matches.
  // That is the 'other' case and the pinned assertions below allow for it.
  return 'other';
}

// Which end the distance-bounded aggregate walks outward from, read off the
// innermost sub-SELECT that boundedTrace wraps its seed in. Unbounded queries
// have no such block and report 'none'.
function seedsFrom(query: string): 'anchor' | 'target' | 'none' {
  if (query.includes('SELECT DISTINCT ?upstream_flowline WHERE {')) return 'anchor';
  if (query.includes('SELECT DISTINCT ?ds_flowline WHERE {')) return 'target';
  return 'none';
}

const filtersFor = (type: EntityType): Partial<EntityBlock> => {
  switch (type) {
    case 'samples':
      return { sampleFilters: { substances: [PFOS], includeNondetects: true } };
    case 'facilities':
      return { facilityFilters: { industryCodes: ['5622'] } };
    case 'waterBodies':
      return { waterBodyFilters: { ftypes: ['StreamRiver'] } };
    case 'streams':
      return { streamFilters: { ftypes: ['StreamRiver'] } };
    case 'aquifers':
      return { aquiferFilters: { aquiferTypes: ['bedrock'] } };
    case 'wells':
      return {};
  }
};

// --- 1. Join order, every hydrology pair, both projections.
for (const targetType of ENTITY_TYPES) {
  for (const anchorType of ENTITY_TYPES) {
    for (const project of ['target', 'anchor'] as const) {
      const scopedTarget = buildFusedHydrologyQuery({
        anchor: { type: anchorType },
        target: { type: targetType, ...filtersFor(targetType) },
        targetRegion: ['23005'],
        project,
        direction: 'downstream',
      });
      check(
        leadsWith(scopedTarget) === 'target',
        `${targetType} <- ${anchorType} (project ${project}): target is the only constrained side, so it must lead the body`,
      );

      const scopedAnchor = buildFusedHydrologyQuery({
        anchor: { type: anchorType, ...filtersFor(anchorType) },
        target: { type: targetType },
        anchorRegion: ['23005'],
        project,
        direction: 'downstream',
      });
      check(
        leadsWith(scopedAnchor) === 'anchor',
        `${targetType} <- ${anchorType} (project ${project}): anchor is the constrained side, so the body must keep the anchor-first order`,
      );

      // An IRI pin from chunking counts as constrained: re-seeding from the
      // other side would throw the slice away.
      const pinned = buildFusedHydrologyQuery({
        anchor: { type: anchorType },
        target: { type: targetType, ...filtersFor(targetType) },
        targetRegion: ['23005'],
        anchorIris: ['http://example.org/facility/1'],
        project,
        direction: 'downstream',
      });
      check(
        leadsWith(pinned) !== 'target',
        `${targetType} <- ${anchorType} (project ${project}): an anchorIris pin must keep the anchor-first order`,
      );
    }
  }
}

// Distance-bounded traces follow the same rule, and lean on it harder: the
// bounded block embeds its seed inside an aggregate that sums path lengths, so
// seeding the wide-open side sums them across the national flowline graph.
// Every bounded shape whose constrained side was the target failed before the
// reorder covered them — 30s query-planning timeouts and 4.3 GB allocation
// failures, recorded in docs/query-matrix/2026-09-20-raw-002e529.csv.
//
// Both halves are checked. A query can read target-first while the aggregate
// inside still starts from the anchor, which would move the text and leave the
// cost exactly where it was.
for (const targetType of ENTITY_TYPES) {
  for (const maxDistanceKm of [30, 50]) {
    const targetScoped = buildFusedHydrologyQuery({
      anchor: { type: 'facilities' },
      target: { type: targetType, ...filtersFor(targetType) },
      targetRegion: ['23005'],
      project: 'target',
      direction: 'downstream',
      maxDistanceKm,
    });
    check(
      leadsWith(targetScoped) === 'target',
      `${targetType} <- facilities, bounded ${maxDistanceKm}km: target is the only constrained side, so it must lead the body`,
    );
    check(
      seedsFrom(targetScoped) === 'target',
      `${targetType} <- facilities, bounded ${maxDistanceKm}km: the bounded aggregate must seed from the target too`,
    );

    const anchorScoped = buildFusedHydrologyQuery({
      anchor: { type: 'facilities', ...filtersFor('facilities') },
      target: { type: targetType },
      anchorRegion: ['23005'],
      project: 'target',
      direction: 'downstream',
      maxDistanceKm,
    });
    check(
      leadsWith(anchorScoped) === 'anchor',
      `${targetType} <- facilities, bounded ${maxDistanceKm}km: anchor is the constrained side, so the body must keep the anchor-first order`,
    );
    check(
      seedsFrom(anchorScoped) === 'anchor',
      `${targetType} <- facilities, bounded ${maxDistanceKm}km: the bounded aggregate must seed from the anchor`,
    );
  }
}

// --- 2. Observation joins, driven by the filters that are actually set.
const UNIT_JOIN = 'coso:measurementUnit';
const OBS_JOIN = 'coso:observedAtSamplePoint';
const MATERIAL_JOIN = 'coso:sampleOfMaterialType';
const MATERIAL_LABEL = '?matTypeLabelC';

interface JoinCase {
  name: string;
  filters: SampleFilters | undefined;
  unit: boolean;
  observation: boolean;
  material: boolean;
}

const joinCases: JoinCase[] = [
  { name: 'no filters', filters: undefined, unit: false, observation: false, material: false },
  {
    name: 'substance only',
    filters: { substances: [PFOS], includeNondetects: true },
    unit: false,
    observation: true,
    material: false,
  },
  {
    name: 'material only',
    filters: { materialTypes: [GROUNDWATER] },
    unit: false,
    observation: true,
    material: true,
  },
  {
    name: 'concentration range',
    filters: { substances: [PFOS], minConcentration: 10, maxConcentration: 1000 },
    unit: true,
    observation: true,
    material: false,
  },
  {
    name: 'detects only',
    filters: { substances: [PFOS], includeNondetects: false },
    unit: false,
    observation: true,
    material: false,
  },
];

for (const c of joinCases) {
  const queries = [
    ['hydrology', buildFusedHydrologyQuery({
      anchor: { type: 'facilities', facilityFilters: { industryCodes: ['5622'] } },
      target: { type: 'samples', sampleFilters: c.filters },
      anchorRegion: ['23005'],
      project: 'target',
      direction: 'downstream',
    })],
    ['near', buildFusedNearQuery({
      anchor: { type: 'facilities', facilityFilters: { industryCodes: ['5622'] } },
      target: { type: 'samples', sampleFilters: c.filters },
      hops: 1,
      project: 'anchor',
    })],
  ] as const;

  for (const [kind, query] of queries) {
    check(
      query.includes(UNIT_JOIN) === c.unit,
      `${kind}, ${c.name}: the unit join must appear only for a concentration range (it deletes non-detects)`,
    );
    check(
      query.includes(OBS_JOIN) === c.observation,
      `${kind}, ${c.name}: the observation join must appear only when a filter reads it`,
    );
    check(
      query.includes(MATERIAL_JOIN) === c.material,
      `${kind}, ${c.name}: the material join must appear only when material types are picked`,
    );
    check(
      !query.includes(MATERIAL_LABEL),
      `${kind}, ${c.name}: the material label is display-only and must never appear in an IRI-finding query`,
    );
  }
}

// --- 2b. Narrowness is a ranking, not a boolean. A region beats a bare entity
// filter, because a filter with no region is selective in kind and unbounded in
// extent: "all sewage treatment facilities" is a nationwide set. Getting this
// wrong is not a slow query, it is no query at all. Adding an industry filter
// to block A of "facilities upstream from PFOS samples in York" used to turn a
// 3s answer into a 30s timeout in query planning, because the filter alone
// counted as constrained and switched the reorder off.
for (const targetType of ENTITY_TYPES) {
  for (const maxDistanceKm of [undefined, 30]) {
    const base = { project: 'target' as const, direction: 'downstream' as const, ...(maxDistanceKm ? { maxDistanceKm } : {}) };
    const label = `${targetType} <- facilities${maxDistanceKm ? `, bounded ${maxDistanceKm}km` : ''}`;

    // Anchor filtered but unscoped, target scoped: the region wins.
    const filteredAnchor = buildFusedHydrologyQuery({
      ...base,
      anchor: { type: 'facilities', ...filtersFor('facilities') },
      target: { type: targetType, ...filtersFor(targetType) },
      targetRegion: ['23005'],
    });
    check(
      leadsWith(filteredAnchor) === 'target',
      `${label}: a bare industry filter must not outrank a region, or the seed is nationwide`,
    );
    if (maxDistanceKm) {
      check(
        seedsFrom(filteredAnchor) === 'target',
        `${label}: the bounded aggregate must seed from the region-scoped side`,
      );
    }

    // The mirror: anchor scoped, target only filtered. The anchor keeps it.
    const filteredTarget = buildFusedHydrologyQuery({
      ...base,
      anchor: { type: 'facilities' },
      target: { type: targetType, ...filtersFor(targetType) },
      anchorRegion: ['23005'],
    });
    check(
      leadsWith(filteredTarget) === 'anchor',
      `${label}: a region on the anchor outranks a bare filter on the target`,
    );
  }
}

// --- 3. The prebuilt dashboard questions lead with their narrower side.
//
// This used to assert that no prebuilt reorders, on the grounds that every one
// of them has a constrained anchor. That was a description of the old boolean
// predicate rather than a rule, and it stopped being true when "constrained"
// became a ranking: an industry filter with no region is constrained but not
// narrow. One prebuilt legitimately reorders under the ranking.
//
// `samples-downstream-waste-indiana` has samples scoped to Indiana on block A
// and NAICS 5622 with no region on block C, so the anchor is every waste
// treatment facility in the country and the target is one state. Both orders
// were measured on the live endpoint: identical answers, 136 samples and 415
// facilities either way, with the reordered form no slower (13s and 2s against
// 16s and 3s). It reorders because the rule says the state-scoped side is the
// narrower one, and the measurement agrees.
const EXPECTED_REORDER = new Set(['samples-downstream-waste-indiana']);

for (const prebuilt of PREBUILT_QUERIES) {
  const question: AnalysisQuestion = prebuilt.question;
  if (question.relationship.type === 'near') continue;
  const step = planPipeline(question)[0];
  const query = step.buildQuery(
    { question, targetIris: [], anchorIris: [], results: {} } as never,
    undefined,
  );
  const expected = EXPECTED_REORDER.has(prebuilt.id) ? 'target' : 'anchor';
  check(
    leadsWith(query) === expected,
    `${prebuilt.id}: expected the body to lead with the ${expected}, the narrower of its two sides`,
  );
}

console.log(`query joins: ${checks} checks passed`);
