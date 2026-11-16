// @vitest-environment jsdom
//
// Issue #155: popup links built from result data. A published view replays a
// stored result its publisher uploaded (the API checks only its size), so
// every IRI in it is untrusted and must not become an href unchecked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import type { SparqlRow } from '../../engine/types/sparql';
import type { MapFeature } from '../../engine/types/map';
import { transformFlowlinesToFeatures } from '../../engine/shape';
import { MapPopupContent } from '../components/Map/MapPopup';
import { SampleLayer } from '../components/Map/SampleLayer';
import { MapPanes } from '../components/Map/ResultsMap';
import { safeHref } from '../utils/safeHref';

const REAL_SAMPLE_POINT = 'http://w3id.org/sawgraph/v2/me-egad-data#d.egad.samplePoint.133650';
const REAL_SAMPLE = 'http://w3id.org/sawgraph/v2/me-egad-data#d.egad.sample.1';
// Measured against the live federation endpoint on 2026-11-11: wrapUri turns
// this into two IRIs in VALUES ?sp, and the real one returns 25 rows (HTTP 200),
// so the sample popup opens in full with this string as its link.
const CRAFTED = `https://evil.example/x> <${REAL_SAMPLE_POINT}`;
const UNSAFE = [
  'data:text/html,<h1>hi</h1>',
  'ftp://example.org/x',
  'file:///etc/passwd',
  'comid/1001',
  '//evil.example/x',
  'https://evil.example/a b',
  CRAFTED,
];

let sampleUri = REAL_SAMPLE;
vi.mock('../../engine/endpoint', () => ({
  executeSparql: async (): Promise<SparqlRow[]> => [{
    samplePointName: '133650',
    sample: sampleUri,
    substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3031864',
    substanceShortLabel: 'PFOS',
    result_value: '975',
    unit_sym: 'ng/L',
  }],
}));

afterEach(() => {
  cleanup();
  sampleUri = REAL_SAMPLE;
});

function hrefs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
}

describe('safeHref', () => {
  it.each([
    REAL_SAMPLE_POINT,
    'https://geoconnex.us/nhdplusv2/comid/1001',
    'HTTPS://geoconnex.us/nhdplusv2/comid/1001',
  ])('keeps %s', (iri) => {
    expect(safeHref(iri)).toBe(iri);
  });
  it.each([...UNSAFE, 'javascript:alert(1)', 'https://', 'http://a\nb', '', undefined])('refuses %s', (iri) => {
    expect(safeHref(iri)).toBeUndefined();
  });
});

describe('stream popup', () => {
  function flowline(id: string): MapFeature {
    return transformFlowlinesToFeatures([{
      flowline: id,
      flowlineWKT: 'LINESTRING(-69.10 44.20, -69.11 44.21)',
      streamName: 'Kennebec River',
      fl_type: 'StreamRiver',
    }])[0];
  }
  it('links a real flowline IRI', () => {
    const html = renderToStaticMarkup(<MapPopupContent feature={flowline('https://geoconnex.us/nhdplusv2/comid/1001')} />);
    expect(hrefs(html)).toEqual(['https://geoconnex.us/nhdplusv2/comid/1001']);
  });
  it.each(UNSAFE)('shows %s as text with no link', (id) => {
    const html = renderToStaticMarkup(<MapPopupContent feature={flowline(id)} />);
    expect(hrefs(html)).toEqual([]);
    expect(new DOMParser().parseFromString(html, 'text/html').body.textContent).toContain(id);
  });
});

// The rule: whatever id a feature carries, no popup type renders a link that
// safeHref would refuse. The sample popup fetches on open and is covered below.
describe('every popup type', () => {
  const TYPES = ['facility', 'waterBody', 'well', 'stream', 'regionBoundary'];
  const cases = TYPES.flatMap((type) => UNSAFE.map((id) => [type, id] as const));

  it('covers every type with every unsafe id', () => {
    expect(cases).toHaveLength(TYPES.length * UNSAFE.length);
    expect(cases.length).toBeGreaterThan(0);
  });
  it.each(cases)('%s popup with id %s links nothing unsafe', (type, id) => {
    const feature: MapFeature = {
      id,
      geometry: { type: 'Point', coordinates: [44.2, -69.1] },
      properties: { type, name: 'Example' },
    };
    const links = hrefs(renderToStaticMarkup(<MapPopupContent feature={feature} />));
    for (const href of links) expect(safeHref(href)).toBe(href);
  });
});

describe('sample popup', () => {
  async function openSamplePopup(id: string): Promise<HTMLElement> {
    const feature: MapFeature = {
      id,
      geometry: { type: 'Point', coordinates: [44.2, -69.1] },
      properties: { type: 'sample', resultCount: 1 },
    };
    let map: L.Map | null = null;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapContainer center={[44.2, -69.1]} zoom={9} style={{ height: 400, width: 400 }} ref={(m) => { map = m; }}>
          <MapPanes />
          <SampleLayer features={[feature]} />
        </MapContainer>
      </QueryClientProvider>,
    );
    map!.eachLayer((l) => { if (l instanceof L.CircleMarker) l.openPopup(); });
    await screen.findByText('Sample Point URI');
    return document.querySelector('.sample-detail-popup') as HTMLElement;
  }
  function field(popup: HTMLElement, label: string): Element {
    const found = [...popup.querySelectorAll('.sample-section-field')]
      .find((f) => f.querySelector('.sample-field-label')?.textContent === label);
    if (!found) throw new Error(`no ${label} field`);
    return found;
  }

  it('links real sample point and sample IRIs', async () => {
    const popup = await openSamplePopup(REAL_SAMPLE_POINT);
    expect(field(popup, 'Sample Point URI').querySelector('a')?.getAttribute('href')).toBe(REAL_SAMPLE_POINT);
    expect(field(popup, 'Sample URI').querySelector('a')?.getAttribute('href')).toBe(REAL_SAMPLE);
  });
  it('shows a crafted sample point id that still returns rows as text', async () => {
    const popup = await openSamplePopup(CRAFTED);
    expect(field(popup, 'Sample Point URI').querySelector('a')).toBeNull();
    expect(field(popup, 'Sample Point URI').textContent).toContain(CRAFTED);
  });
  it('shows a sample IRI with an unsafe scheme as text', async () => {
    sampleUri = 'data:text/html,x#S-1';
    const popup = await openSamplePopup(REAL_SAMPLE_POINT);
    expect(field(popup, 'Sample URI').querySelector('a')).toBeNull();
    expect(field(popup, 'Sample URI').textContent).toContain('S-1');
  });
});
