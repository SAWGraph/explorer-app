// Which block of a question each role names, decided once (engine/question.ts).
//
// The fused queries start from the anchor and trace downstream to the target.
// So the anchor is block C for "A near C" and "A downstream of C", and block A
// for "A upstream of C": there, block A is the upstream end. Getting this wrong
// answered the mirror question once (docs/DEBUGGING.md 2026-09-16). Every later
// stage reads the roles from here instead of working them out again.
import { describe, expect, it } from 'vitest';
import { normalise } from '../question';
import type { AnalysisQuestion, EntityBlock } from '../types/query';

const SAMPLES: EntityBlock = { type: 'samples', region: { stateCode: '23', countyCodes: ['23005', '23031'] } };
const LANDFILLS: EntityBlock = { type: 'facilities', region: { stateCode: '23' }, facilityFilters: { industryCodes: ['562212'] } };

const ask = (relationship: AnalysisQuestion['relationship']): AnalysisQuestion => ({
  blockA: SAMPLES,
  relationship,
  blockC: LANDFILLS,
});

describe('which block each role is', () => {
  it.each([
    ['near', { type: 'near', hops: 1 }],
    ['downstream', { type: 'downstream' }],
    ['downstream, bounded', { type: 'downstream', maxDistanceKm: 30 }],
  ] as const)('%s: the trace starts from block C and reaches block A', (_name, relationship) => {
    const q = normalise(ask(relationship));
    expect(q.anchor).toBe(LANDFILLS);
    expect(q.target).toBe(SAMPLES);
    expect(q.targetIs).toBe('A');
  });

  it.each([
    ['upstream', { type: 'upstream' }],
    ['upstream, bounded', { type: 'upstream', maxDistanceKm: 30 }],
  ] as const)('%s: block A is the upstream end, so the trace starts from it', (_name, relationship) => {
    const q = normalise(ask(relationship));
    expect(q.anchor).toBe(SAMPLES);
    expect(q.target).toBe(LANDFILLS);
    expect(q.targetIs).toBe('C');
  });
});

describe('the region each role carries', () => {
  it('uses the counties when a block names them, else the state', () => {
    const q = normalise(ask({ type: 'near', hops: 1 }));
    expect(q.targetRegion).toEqual(['23005', '23031']);
    expect(q.anchorRegion).toEqual(['23']);
  });

  it('leaves a role with no region unset', () => {
    const q = normalise({ ...ask({ type: 'upstream' }), blockA: { type: 'samples' } });
    expect(q.anchorRegion).toBeUndefined();
    expect(q.targetRegion).toEqual(['23']);
  });

  it('keeps the relationship, hops and distance included', () => {
    const question = ask({ type: 'downstream', maxDistanceKm: 10 });
    expect(normalise(question).relationship).toBe(question.relationship);
  });
});
