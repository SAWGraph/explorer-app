// One row per entity and cell before the join (plan decision 23).
//
// A side whose bind repeats an entity in a cell fans out the whole join: a
// filtered samples side repeats a point once per matching measurement (Maine,
// >= 4 ng/L: 78,369 rows for 2,207 points), a facilities side once per
// industry code (Maine: 5,811 rows for 2,976 facilities). Carried into the
// spatial join, 407 points became 20,826 rows and issue #82's question failed
// after 626s. So every fused query collapses such a side to
// `SELECT DISTINCT ?entity ?cell` first, with its region and pin inside (QLever
// evaluates the subquery on its own: a region left outside lists every
// matching entity in the graph), and the wells step collapses its join before
// the well columns attach.
//
// Inputs are the full shape space, both blocks filtered and not, on purpose:
// which side a block lands on flips for upstream, and the join is written in
// four places (near, anchor-first trace, target-first trace, bounded trace).
//
// No network: planPipeline only builds query strings.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { planPipeline, type PipelineContext } from '../planner';
import { entityFor } from '../entities';
import { normalise } from '../question';
import type { AnalysisQuestion, EntityBlock, EntityType, SpatialRelationship } from '../types/query';

const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream'];
const PFOS = 'http://w3id.org/DSSTox/v1/DTXSID3031864';
const YORK = { stateCode: '23', countyCodes: ['23031'] };

// A filter that makes each type's bind read a multi-valued field where it has one.
const FILTERED: Partial<Record<EntityType, Partial<EntityBlock>>> = {
  samples: { sampleFilters: { substances: [PFOS], minConcentration: 4 } },
  // A prefix matches every code under it, so a facility can match twice.
  facilities: { facilityFilters: { industryCodes: ['5622'] } },
};

const block = (type: EntityType, filtered: boolean): EntityBlock => ({
  type,
  region: YORK,
  ...(filtered ? FILTERED[type] : {}),
});

// Every `{ SELECT DISTINCT <entity> <cell> WHERE { ... } }` in a query, found by
// brace matching, keyed by the entity variable. A bounded trace writes its seed
// twice (boundedTrace), so a side can have more than one.
function collapsedBlocks(query: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /\{\s*SELECT DISTINCT (\?\w+) \?s2\w+ WHERE \{/g;
  for (let m = re.exec(query); m; m = re.exec(query)) {
    let depth = 0;
    for (let i = m.index; i < query.length; i++) {
      if (query[i] === '{') depth++;
      if (query[i] === '}' && --depth === 0) {
        out.set(m[1], [...(out.get(m[1]) ?? []), query.slice(m.index, i + 1)]);
        break;
      }
    }
  }
  return out;
}

const context = (question: AnalysisQuestion): PipelineContext => ({
  question,
  targetIris: ['http://example.org/target/1', 'http://example.org/target/2'],
  anchorIris: ['http://example.org/anchor/1', 'http://example.org/anchor/2'],
  results: {},
});

it('every fused query joins one row per entity and cell', () => {
  let checked = 0;
  for (const a of ENTITY_TYPES) {
    for (const c of ENTITY_TYPES) {
      for (const rel of RELATIONSHIPS) {
        for (const filtered of [true, false]) {
          for (const maxDistanceKm of rel === 'near' ? [undefined] : [undefined, 30]) {
            const question: AnalysisQuestion = {
              blockA: block(a, filtered),
              relationship: { type: rel, ...(rel === 'near' ? { hops: 1 } : {}), ...(maxDistanceKm ? { maxDistanceKm } : {}) },
              blockC: block(c, filtered),
            };
            const { anchor, target } = normalise(question);
            const sides = [
              { block: anchor, suffix: 'A' },
              { block: target, suffix: 'C' },
            ];
            const where = `${a} ${rel}${maxDistanceKm ? `(${maxDistanceKm}km)` : ''} ${c}${filtered ? ' filtered' : ''}`;

            for (const step of planPipeline(question, { countSides: false })) {
              const fused = step.type.startsWith('FIND_') || (step.type.startsWith('HYDRATE_') && step.initialScopes === undefined);
              if (!fused) continue;
              const query = step.buildQuery(context(question), undefined);
              const blocks = collapsedBlocks(query);
              checked++;

              for (const side of sides) {
                const entity = entityFor(side.block.type);
                if (entity.isFlowline || !entity.fansOut(side.block)) continue;
                const variable = entity.iriVar(side.suffix);
                const inner = (blocks.get(variable) ?? []).join('\n');
                assert.ok(inner, `${step.type}: the ${variable} side is not collapsed: ${where}`);
                // The side's region and its own joins sit inside the subquery,
                // never outside it.
                assert.ok(inner.includes('administrativeRegion.USA.23031'), `${step.type}: ${variable}'s region outside its subquery: ${where}`);
                const bind = entity.bindInCell(side.block, side.suffix === 'A' ? '?s2anchor' : '?s2target', side.suffix);
                const firstLine = bind.trim().split('\n')[0].trim();
                assert.equal(query.split(firstLine).length - 1, inner.split(firstLine).length - 1, `${step.type}: ${variable}'s bind repeated outside its subquery: ${where}`);
              }

              // The wells step attaches its columns to one row per well and cell.
              if (step.type.startsWith('HYDRATE_')) {
                const wellVar = step.type === 'HYDRATE_TARGET_BY_IRI' ? '?wellC' : '?wellA';
                assert.ok(blocks.has(wellVar), `${step.type}: wells joined before their columns are collapsed: ${where}`);
              }
            }
          }
        }
      }
    }
  }
  // 36 type pairs x (1 near + 2 traces x 2 distances) x 2 filter settings, each
  // with two discovery steps, plus a wells step wherever wells appear.
  assert.ok(checked > 36 * 5 * 2 * 2, `checked only ${checked} queries`);
});

it('leaves a facilities side with only full 6-digit codes as it was', () => {
  // A 6-digit code matches itself only: one row per facility already
  // (landfills and DoD sites nationwide: 5,922 rows for 5,908), and
  // collapsing it tripled the Maine wells questions' discovery time.
  const question: AnalysisQuestion = {
    blockA: { type: 'wells', region: YORK },
    relationship: { type: 'near', hops: 1 },
    blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212', '928110'] } },
  };
  for (const step of planPipeline(question, { countSides: false }).filter((s) => s.type.startsWith('FIND_'))) {
    const query = step.buildQuery(context(question), undefined);
    assert.ok(!collapsedBlocks(query).has('?facilityA'), `${step.type}: a 6-digit facilities side was collapsed`);
  }
});

it('the wells step no longer carries every measurement of a samples side', () => {
  const question: AnalysisQuestion = {
    blockA: { type: 'samples', region: YORK },
    relationship: { type: 'near', hops: 2 },
    blockC: { type: 'wells', region: YORK },
  };
  const wells = planPipeline(question, { countSides: false }).find((s) => s.type === 'HYDRATE_ANCHOR_BY_IRI')!;
  const query = wells.buildQuery(context(question), undefined);
  // An unfiltered samples side reads no measurement at all.
  assert.ok(!query.includes('coso:hasResult'), 'wells step joins sample results');
  assert.ok(!query.includes('?observationC'), 'wells step joins sample observations');
});
