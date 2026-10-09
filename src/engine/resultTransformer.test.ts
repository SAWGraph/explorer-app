// From SPARQL rows to map features and popup bodies. A regression here shows
// up as a missing polygon or a wrong popup value, never as an error.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  transformSamplesToFeatures,
  transformFacilitiesToFeatures,
  transformWaterBodiesToFeatures,
  transformWellsToFeatures,
  transformFlowlinesToFeatures,
  transformRegionBoundaries,
  buildSamplePointDetail,
} from './resultTransformer';
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

describe('map features', () => {
  test('WKT points are lon lat, Leaflet wants lat lon', () => {
    const [f] = transformSamplesToFeatures([{ sp: 'sp1', spWKT: 'POINT(-69.5 44.2)' }]);
    assert.deepEqual(f.geometry, { type: 'Point', coordinates: [44.2, -69.5] });
    assert.equal(f.properties.resultCount, '0');
  });

  test('rows without geometry, or with unparseable geometry, are dropped', () => {
    assert.equal(transformSamplesToFeatures([{ sp: 'a' }, { sp: 'b', spWKT: 'garbage' }]).length, 0);
    assert.equal(transformWellsToFeatures([{ well: 'w', wellWKT: 'LINESTRING(1 2, 3 4)' }]).length, 0);
  });

  test('a facility with several industry codes is one marker, first row wins', () => {
    const out = transformFacilitiesToFeatures([
      { facility: 'f1', facWKT: 'POINT(1 2)', industryCode: '562212' },
      { facility: 'f1', facWKT: 'POINT(1 2)', industryCode: '562211' },
      { facility: 'f2', facWKT: 'POINT(3 4)', industryCode: '325' },
    ]);
    assert.deepEqual(out.map((f) => [f.id, f.properties.industryCode]), [['f1', '562212'], ['f2', '325']]);
  });

  test('water bodies: point, line, polygon with a hole, multipolygon', () => {
    const out = transformWaterBodiesToFeatures([
      { waterBody: 'p', wbWKT: 'POINT(1 2)' },
      { waterBody: 'l', wbWKT: 'LINESTRING(1 2, 3 4)' },
      { waterBody: 'h', wbWKT: 'POLYGON((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))' },
      { waterBody: 'm', wbWKT: 'MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))' },
    ]);
    assert.deepEqual(out.map((f) => [f.id, f.geometry.type]), [
      ['p', 'Point'],
      ['l', 'LineString'],
      ['h', 'Polygon'],
      ['m_0', 'Polygon'],
      ['m_1', 'Polygon'],
    ]);
    // The hole survives as a second ring.
    assert.equal((out[2].geometry.coordinates as unknown[]).length, 2);
    assert.equal(out[0].properties.name, 'Unknown Water Body');
  });

  test('a MULTIPOLYGON is never read as a single POLYGON', () => {
    const out = transformRegionBoundaries([
      { region: 'r', regionWKT: 'MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))' },
    ]);
    assert.deepEqual(out.map((f) => f.id), ['r_0', 'r_1']);
  });

  test('well classification IRIs are shown by local name', () => {
    const [w] = transformWellsToFeatures([
      { well: 'w', wellWKT: 'POINT(1 2)', meUse: 'http://example.org/me-mgs.Domestic', ilDepth: '40' },
    ]);
    assert.equal(w.properties.wellUse, 'Domestic');
    assert.equal(w.properties.depth, '40');
  });

  test('flowlines are deduplicated, and pathLength appears only when present', () => {
    const out = transformFlowlinesToFeatures([
      { flowline: 'a', flowlineWKT: 'LINESTRING(1 2, 3 4)', path_length: '2.5' },
      { flowline: 'a', flowlineWKT: 'LINESTRING(1 2, 3 4)' },
      { flowline: 'b', flowlineWKT: 'LINESTRING(5 6, 7 8)' },
    ]);
    assert.deepEqual(out.map((f) => f.id), ['a', 'b']);
    assert.equal(out[0].properties.pathLength, '2.5');
    assert.ok(!('pathLength' in out[1].properties));
  });
});

describe('sample popup, across samples', () => {
  test('max is taken across every sample at the point, dates trimmed to the day', () => {
    const base = { samplePointName: 'Well 7', unit_sym: 'ng/L' };
    const detail = buildSamplePointDetail([
      { ...base, sample: 's1', sampleIdentifier: 'S-1', date: '2021-05-04T00:00:00', substanceUri: 'u/PFOS', substanceShortLabel: 'PFOS', result_value: '5' },
      { ...base, sample: 's2', sampleIdentifier: 'S-2', date: '2022-01-01', substanceUri: 'u/PFOA', substanceShortLabel: 'PFOA', result_value: '9' },
    ])!;
    assert.equal(detail.samplePointName, 'Well 7');
    assert.equal(detail.samples[0].date, '2021-05-04');
    assert.deepEqual(detail.maxResult, { substance: 'PFOA', value: 9, unit: 'ng/L', sampleId: 'S-2', date: '2022-01-01' });
  });

  test('no rows, no popup', () => assert.equal(buildSamplePointDetail([]), null));
});
