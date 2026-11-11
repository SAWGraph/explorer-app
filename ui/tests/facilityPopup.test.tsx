// @vitest-environment jsdom
//
// A facility's popup lists every industry code it came back with, one line
// each. It used to show only the first row's code (engine/shape.ts kept the
// first row per facility and dropped the others).
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MapFeature } from '../../engine/types/map';
import { MapPopupContent } from '../components/Map/MapPopup';

afterEach(cleanup);

const NAICS = 'http://w3id.org/fio/v1/naics#NAICS-';
const feature: MapFeature = {
  id: 'http://w3id.org/fio/v1/epa-frs-data#d.FRS-Facility.110000338855',
  geometry: { type: 'Point', coordinates: [44.3, -69.7] },
  properties: { type: 'facility', name: 'Augusta Landfill', industryCode: `${NAICS}562212`, industryName: 'Solid Waste Landfill' },
  industries: [
    { code: `${NAICS}562212`, name: 'Solid Waste Landfill' },
    { code: `${NAICS}928110`, name: 'National Security' },
  ],
};

it('lists every industry code of a facility, one line each', () => {
  render(<MapPopupContent feature={feature} />);
  expect(screen.getByText('Solid Waste Landfill (NAICS 562212)')).toBeTruthy();
  expect(screen.getByText('National Security (NAICS 928110)')).toBeTruthy();
});

it('still shows the one code of a feature shaped before codes were combined', () => {
  const old: MapFeature = { id: feature.id, geometry: feature.geometry, properties: feature.properties };
  render(<MapPopupContent feature={old} />);
  expect(screen.getByText('Solid Waste Landfill (NAICS 562212)')).toBeTruthy();
});
