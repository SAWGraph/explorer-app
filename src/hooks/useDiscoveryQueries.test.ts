// From dropdown query rows to dropdown options.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  industriesFromRows,
  industryCountsFromRows,
  substancesFromRows,
  materialTypesFromRows,
  countiesFromRows,
  wellClassificationsFromRows,
} from './useDiscoveryQueries';
import { FALLBACK_NAICS } from '../constants/naics';
import { FALLBACK_SUBSTANCES } from '../constants/substances';
import { FALLBACK_MATERIAL_TYPES } from '../constants/materialTypes';
import { FALLBACK_WELL_CLASSIFICATIONS } from '../constants/wellClassifications';

describe('industry tree', () => {
  test('groups are added once each, then sorted ahead of their codes', () => {
    const out = industriesFromRows([
      { code: '562212', label: 'Solid Waste Landfill', groupCode: '5622', groupLabel: 'Waste Treatment' },
      { code: '562211', label: 'Hazardous Waste', groupCode: '5622', groupLabel: 'Waste Treatment' },
    ]);
    assert.deepEqual(out.map((i) => i.code), ['5622', '562211', '562212']);
    assert.equal(out[0].label, 'Waste Treatment');
  });
  test('no rows falls back to the hardcoded list', () => assert.equal(industriesFromRows([]), FALLBACK_NAICS));
});

test('industry counts are keyed by bare NAICS code', () =>
  assert.deepEqual(
    industryCountsFromRows([
      { industryCode: 'http://w3id.org/fio/v1/naics#NAICS-562212', num: '14' },
      { industryCode: 'http://w3id.org/fio/v1/naics#NAICS-325', num: 'x' },
      { industryCode: '', num: '3' },
    ]),
    { '562212': 14, '325': 0 },
  ));

describe('empty answers', () => {
  // With a region, empty is a real answer: nothing of that kind there. Without
  // one it means the lookup found nothing at all, so the fallback shows.
  test('substances', () => {
    assert.deepEqual(substancesFromRows([], true), []);
    assert.equal(substancesFromRows([], false), FALLBACK_SUBSTANCES);
  });
  test('material types', () => {
    assert.deepEqual(materialTypesFromRows([], true), []);
    assert.equal(materialTypesFromRows([], false), FALLBACK_MATERIAL_TYPES);
  });
  test('well classifications', () => assert.equal(wellClassificationsFromRows([], [], []), FALLBACK_WELL_CLASSIFICATIONS));
});

test('substances use the shared naming rule and keep the short form separately', () => {
  const [s] = substancesFromRows([{ substance: 'http://w3id.org/DSSTox/v1/DTXSID1', param_label: 'Param name', short_label: 'PFX', num: '7' }], true);
  assert.deepEqual(s, { uri: 'http://w3id.org/DSSTox/v1/DTXSID1', label: 'Param name', shortLabel: 'PFX', count: 7 });
});

test('material types fall back to the IRI local name, and to the Other group', () => {
  const out = materialTypesFromRows(
    [
      { matType: 'http://example.org/me-egad#GW', label: 'Groundwater', num: '5', bucketPrio: '3' },
      { matType: 'http://example.org/me-egad#XYZ', bucketPrio: '9' },
    ],
    true,
  );
  assert.deepEqual(out.map((m) => [m.label, m.group, m.count]), [['Groundwater', 'Water', 5], ['XYZ', 'Other', undefined]]);
});

test('county codes come from the end of the region IRI', () =>
  assert.deepEqual(countiesFromRows([{ county: 'http://stko-kwg.geog.ucsb.edu/lod/resource/administrativeRegion.USA.23005', countyName: 'Cumberland' }]), [
    { uri: 'http://stko-kwg.geog.ucsb.edu/lod/resource/administrativeRegion.USA.23005', name: 'Cumberland', code: '23005' },
  ]));

test('Illinois active and plugged twins collapse into one option carrying both IRIs', () => {
  const out = wellClassificationsFromRows(
    [
      { value: 'il:a', label: 'Mine Service', num: '2' },
      { value: 'il:b', label: 'Mine Service, Plugged', num: '3' },
      { value: 'il:c', label: 'Domestic Plugged', num: '9' },
    ],
    [{ value: 'http://example.org/me.Drilled', num: '4' }],
    [],
  );
  assert.deepEqual(out.map((w) => [w.label, w.key, w.count]), [
    ['Domestic', 'ilPurpose||il:c', 9],
    ['Mine Service', 'ilPurpose||il:a il:b', 5],
    ['Drilled', 'meType||http://example.org/me.Drilled', 4],
  ]);
});
