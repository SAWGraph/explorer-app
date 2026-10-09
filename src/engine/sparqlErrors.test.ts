// QLever reports very different failures through a few HTTP statuses, and the
// executor's split-or-retry decision rests on telling them apart.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  classifySparqlFailure,
  isSplittable,
  isRetryable,
  adviceForOversizedQuestion,
  userMessageFor,
  SparqlError,
} from './sparqlErrors';
import type { AnalysisQuestion } from '../types/query';

const json = (exception: string) => JSON.stringify({ exception });

describe('classifySparqlFailure', () => {
  // Bodies as QLever sends them, from docs/QUERY-MATRIX.md Part 4.
  const cases: Array<[number, string, string]> = [
    [429, json('Operation timed out. Last operation: Query planning'), 'timeout'],
    [429, 'Sort operation was canceled', 'timeout'], // non-JSON body
    [500, json('Tried to allocate 4.3 GB, but only 2.9 MB were available'), 'out-of-memory'],
    [500, json('Waited for a result from another thread which then failed'), 'sibling-failure'],
    [413, '', 'payload-too-large'],
    [502, json('Operation timed out'), 'payload-too-large'], // status wins
    [500, '<html>bad gateway</html>', 'unknown'],
  ];
  for (const [status, body, kind] of cases) {
    test(`${status} ${body.slice(0, 50)} is ${kind}`, () => assert.equal(classifySparqlFailure(status, body), kind));
  }
});

test('which failures the executor splits, and which it retries', () => {
  const kinds = ['timeout', 'out-of-memory', 'payload-too-large', 'sibling-failure', 'network', 'unknown'] as const;
  assert.deepEqual(kinds.filter(isSplittable), ['timeout', 'out-of-memory', 'payload-too-large']);
  assert.deepEqual(kinds.filter(isRetryable), ['timeout', 'sibling-failure']);
});

describe('advice names the lever that applies to this question', () => {
  const q = (rel: object, a: object = {}, c: object = {}) =>
    ({ blockA: { type: 'samples', ...a }, relationship: rel, blockC: { type: 'facilities', ...c } }) as AnalysisQuestion;
  const me = { region: { stateCode: '23' } };

  test('bounded trace: a shorter distance', () =>
    assert.match(adviceForOversizedQuestion(q({ type: 'upstream', maxDistanceKm: 30 })), /shorter distance than 30 km/));
  test('unbounded trace: set a distance', () => assert.match(adviceForOversizedQuestion(q({ type: 'downstream' })), /maximum distance/));
  test('near, block C open', () => assert.match(adviceForOversizedQuestion(q({ type: 'near' }, me)), /second block/));
  test('near, block A open', () => assert.match(adviceForOversizedQuestion(q({ type: 'near' }, {}, me)), /first block/));
  test('near, both narrowed', () => assert.match(adviceForOversizedQuestion(q({ type: 'near' }, me, me)), /smaller region/));
});

test('user messages', () => {
  assert.match(userMessageFor(new SparqlError('timeout', 429, 'x')), /too much data/);
  assert.match(userMessageFor(new Error('boom')), /Something went wrong/);
});
