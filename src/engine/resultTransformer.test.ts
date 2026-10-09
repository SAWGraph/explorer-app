// From SPARQL rows to map features and popup bodies. A regression here shows
// up as a missing polygon or a wrong popup value, never as an error.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { buildSamplePointDetail } from './resultTransformer';
import type { SparqlRow } from '../types/sparql';

// The popup's grouping. Grouping that keys on the label instead of the URI
// merges two substances that happen to share a name; grouping that forgets to
// append merges away real results.
describe('sample popup grouping', () => {
  const PFDA = 'http://w3id.org/DSSTox/v1/DTXSID10630918';
  // These rows mirror sample d.wqp.sample.INSTOR_WQX-AB35759FISHPREP at sample
  // point INSTOR_WQX-8112: two observations of one substance, same date, same
  // unit, differing only in value, which is what looked like a duplicated row.
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

  const detail = buildSamplePointDetail([
    row({ observation: 'o1', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.249' }),
    row({ observation: 'o2', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.285' }),
    row({ observation: 'o3', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3031864', substanceShortLabel: 'PFOS', result_value: '3.16' }),
    // A non-detect: no numeric value, so it is not a result to list.
    row({ observation: 'o4', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3040148', substanceShortLabel: 'PFDS', result_value: 'non-detect' }),
  ])!;

  test('one sample section', () => assert.equal(detail.samples.length, 1));
  test('repeat observations collapse to one row per substance', () => assert.equal(detail.samples[0].observations.length, 2));
  test('both values are kept', () =>
    assert.deepEqual(detail.samples[0].observations[0], {
      substance: '10-H-Perfluorodecanoic acid',
      substanceUri: PFDA,
      results: [0.249, 0.285],
      unit: 'μg/kg',
    }));
  test('grouping keys on the URI, not the label', () => assert.equal(detail.samples[0].observations[1].substance, 'PFOS'));
  test('max is reported with the shared label', () => assert.equal(detail.maxResult?.substance, 'PFOS'));
  test('max is the largest value', () => assert.equal(detail.maxResult?.value, 3.16));

  // Two substances sharing a display name must stay on separate rows.
  test('same name, different URI, two rows', () => {
    const shared = buildSamplePointDetail([
      row({ observation: 'o1', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID1', substanceShortLabel: 'PFOS', result_value: '1' }),
      row({ observation: 'o2', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID2', substanceShortLabel: 'PFOS', result_value: '2' }),
    ]);
    assert.equal(shared?.samples[0].observations.length, 2);
  });
});
