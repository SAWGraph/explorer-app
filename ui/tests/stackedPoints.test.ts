// Markers at identical coordinates are grouped so one popup can list them all;
// before, only the top one of a stack could ever be opened (#153).
import { expect, it } from 'vitest';
import type { MapFeature } from '../../engine/types/map';
import { groupByPoint, stacksById } from '../components/Map/stackedPoints';

const point = (id: string, lat: number, lon: number): MapFeature => ({
  id,
  geometry: { type: 'Point', coordinates: [lat, lon] },
  properties: { type: 'facility', name: id },
});

const ids = (groups: MapFeature[][]): string[][] => groups.map((g) => g.map((f) => f.id));

// The Willow Springs pair from the Cook County streams question.
const jones = point('jones', 41.716752, -87.909558);
const willow = point('willow', 41.716752, -87.909558);

it('puts two features at the same point in one group', () => {
  expect(ids(groupByPoint([willow, jones]))).toEqual([['willow', 'jones']]);
});

it('keeps nearby but different points apart', () => {
  const near = point('near', 41.716753, -87.909558);
  expect(ids(groupByPoint([willow, near, jones]))).toEqual([['willow', 'jones'], ['near']]);
});

it('keeps draw order: groups by first member, members as given', () => {
  const a = point('a', 44.8, -68.8);
  const b = point('b', 44.9, -68.9);
  const a2 = point('a2', 44.8, -68.8);
  expect(ids(groupByPoint([a, b, a2]))).toEqual([['a', 'a2'], ['b']]);
});

it('never groups a feature that is not a point', () => {
  const line = (id: string): MapFeature => ({
    id,
    geometry: { type: 'LineString', coordinates: [[44, -69], [44.1, -69.1]] },
    properties: { type: 'stream' },
  });
  expect(ids(groupByPoint([line('l1'), line('l2')]))).toEqual([['l1'], ['l2']]);
});

it('looks up the group of every feature by id', () => {
  const alone = point('alone', 42, -88);
  const byId = stacksById([willow, alone, jones]);
  expect(byId.get('jones')!.map((f) => f.id)).toEqual(['willow', 'jones']);
  expect(byId.get('willow')).toBe(byId.get('jones'));
  expect(byId.get('alone')!.map((f) => f.id)).toEqual(['alone']);
});
