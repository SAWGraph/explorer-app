// The counts next to each filter option (#165). A count previews what picking
// that option returns, so it has to check the region the way the pipeline's
// own count step does. Counting Hancock wells by their subdivision link alone
// gave 11,644; the pipeline, which checks the cell and the subdivision, finds
// 7,296 (2026-11-17).
//
//   npm test   # query text only, no network
import { describe, expect, it } from 'vitest';
import { buildEntityCountQuery, buildOptionCountQuery } from '../templates/fusedQueries';
import { ENTITY_TYPES, entityFor } from '../entities';
import type { EntityType } from '../types/query';
import { optionCountsFrom, wellTokenCount } from '../optionCounts';
import { encodeWellToken } from '../constants/wellClassifications';

const REGIONS: (string[] | undefined)[] = [undefined, ['23'], ['23009'], ['23009', '23005']];

// The lines of a query that restrict it to a region.
const regionLines = (q: string): string[] =>
  q
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /administrativeRegion|_region|administrativePartOf|_subdivision|_regionLink/.test(line));

const countedTypes = ENTITY_TYPES.filter((t) => entityFor(t).options);

describe('option counts check the region like the count step', () => {
  it('covers every type with a filter dropdown', () => {
    expect([...countedTypes].sort()).toEqual(['aquifers', 'facilities', 'streams', 'waterBodies', 'wells']);
  });

  let checked = 0;
  for (const type of countedTypes) {
    for (const region of REGIONS) {
      it(`${type} in ${region?.join(',') ?? 'no region'}`, () => {
        const step = buildEntityCountQuery({ type }, region);
        const option = buildOptionCountQuery(type, region);
        const expected = regionLines(step);
        if (region) expect(expected.length).toBeGreaterThan(0);
        else expect(expected).toEqual([]);
        expect(regionLines(option)).toEqual(expected);
        checked++;
      });
    }
  }

  it('ran for every type and region', () => {
    expect(checked).toBe(5 * REGIONS.length);
  });
});

describe('option count query', () => {
  const flat = (q: string) => q.replace(/\s+/g, ' ');
  const cases: [EntityType, string][] = [
    ['waterBodies', '?waterBodyP rdf:type hyf:HY_WaterBody . ?waterBodyP nhdplusv2:hasFTYPE ?option .'],
    ['streams', '?streamP rdf:type hyf:HY_FlowPath . ?streamP nhdplusv2:hasFTYPE ?option .'],
    ['aquifers', '?aquiferP rdf:type gwml2:GW_Aquifer . ?aquiferP saw_water:aquiferType ?option .'],
    ['facilities', '?facilityP fio:ofIndustry ?option . ?option a naics:NAICS-IndustryCode .'],
    ['wells', '{ ?wellP rdf:type il_isgs:ISGS-Well ; il_isgs:wellPurpose ?option } UNION { ?wellP rdf:type me_mgs:MGS-Well ; me_mgs:ofWellType ?option } UNION { ?wellP rdf:type me_mgs:MGS-Well ; me_mgs:hasUse ?option }'],
  ];
  for (const [type, pattern] of cases) {
    it(`${type} counts distinct entities per option`, () => {
      const q = flat(buildOptionCountQuery(type, ['23']));
      expect(q).toContain(pattern);
      expect(q).toContain(`SELECT ?option (COUNT(DISTINCT ${entityFor(type).iriVar('P')}) AS ?count)`);
      expect(q).toContain('GROUP BY ?option');
    });
  }

  it('reads no facility geometry: a picked industry does not ask for one', () => {
    expect(buildOptionCountQuery('facilities', ['23'])).not.toContain('geo:hasGeometry');
  });
});

describe('option counts from rows', () => {
  const row = (option: string, count: number) => ({ option, count: String(count) });

  it('keys feature types by their FTYPE value', () => {
    expect(optionCountsFrom('waterBodies', [row('LakePond', 348), row('SwampMarsh', 170)])).toEqual({
      LakePond: 348,
      SwampMarsh: 170,
    });
  });

  it('sums raw aquifer types into the two dropdown options', () => {
    const rows = [row('coarse-grain_materials', 96), row('sand_gravel', 2), row('bedrock', 1), row('sand and gravel', 5)];
    expect(optionCountsFrom('aquifers', rows)).toEqual({ surficial: 103, bedrock: 1 });
  });

  it('drops an aquifer type no option covers', () => {
    expect(optionCountsFrom('aquifers', [row('clay', 4)])).toEqual({});
  });

  it('keys industries by bare NAICS code', () => {
    const rows = [row('http://w3id.org/fio/v1/naics#NAICS-111110', 1), row('http://w3id.org/fio/v1/naics#NAICS-11121', 4)];
    expect(optionCountsFrom('facilities', rows)).toEqual({ '111110': 1, '11121': 4 });
  });

  it('keys well classifications by IRI', () => {
    const iri = 'http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellType.Bedrock';
    expect(optionCountsFrom('wells', [row(iri, 7236)])).toEqual({ [iri]: 7236 });
  });

  it('skips rows with no count', () => {
    expect(optionCountsFrom('streams', [{ option: 'Pipeline' }])).toEqual({});
  });
});

describe('well classification count', () => {
  const active = 'http://sawgraph.spatialai.org/v1/il-isgs-data#d.ISGS-WellPurpose.WATER';
  const plugged = 'http://sawgraph.spatialai.org/v1/il-isgs-data#d.ISGS-WellPurpose.WATERP';

  it('sums the active and plugged twins one entry stands for', () => {
    const token = encodeWellToken('ilPurpose', [active, plugged]);
    expect(wellTokenCount({ [active]: 300, [plugged]: 20 }, token)).toBe(320);
  });

  it('is undefined when no IRI of the entry was counted', () => {
    expect(wellTokenCount({}, encodeWellToken('ilPurpose', [active]))).toBeUndefined();
  });
});
