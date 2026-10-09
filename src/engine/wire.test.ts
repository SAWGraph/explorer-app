// What a cached result looks like in Postgres and over the wire.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toWire, fromWire, isWireResult } from './wire';

test('only rendered, non-empty keys are cached, and a result survives the round trip', () => {
  const wire = toWire(
    {
      status: 'success',
      data: { FIND_TARGET_ENTITIES: [{ sp: '1' }], GET_ANCHOR_DETAILS: [], FIND_TARGET_IRIS: [{ iri: 'x' }] },
      partial: [],
    },
    '2026-09-29T00:00:00Z',
  );
  assert.deepEqual(wire, { status: 'success', data: { FIND_TARGET_ENTITIES: [{ sp: '1' }] }, computedAt: '2026-09-29T00:00:00Z' });
  assert.deepEqual(fromWire(wire), { status: 'success', data: { FIND_TARGET_ENTITIES: [{ sp: '1' }] } });
});

test('isWireResult', () => {
  assert.ok(isWireResult({ status: 'success', data: {} }));
  assert.ok(!isWireResult({ status: 'error', data: {} }));
  assert.ok(!isWireResult({ status: 'success', data: null }));
  assert.ok(!isWireResult(null));
});
