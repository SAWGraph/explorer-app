// Groundwater-connected questions (#121, GLOSSARY.md): two point-type sides
// that sit on the same aquifer. The rules here are silent when wrong: a side
// tested more loosely than the other gives a different answer when the user
// swaps the blocks, a query without the regional-aquifer limit links half of
// Illinois (one sample on BR0001 linked 240,038 wells), and a wells-to-wells
// question without the self filter matches every well with itself.
//
// Inputs are every point-type pair on purpose: the planner keeps near's roles
// for this kind (anchor = block C), and a same-type pair is the only place the
// self filter shows.
//
// No network: planPipeline only builds query strings.
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { planPipeline, type PipelineContext, type PipelineStep } from '../planner';
import { entityFor } from '../entities';
import { GROUNDWATER_TYPES } from '../question';
import type { AnalysisQuestion, EntityType } from '../types/query';

const NON_POINT: EntityType[] = ['waterBodies', 'streams', 'aquifers'];

const question = (a: EntityType, c: EntityType, withRegion = true): AnalysisQuestion => ({
  blockA: withRegion ? { type: a, region: { stateCode: '23' } } : { type: a },
  relationship: { type: 'groundwaterConnected' },
  blockC: { type: c, region: { stateCode: '23', countyCodes: ['23011'] } },
});

const context = (q: AnalysisQuestion): PipelineContext => ({
  question: q,
  targetIris: ['http://example.org/t/1'],
  anchorIris: ['http://example.org/a/1'],
  results: {},
});

// Every point-type pair, both ways round.
const pairs = GROUNDWATER_TYPES.flatMap((a) => GROUNDWATER_TYPES.map((c) => [a, c] as const));

// The steps whose query joins the two sides through an aquifer.
const JOINING = new Set([
  'FIND_TARGET_IRIS',
  'FIND_ANCHOR_IRIS',
  'GET_LINK_AQUIFERS',
  'GET_SKIPPED_AQUIFERS',
  'HYDRATE_TARGET_BY_IRI',
  'HYDRATE_ANCHOR_BY_IRI',
  'GET_SAMPLE_DETAILS',
]);

function joiningQueries(q: AnalysisQuestion): { step: PipelineStep; query: string }[] {
  return planPipeline(q)
    .filter((step) => JOINING.has(step.type))
    .map((step) => ({ step, query: step.buildQuery(context(q), undefined) }))
    // A by-IRI details step that loads its own columns does not join; only
    // the queries that name the link aquifer are in scope.
    .filter(({ query }) => query.includes('?_linkAquifer'));
}

describe('groundwater-connected plans', () => {
  it('plans the link and regional steps for every point-type pair, and no stream lines', () => {
    let plans = 0;
    for (const [a, c] of pairs) {
      for (const withRegion of [true, false]) {
        const where = `${a} groundwaterConnected ${c}${withRegion ? ' [ME]' : ''}`;
        const steps = planPipeline(question(a, c, withRegion));
        const types = steps.map((s) => s.type);
        plans++;

        assert.deepEqual(
          types,
          [
            'COUNT_TARGET',
            'COUNT_ANCHOR',
            'FIND_TARGET_IRIS',
            'FIND_ANCHOR_IRIS',
            'GET_LINK_AQUIFERS',
            'GET_SKIPPED_AQUIFERS',
            ...types.filter((t) => t.startsWith('HYDRATE_') || t === 'GET_SAMPLE_DETAILS'),
            // Block C always has a region here, so the boundaries always load.
            'GET_REGION_BOUNDARIES',
          ],
          where,
        );

        // Both are decoration: the link outlines drop on failure, the regional
        // check drops without a word (it only feeds a note).
        const link = steps.find((s) => s.type === 'GET_LINK_AQUIFERS')!;
        const skipped = steps.find((s) => s.type === 'GET_SKIPPED_AQUIFERS')!;
        assert.equal(link.optional, true, where);
        assert.equal(skipped.advisory, true, where);
        assert.deepEqual(link.after, ['FIND_ANCHOR_IRIS'], where);
        assert.deepEqual(skipped.after, ['FIND_ANCHOR_IRIS'], where);
        assert.equal(link.endpoint, 'federation', where);
        assert.equal(skipped.endpoint, 'federation', where);

        // Near's roles: the target step returns block A.
        const aLabel = entityFor(a).label;
        const cLabel = entityFor(c).label;
        assert.equal(
          steps.find((s) => s.type === 'FIND_TARGET_IRIS')!.description,
          `Finding ${aLabel} groundwater-connected to ${cLabel}`,
          where,
        );
        assert.equal(
          steps.find((s) => s.type === 'FIND_ANCHOR_IRIS')!.description,
          `Finding ${cLabel} with ${aLabel} groundwater-connected to them`,
          where,
        );
      }
    }
    assert.equal(plans, 18);
  });

  it('refuses a block that is not a point type, on either side', () => {
    let refused = 0;
    for (const other of NON_POINT) {
      for (const [a, c] of [
        [other, 'samples'],
        ['wells', other],
      ] as const) {
        assert.throws(
          () => planPipeline(question(a, c)),
          new RegExp(`samples, facilities and wells only, not ${entityFor(other).label}`),
          `${a} groundwaterConnected ${c}`,
        );
        refused++;
      }
    }
    assert.equal(refused, 6);
  });
});

