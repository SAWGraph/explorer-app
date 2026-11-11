// @vitest-environment jsdom
//
// Markers on the same point were drawn on top of each other and only the top
// one could be opened: on the Cook County streams question, Willow Springs
// Terminal sits exactly under Jones Chemicals and had no way to be reached.
// Now any marker of a stack opens one list of all of them (#153).
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import type { ReactNode } from 'react';
import type { MapFeature } from '../../engine/types/map';
import { FacilityLayer } from '../components/Map/FacilityLayer';
import { SampleLayer } from '../components/Map/SampleLayer';
import { MapPanes } from '../components/Map/ResultsMap';

const executeSparql = vi.fn<(...args: unknown[]) => Promise<never>>(() => new Promise(() => {}));
vi.mock('../../engine/endpoint', () => ({ executeSparql: (...args: unknown[]) => executeSparql(...args) }));

afterEach(() => {
  cleanup();
  executeSparql.mockClear();
});

const NAICS = 'http://w3id.org/fio/v1/naics#NAICS-';
const FRS = 'http://w3id.org/fio/v1/epa-frs-data#d.FRS-Facility.';
const WILLOW_SPRINGS: [number, number] = [41.716752, -87.909558];

const facility = (id: string, name: string, industry: string, at: [number, number]): MapFeature => ({
  id: `${FRS}${id}`,
  geometry: { type: 'Point', coordinates: at },
  properties: { type: 'facility', name, industryCode: `${NAICS}325180`, industryName: industry },
  industries: [{ code: `${NAICS}325180`, name: industry }],
});

const willow = facility('110000001', 'WILLOW SPRINGS TERMINAL', 'Other Basic Inorganic Chemical Manufacturing', WILLOW_SPRINGS);
const jones = facility('110011596512', 'JONES CHEMICALS INC', 'Soap and Cleaning Compound Manufacturing', WILLOW_SPRINGS);
const alone = facility('110000002', 'DIAL CORP', 'Soap and Cleaning Compound Manufacturing', [41.8, -87.78]);

function renderMap(layer: ReactNode): L.Map {
  let map: L.Map | null = null;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MapContainer center={WILLOW_SPRINGS} zoom={18} style={{ height: 400, width: 400 }} ref={(m) => { map = m; }}>
        <MapPanes />
        {layer}
      </MapContainer>
    </QueryClientProvider>,
  );
  return map!;
}

// Open the popup of the marker for `feature`, the way a click would.
function openPopupOf(map: L.Map, latLng: [number, number], nth = 0) {
  const markers: L.Layer[] = [];
  map.eachLayer((l) => {
    if ((l instanceof L.Marker || l instanceof L.CircleMarker) && l.getLatLng().equals(latLng)) markers.push(l);
  });
  (markers[nth] as L.Marker).openPopup();
}

it('lists every facility on a shared point, and opens the one picked', async () => {
  const map = renderMap(<FacilityLayer features={[willow, jones, alone]} />);
  openPopupOf(map, WILLOW_SPRINGS, 1);

  expect(await screen.findByText('2 facilities at this point')).toBeTruthy();
  // The one drawn on top leads the list.
  const names = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(names[0]).toContain('JONES CHEMICALS INC');
  expect(names[1]).toContain('WILLOW SPRINGS TERMINAL');

  fireEvent.click(screen.getByText('WILLOW SPRINGS TERMINAL'));
  expect(await screen.findByText('WILLOW SPRINGS TERMINAL (110000001)')).toBeTruthy();
  expect(screen.getByText('Other Basic Inorganic Chemical Manufacturing (NAICS 325180)')).toBeTruthy();

  fireEvent.click(screen.getByText('← All 2 at this point'));
  expect(await screen.findByText('2 facilities at this point')).toBeTruthy();
});

it('opens a facility alone on its point straight to its popup', async () => {
  const map = renderMap(<FacilityLayer features={[willow, jones, alone]} />);
  openPopupOf(map, [41.8, -87.78]);

  expect(await screen.findByText('DIAL CORP (110000002)')).toBeTruthy();
  expect(screen.queryByText(/at this point/)).toBeNull();
});

it('lists stacked samples and loads measurements only for the one picked', async () => {
  // The 140235 / 140248 pair by Bangor International Airport.
  const at: [number, number] = [44.806253, -68.833074];
  const sample = (n: string, max: number): MapFeature => ({
    id: `http://w3id.org/sawgraph/v2/me-egad-data#d.egad.samplePoint.${n}`,
    geometry: { type: 'Point', coordinates: at },
    properties: { type: 'sample', samplePointName: `EGAD sample point ${n}`, resultCount: 1, maxConcentration: max },
  });
  const map = renderMap(<SampleLayer features={[sample('140235', 790), sample('140248', 0.5)]} />);
  openPopupOf(map, at, 1);

  expect(await screen.findByText('2 samples at this point')).toBeTruthy();
  expect(screen.getByText('Max 790')).toBeTruthy();
  expect(executeSparql).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('EGAD sample point 140235'));
  expect(await screen.findByText('Loading measurements…')).toBeTruthy();
  expect(executeSparql).toHaveBeenCalledTimes(1);
  expect(executeSparql.mock.calls[0].join(' ')).toContain('samplePoint.140235');
});
