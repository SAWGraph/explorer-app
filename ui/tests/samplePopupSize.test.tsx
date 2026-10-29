// @vitest-environment jsdom
//
// Leaflet sizes a popup once, when it opens. The sample popup opens on a
// "Loading measurements…" placeholder and its substance table arrives later,
// so on first open the table spilled past the right edge of the box. Issue #84.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import type { SparqlRow } from '../../engine/types/sparql';
import type { MapFeature } from '../../engine/types/map';
import { SampleLayer } from '../components/Map/SampleLayer';

let resolveRows: (rows: SparqlRow[]) => void = () => {};
vi.mock('../../engine/sparqlClient', () => ({
  executeSparql: () => new Promise<SparqlRow[]>((r) => { resolveRows = r; }),
}));

afterEach(cleanup);

const feature: MapFeature = {
  id: 'http://w3id.org/sawgraph/v2/me-egad-data#d.egad.samplePoint.133650',
  geometry: { type: 'Point', coordinates: [44.2, -69.1] },
  properties: { type: 'sample', resultCount: 1, maxConcentration: 975 },
};

it('re-measures the open popup once its substance table arrives', async () => {
  let map: L.Map | null = null;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MapContainer center={[44.2, -69.1]} zoom={9} style={{ height: 400, width: 400 }} ref={(m) => { map = m; }}>
        <SampleLayer features={[feature]} />
      </MapContainer>
    </QueryClientProvider>,
  );
  map!.eachLayer((l) => { if (l instanceof L.CircleMarker) l.openPopup(); });
  await screen.findByText('Loading measurements…');

  // Only updates after the placeholder was measured count.
  const update = vi.spyOn(L.Popup.prototype, 'update');
  resolveRows([{
    samplePointName: '133650',
    sample: 's1',
    substanceUri: 'pfos',
    substanceShortLabel: 'Perfluorooctanesulfonate',
    result_value: '975',
    unit_sym: 'ng/L',
  }]);
  await screen.findAllByText(/Perfluorooctanesulfonate/);

  expect(update).toHaveBeenCalled();
});
