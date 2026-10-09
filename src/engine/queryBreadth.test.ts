import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessQueryBreadth } from './queryBreadth';
import type { AnalysisQuestion } from '../types/query';

const q = (a: object, c: object) =>
  ({
    blockA: { type: 'samples', region: { stateCode: '23' }, ...a },
    relationship: { type: 'near' },
    blockC: { type: 'facilities', ...c },
  }) as AnalysisQuestion;
const codes = (industryCodes: string[]) => ({ facilityFilters: { industryCodes } });

test('warns for statewide, broad sectors, no substance', () => {
  assert.ok(assessQueryBreadth(q({}, codes(['22', '56']))));
  assert.ok(assessQueryBreadth(q({}, codes(['31', '32', '33']))));
});

test('quiet once any one of the three is narrowed', () => {
  assert.equal(assessQueryBreadth(q({}, codes(['325']))), null);
  assert.equal(assessQueryBreadth(q({ sampleFilters: { substances: ['x'] } }, codes(['22', '56']))), null);
  assert.equal(assessQueryBreadth(q({ region: { stateCode: '23', countyCodes: ['23005'] } }, codes(['22', '56']))), null);
});
