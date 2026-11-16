import type { MapFeature } from '../../../engine/types/map';

// Markers that sit on exactly the same point, in the order they are drawn.
// Leaflet stacks them, so without a shared popup only the top one could ever
// be clicked: 12 of 402 facilities on the Cook County streams question (#153).
//
// Exact coordinates only. Markers that are merely close come apart as the map
// zooms in; these never do. A feature that is not a point is its own group.
//
// Groups come out in the order of their first member, members in input order,
// so the last member of a group is the one Leaflet draws on top.
export function groupByPoint(features: MapFeature[]): MapFeature[][] {
  const groups = new Map<string, MapFeature[]>();
  features.forEach((feature, i) => {
    // `#i` never collides with a "lat,lon" key.
    const key = feature.geometry.type === 'Point' ? feature.geometry.coordinates.join(',') : `#${i}`;
    const group = groups.get(key);
    if (group) group.push(feature);
    else groups.set(key, [feature]);
  });
  return [...groups.values()];
}

// Each feature's group, by feature id, so a layer can keep drawing in its own
// order (which decides what sits on top of what) and still find the others on
// a marker's point.
export function stacksById(features: MapFeature[]): Map<string, MapFeature[]> {
  const byId = new Map<string, MapFeature[]>();
  for (const group of groupByPoint(features)) for (const feature of group) byId.set(feature.id, group);
  return byId;
}
