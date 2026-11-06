// The substance naming rule and the popup's per-substance grouping
// (engine/constants/substances.ts, engine/shape.ts).
//
// Both are silent when wrong. A drifting naming rule shows the same substance
// as "10-H-Perfluorodecanoic acid" in the filter dropdown and as a bare
// "DTXSID10630918" in the map popup, which reads as a broken query. Grouping
// that keys on the label instead of the URI merges two substances that happen
// to share a name; grouping that forgets to append merges away real results.
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { substanceLabel, resolveRetired } from '../constants/substances';
import { buildSamplePointDetail } from '../shape';
import type { SparqlRow } from '../types/sparql';

const PFDA = 'http://w3id.org/DSSTox/v1/DTXSID10630918';

describe('naming rule, in priority order', () => {
  it('short form wins', () =>
    assert.equal(
      substanceLabel({ uri: PFDA, shortLabel: 'PFDA', label: 'Perfluorodecanoic acid', paramLabel: 'x' }),
      'PFDA',
    ));
  it('full name when there is no short form', () =>
    assert.equal(substanceLabel({ uri: PFDA, label: 'Perfluorodecanoic acid' }), 'Perfluorodecanoic acid'));
  // 33 of the 172 DSSTox substances in the graph carry no label of their own;
  // every one of them is named by its source parameter.
  it('source parameter names the unlabelled substances', () =>
    assert.equal(
      substanceLabel({ uri: PFDA, paramLabel: '10-H-Perfluorodecanoic acid' }),
      '10-H-Perfluorodecanoic acid',
    ));
  it('DTXSID is the last resort', () => assert.equal(substanceLabel({ uri: PFDA }), 'DTXSID10630918'));
});

// Retired source parameters name their own replacement.
describe('retired parameters', () => {
  it('resolves to its replacement', () =>
    assert.equal(resolveRetired('PFOS***retired***use Perfluorooctanesulfonate'), 'Perfluorooctanesulfonate'));
  it('keeps its name when there is no replacement', () =>
    assert.equal(resolveRetired('PFOS ***retired***'), 'PFOS'));
});

// The popup's grouping. These rows mirror sample
// d.wqp.sample.INSTOR_WQX-AB35759FISHPREP at sample point INSTOR_WQX-8112:
// two observations of one substance, same date, same unit, differing only in
// value, which is what looked like a duplicated row.
const row = (over: Partial<SparqlRow>): SparqlRow =>
  ({
    sp: 'https://geoconnex.us/iow/wqp/INSTOR_WQX-8112',
    spWKT: 'POINT(-86.9 39.7)',
    samplePointName: 'UMK030-0023',
    sample: 'sample.AB35759FISHPREP',
    sampleIdentifier: 'INSTOR_WQX-AB35759.FISHPREP',
    date: '2020-01-17',
    unit_sym: 'μg/kg',
    ...over,
  }) as SparqlRow;

describe('popup grouping', () => {
  const detail = buildSamplePointDetail([
    row({ observation: 'o1', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.249' }),
    row({ observation: 'o2', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.285' }),
    row({ observation: 'o3', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3031864', substanceShortLabel: 'PFOS', result_value: '3.16' }),
    // A non-detect: no numeric value, so it is not a result to list.
    row({ observation: 'o4', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3040148', substanceShortLabel: 'PFDS', result_value: 'non-detect' }),
  ]);
  assert.ok(detail, 'expected a detail object');
  const obs = detail.samples[0].observations;

  it('one sample section', () => assert.equal(detail.samples.length, 1));
  it('repeat observations collapse to one row per substance', () => assert.equal(obs.length, 2));
  it('both values are kept', () =>
    assert.deepEqual(obs[0], {
      substance: '10-H-Perfluorodecanoic acid',
      substanceUri: PFDA,
      results: [0.249, 0.285],
      unit: 'μg/kg',
    }));
  it('grouping keys on the URI, not the label', () => assert.equal(obs[1].substance, 'PFOS'));
  it('max is reported with the shared label', () => assert.equal(detail.maxResult?.substance, 'PFOS'));
  it('max is the largest value', () => assert.equal(detail.maxResult?.value, 3.16));

  // Two substances sharing a display name must stay on separate rows.
  it('same name, different URI, two rows', () => {
    const shared = buildSamplePointDetail([
      row({ observation: 'o1', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID1', substanceShortLabel: 'PFOS', result_value: '1' }),
      row({ observation: 'o2', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID2', substanceShortLabel: 'PFOS', result_value: '2' }),
    ]);
    assert.equal(shared?.samples[0].observations.length, 2);
  });
});
