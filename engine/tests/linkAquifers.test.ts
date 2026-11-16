// What a groundwater-connected run (#121) draws and says besides its answer:
// the outlines of the aquifers that link the two sides, each with a "Links N
// samples ↔ M wells" line named for its blocks, and a note when the link left
// regional aquifers out (GLOSSARY.md). A count read off the wrong block would
// put the wells' number next to "samples", and nothing else would notice.
import { describe, expect, it } from 'vitest';
import { transformLinkAquifersToFeatures } from '../shape';
import { regionalAquiferNote } from '../errors';
import type { PipelineResult } from '../executor';

const POLYGON = 'POLYGON((-69.8 44.3, -69.7 44.3, -69.7 44.4, -69.8 44.3))';
const MULTI = 'MULTIPOLYGON(((-69.8 44.3, -69.7 44.3, -69.7 44.4, -69.8 44.3)), ((-70 44, -69.9 44, -69.9 44.1, -70 44)))';

const row = (aquifer: string, countA: string, countC: string, aquiferWKT = POLYGON) => ({
  aquifer,
  aquiferType: 'sand and gravel',
  aquiferWKT,
  countA,
  countC,
});

describe('link aquifer outlines', () => {
  it('names each count for its block, block C first', () => {
    const [feature] = transformLinkAquifersToFeatures([row('http://w3id.org/sawgraph/v1/me_mgs_data#d.MGS-Aquifer.06489', '16', '13')], {
      a: 'wells',
      c: 'samples',
    });
    expect(feature.id).toBe('http://w3id.org/sawgraph/v1/me_mgs_data#d.MGS-Aquifer.06489');
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.properties).toMatchObject({
      type: 'linkAquifer',
      name: 'MGS-Aquifer.06489',
      aquiferType: 'sand and gravel',
      links: 'Links 13 samples ↔ 16 wells',
    });
  });

  it('says one entity in the singular', () => {
    const [feature] = transformLinkAquifersToFeatures([row('http://ex.org/aq/1', '1', '1')], { a: 'facilities', c: 'wells' });
    expect(feature.properties.links).toBe('Links 1 well ↔ 1 facility');
  });

  it('draws every part of a multipolygon, and skips a row with no outline', () => {
    const features = transformLinkAquifersToFeatures(
      [row('http://ex.org/aq/1', '2', '3', MULTI), { aquifer: 'http://ex.org/aq/2', countA: '1', countC: '1' }],
      { a: 'wells', c: 'samples' },
    );
    expect(features.map((f) => f.id)).toEqual(['http://ex.org/aq/1_0', 'http://ex.org/aq/1_1']);
  });
});

describe('the regional aquifer note', () => {
  const success = (skippedAquifers?: { aquifer: string }[]): PipelineResult => ({
    status: 'success',
    blockA: [],
    blockC: [],
    decoration: { boundaries: [], streamLines: [], ...(skippedAquifers ? { linkAquifers: [], skippedAquifers } : {}) },
  });

  it('says how many regional aquifers the link left out', () => {
    expect(regionalAquiferNote(success([{ aquifer: 'http://ex.org/BR0001' }, { aquifer: 'http://ex.org/BR0013' }]))).toBe(
      'Not linked through 2 regional aquifers (each over about 1,000 km²): nearly everything in the state sits on them.',
    );
    expect(regionalAquiferNote(success([{ aquifer: 'http://ex.org/BR0001' }]))).toBe(
      'Not linked through 1 regional aquifer (over about 1,000 km²): nearly everything in the state sits on it.',
    );
  });

  it('says nothing when none were left out, or on another kind of run', () => {
    expect(regionalAquiferNote(success([]))).toBeNull();
    expect(regionalAquiferNote(success())).toBeNull();
    expect(regionalAquiferNote(null)).toBeNull();
  });
});