describe('groundwater-connected queries', () => {
  it('tests both sides the same way: each cell joins the link aquifer directly', () => {
    let checked = 0;
    for (const [a, c] of pairs) {
      for (const { step, query } of joiningQueries(question(a, c))) {
        const where = `${a} groundwaterConnected ${c}, ${step.type}`;
        checked++;
        // One direct join per side, no ring of neighbouring cells on either.
        assert.equal(query.split('?s2anchor spatial:connectedTo ?_linkAquifer .').length - 1, 1, `anchor join: ${where}`);
        assert.equal(query.split('?s2target spatial:connectedTo ?_linkAquifer .').length - 1, 1, `target join: ${where}`);
        assert.ok(!query.includes('sfTouches'), `a side widened by a neighbour ring: ${where}`);
        assert.ok(!query.includes('owl:sameAs'), `a side widened by a neighbour ring: ${where}`);
      }
    }
    // Two discovery steps, the link and regional steps, and at least one
    // re-derived details step (wells) somewhere.
    assert.ok(checked >= pairs.length * 4, `checked only ${checked} queries`);
  });

  it('keeps the same join when the blocks are swapped', () => {
    // Swapping the blocks swaps which side carries which suffix, so compare
    // the join lines with the entity variables taken out.
    const join = (query: string) =>
      query
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('_linkAquifer') || l.includes('_aquiferCell'))
        .join('\n');
    let swaps = 0;
    for (const [a, c] of pairs) {
      swaps++;
      const forward = planPipeline(question(a, c, false)).find((s) => s.type === 'FIND_TARGET_IRIS')!;
      const swapped = planPipeline(question(c, a, false)).find((s) => s.type === 'FIND_TARGET_IRIS')!;
      const f = forward.buildQuery(context(question(a, c, false)), undefined);
      const s = swapped.buildQuery(context(question(c, a, false)), undefined);
      assert.ok(join(f).includes('?_linkAquifer'), `no aquifer join to compare: ${a} <-> ${c}`);
      assert.equal(join(f), join(s), `${a} <-> ${c}`);
    }
    assert.equal(swaps, 9);
  });

  it('never links through a regional aquifer, except in the check that lists them', () => {
    const under = 'HAVING (COUNT(?_aquiferCell) <= 1000)';
    const over = 'HAVING (COUNT(?_aquiferCell) > 1000)';
    let checked = 0;
    for (const [a, c] of pairs) {
      for (const { step, query } of joiningQueries(question(a, c))) {
        const where = `${a} groundwaterConnected ${c}, ${step.type}`;
        checked++;
        if (step.type === 'GET_SKIPPED_AQUIFERS') {
          assert.ok(query.includes(over) && !query.includes(under), `regional check keeps the wrong aquifers: ${where}`);
        } else {
          assert.equal(query.split(under).length - 1, 1, `size limit missing or repeated: ${where}`);
          assert.ok(!query.includes(over), where);
        }
      }
    }
    assert.ok(checked >= pairs.length * 4, `checked only ${checked} queries`);
  });

  it('drops an entity matched with itself, only when both sides are the same type', () => {
    let checked = 0;
    let filtered = 0;
    for (const [a, c] of pairs) {
      for (const { step, query } of joiningQueries(question(a, c))) {
        checked++;
        const where = `${a} groundwaterConnected ${c}, ${step.type}`;
        const anchorVar = entityFor(c).iriVar('A');
        const targetVar = entityFor(a).iriVar('C');
        const self = `FILTER(${anchorVar} != ${targetVar})`;
        assert.equal(query.includes(self), a === c, `self filter ${a === c ? 'missing' : 'present'}: ${where}`);
        if (a === c) filtered++;
      }
    }
    assert.ok(checked >= pairs.length * 4, `checked only ${checked} queries`);
    // Three same-type pairs, each with at least four joining queries.
    assert.ok(filtered >= 3 * 4, `only ${filtered} same-type queries checked`);
  });

  it('names each link count for its block', () => {
    // Block A is the target (?…C variables), block C the anchor (?…A).
    const q = question('wells', 'samples');
    const link = planPipeline(q).find((s) => s.type === 'GET_LINK_AQUIFERS')!;
    const query = link.buildQuery(context(q), undefined);
    assert.match(query, /COUNT\(DISTINCT \?wellC\) AS \?countA\)/);
    assert.match(query, new RegExp(`COUNT\\(DISTINCT \\${entityFor('samples').iriVar('A')}\\) AS \\?countC\\)`));
    assert.match(query, /\?aquifer geo:hasGeometry\/geo:asWKT \?aquiferWKT/);
  });
});
