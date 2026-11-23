// A block reads only the filter slot of its own type (sampleFilters for
// samples, wellFilters for wells, ...), and a label map is display text, not a
// filter. The old rule read the first slot it found, whatever the type, and
// counted a label map as a filter: a wells block carrying an empty leftover
// `facilityFilters` read as unfiltered with well categories set, and a block
// whose codes were cleared but whose labels stayed read as filtered. That
// decides which side a trace starts from (engine/sides.ts).
//
// Leftover slots come from older saves, published links and cleared
// selections; the editor itself drops filters on a type change.
//
// No network.
import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { entityFor } from '../entities';
import { normalise } from '../question';
import { planPipeline, type PipelineContext } from '../planner';
import { cacheKey } from '../cacheKey';
import type { AnalysisQuestion, EntityBlock, EntityType, SpatialRelationship } from '../types/query';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];

// One filter that narrows each type, in its own slot.
const OWN: Record<EntityType, Partial<EntityBlock>> = {
  samples: { sampleFilters: { substances: ['http://w3id.org/DSSTox/v1/DTXSID3031864'] } },
  facilities: { facilityFilters: { industryCodes: ['562212'] } },
  waterBodies: { waterBodyFilters: { ftypes: ['LakePond'] } },
  wells: { wellFilters: { wellCategories: ['meUse||http://example.org/use/Domestic'] } },
  aquifers: { aquiferFilters: { aquiferTypes: ['bedrock'] } },
  streams: { streamFilters: { ftypes: ['StreamRiver'] } },
};
// Every other type's filter, as leftover slots.
const leftovers = (type: EntityType): Partial<EntityBlock> =>
  Object.assign({}, ...ENTITY_TYPES.filter((t) => t !== type).map((t) => OWN[t]));

describe('whether a block is filtered', () => {
  it.each(ENTITY_TYPES)('%s reads its own slot only', (type) => {
    const isFiltered = entityFor(type).isFiltered;
    expect(isFiltered({ type, ...OWN[type] })).toBe(true);
    expect(isFiltered({ type, ...leftovers(type) })).toBe(false);
    expect(isFiltered({ type, ...leftovers(type), ...OWN[type] })).toBe(true);
  });

  it('is not filtered by a label map left after the codes were cleared', () => {
    expect(entityFor('facilities').isFiltered({ type: 'facilities', facilityFilters: { industryCodes: [], industryLabels: { '562212': 'Landfills' } } })).toBe(false);
    expect(entityFor('wells').isFiltered({ type: 'wells', wellFilters: { wellCategoryLabels: { x: 'Domestic' } } })).toBe(false);
  });

  it('is filtered with well categories set and an empty leftover facilities slot', () => {
    expect(entityFor('wells').isFiltered({ type: 'wells', facilityFilters: {}, ...OWN.wells })).toBe(true);
  });
});

describe('a question with leftover slots', () => {
  const clean = (a: EntityType, rel: SpatialRelationship['type'], c: EntityType, own = true): AnalysisQuestion => ({
    blockA: { type: a, ...(own ? OWN[a] : {}) },
    relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}) },
    blockC: { type: c, ...(own ? OWN[c] : {}) },
  });
  const withLeftovers = (q: AnalysisQuestion): AnalysisQuestion => ({
    ...q,
    blockA: { ...leftovers(q.blockA.type), ...q.blockA },
    blockC: { ...leftovers(q.blockC.type), ...q.blockC },
  });
  const context = (question: AnalysisQuestion): PipelineContext => ({
    question,
    targetIris: ['http://example.org/t/1'],
    anchorIris: ['http://example.org/a/1'],
    results: {},
  });

  it('normalises to blocks with their own slot only', () => {
    const { anchor, target } = normalise(withLeftovers(clean('wells', 'upstream', 'facilities')));
    expect(anchor).toEqual({ type: 'wells', ...OWN.wells });
    expect(target).toEqual({ type: 'facilities', ...OWN.facilities });
  });

  it('sends the same SPARQL as the clean question, for every shape', () => {
    let shapes = 0;
    for (const a of ENTITY_TYPES) {
      for (const c of ENTITY_TYPES) {
        for (const rel of RELATIONSHIPS) {
          // With and without the block's own filter: a block with none of its
          // own and a leftover one is where the old rule read "filtered".
          for (const own of [true, false]) {
            const q = clean(a, rel, c, own);
            const dirty = withLeftovers(q);
            const sent = (question: AnalysisQuestion) => planPipeline(question).map((s) => s.buildQuery(context(question), undefined));
            assert.deepEqual(sent(dirty), sent(q), `${a} ${rel} ${c}${own ? '' : ', no own filter'}`);
            shapes++;
          }
        }
      }
    }
    assert.equal(shapes, 216);
  });

  it('shares the clean question\'s cache key', async () => {
    const q = clean('samples', 'downstream', 'facilities');
    expect(await cacheKey(withLeftovers(q))).toBe(await cacheKey(q));
  });
});
