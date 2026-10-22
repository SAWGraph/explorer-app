// @vitest-environment jsdom
//
// A water body came back once per S2 cell it touches, and each copy became a
// feature with the same React key. Re-running a question from Customize then
// left polygons from the previous run on the map: after David's seven Hancock
// County runs the map held 6044 polygons for 332 water bodies, when the answer
// was 234. See docs/DEBUGGING.md, "Water bodies drawn once per S2 cell".
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import type { SparqlRow } from '../src/types/sparql';
import { transformWaterBodiesToFeatures } from '../src/engine/resultTransformer';
import { WaterBodyLayer } from '../src/components/Map/WaterBodyLayer';

afterEach(cleanup);

// The row shape cached results still carry: one row per (water body, cell).
const square = (x: number) => `POLYGON ((${x} 44, ${x + 0.01} 44, ${x + 0.01} 44.01, ${x} 44.01, ${x} 44))`;
const rows = (copies: Record<string, number>): SparqlRow[] =>
  Object.entries(copies).flatMap(([id, n]) =>
    Array.from({ length: n }, (_, cell) => ({
      waterBody: `https://geoconnex.us/nhdplusv2/comid/${id}`,
      wbWKT: square(Number(id) / 100),
      wbName: `Pond ${id}`,
      s2cell: `http://stko-kwg.geog.ucsb.edu/lod/resource/s2.level13.${cell}`,
    })),
  );

it('keeps one feature per water body', () => {
  const features = transformWaterBodiesToFeatures(rows({ 1: 90, 2: 3, 3: 1 }));
  expect(features.map((f) => f.id)).toEqual([
    'https://geoconnex.us/nhdplusv2/comid/1',
    'https://geoconnex.us/nhdplusv2/comid/2',
    'https://geoconnex.us/nhdplusv2/comid/3',
  ]);
});

it('a re-run shows only the new answer, with nothing left from the previous run', () => {
  // Duplicate keys are exactly what this guards against; React's warning about
  // them is the symptom, not noise to keep in the output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let map: L.Map | null = null;
  const Harness = ({ data }: { data: SparqlRow[] }) => (
    <MapContainer center={[44, 0.05]} zoom={9} style={{ height: 400, width: 400 }} ref={(m) => { map = m; }}>
      <WaterBodyLayer features={transformWaterBodiesToFeatures(data)} />
    </MapContainer>
  );
  const onMap = () => {
    const ids: string[] = [];
    map!.eachLayer((l) => {
      if (l instanceof L.Polygon) ids.push((l.getLatLngs() as L.LatLng[][])[0][0].lng.toFixed(2));
    });
    return ids.sort();
  };

  // A wider run (more water bodies, more copies), then a narrower one, the
  // order David ran them in.
  const wide = rows({ 1: 6, 2: 5, 3: 4, 4: 3, 5: 2 });
  const narrow = rows({ 1: 3, 2: 2 });

  const { rerender } = render(<Harness data={wide} />);
  expect([...new Set(onMap())]).toEqual(['0.01', '0.02', '0.03', '0.04', '0.05']);

  // Without the dedupe the map kept all five from the wide run (17 polygons).
  rerender(<Harness data={narrow} />);
  expect(onMap()).toEqual(['0.01', '0.02']);
});
