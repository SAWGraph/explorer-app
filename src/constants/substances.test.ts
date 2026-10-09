// The substance naming rule. A drifting rule shows the same substance as
// "10-H-Perfluorodecanoic acid" in the filter dropdown and as a bare
// "DTXSID10630918" in the map popup, which reads as a broken query.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { substanceLabel, resolveRetired } from './substances';

const PFDA = 'http://w3id.org/DSSTox/v1/DTXSID10630918';

// The naming rule, in priority order.
test('short form wins', () =>
  assert.equal(substanceLabel({ uri: PFDA, shortLabel: 'PFDA', label: 'Perfluorodecanoic acid', paramLabel: 'x' }), 'PFDA'));

test('full name when there is no short form', () =>
  assert.equal(substanceLabel({ uri: PFDA, label: 'Perfluorodecanoic acid' }), 'Perfluorodecanoic acid'));

// 33 of the 172 DSSTox substances in the graph carry no label of their own;
// every one of them is named by its source parameter.
test('source parameter names the unlabelled substances', () =>
  assert.equal(substanceLabel({ uri: PFDA, paramLabel: '10-H-Perfluorodecanoic acid' }), '10-H-Perfluorodecanoic acid'));

test('DTXSID is the last resort', () => assert.equal(substanceLabel({ uri: PFDA }), 'DTXSID10630918'));

// Retired source parameters name their own replacement.
test('retired parameter resolves to its replacement', () =>
  assert.equal(resolveRetired('PFOS***retired***use Perfluorooctanesulfonate'), 'Perfluorooctanesulfonate'));

test('retired parameter with no replacement keeps its name', () => assert.equal(resolveRetired('PFOS ***retired***'), 'PFOS'));
