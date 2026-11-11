// One map feature per facility, with every industry code it came back with
// (engine/shape.ts). The details step returns one row per code that passes the
// block's industry filter: Indiana's dashboard question has 882 rows for 415
// facilities. The map used to keep the first row and drop the rest, and colour
// the marker by whichever code the server happened to send first.
import { describe, expect, it } from 'vitest';
import { transformFacilitiesToFeatures } from '../shape';
import type { SparqlRow } from '../types/sparql';

const NAICS = 'http://w3id.org/fio/v1/naics#NAICS-';
const row = (code: string, name: string): SparqlRow => ({
  facility: 'http://ex.org/fac/1',
  facWKT: 'POINT(-69.7 44.3)',
  facilityName: 'Augusta Landfill',
  industryCode: `${NAICS}${code}`,
  industryName: name,
});
const LANDFILL = row('562212', 'Solid Waste Landfill');
const DOD = row('928110', 'National Security');

describe('a facility with several industry codes', () => {
  it('is one feature that keeps every code, lowest first', () => {
    const features = transformFacilitiesToFeatures([DOD, LANDFILL]);

    expect(features).toHaveLength(1);
    expect(features[0].industries).toEqual([
      { code: `${NAICS}562212`, name: 'Solid Waste Landfill' },
      { code: `${NAICS}928110`, name: 'National Security' },
    ]);
  });

  it('is coloured by its lowest code, whichever row came first', () => {
    for (const rows of [[LANDFILL, DOD], [DOD, LANDFILL]]) {
      const [feature] = transformFacilitiesToFeatures(rows);
      expect(feature.properties.industryCode).toBe(`${NAICS}562212`);
      expect(feature.properties.industryName).toBe('Solid Waste Landfill');
    }
  });

  it('lists a code once when it came back in more than one row', () => {
    // The details query also projects ?s2cell: a facility on a cell edge
    // comes back once per cell.
    const [feature] = transformFacilitiesToFeatures([LANDFILL, LANDFILL, DOD]);
    expect(feature.industries?.map((i) => i.name)).toEqual(['Solid Waste Landfill', 'National Security']);
  });

  it('keeps facilities apart', () => {
    const other = { ...DOD, facility: 'http://ex.org/fac/2' };
    expect(transformFacilitiesToFeatures([LANDFILL, other]).map((f) => f.industries?.length)).toEqual([1, 1]);
  });
});
