// How the executor slices a question that was too big to run whole.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { chunk, halve } from './scope';

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});

describe('halve', () => {
  test('splits anchors first and rounds up', () =>
    assert.deepEqual(halve({ label: 'x', anchorIris: ['a', 'b', 'c'], targetIris: ['t1', 't2'] }), [
      { label: 'x (1/2)', anchorIris: ['a', 'b'], targetIris: ['t1', 't2'] },
      { label: 'x (2/2)', anchorIris: ['c'], targetIris: ['t1', 't2'] },
    ]));

  test('a single anchor cannot be split, so it falls through to the next list', () =>
    assert.deepEqual(halve({ label: 'y', anchorIris: ['a'], regionCodes: ['23005', '23019'] })?.map((s) => s.regionCodes), [
      ['23005'],
      ['23019'],
    ]));

  test('stops when nothing can be divided', () => {
    assert.equal(halve({ label: 'z', targetIris: ['t'] }), null);
    assert.equal(halve({ label: 'z' }), null);
  });
});
