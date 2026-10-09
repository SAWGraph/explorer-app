import type { EndpointKey } from '../constants/endpoints';
import type { SampleFilters } from '../types/query';
import {
  buildDiscoverIndustriesQuery,
  buildDiscoverSubstancesQuery,
  buildDiscoverMaterialTypesQuery,
  buildDiscoverCountiesQuery,
  buildIndustryCountsQuery,
  buildDiscoverIllinoisPurposesQuery,
  buildDiscoverMaineTypesQuery,
  buildDiscoverMaineUsesQuery,
} from './templates/regions';
import { buildSampleDetailsByIri } from './templates/hydrate';

// The queries that are not part of a question's pipeline: what fills each
// dropdown, and what a sample popup loads when it opens. Each entry pairs a
// builder with the endpoint it is sent to, because that pairing is decided
// here and nowhere else. The hooks run these, and the query catalog
// (src/engine/queries/catalog.ts) records them, so the two cannot disagree.
export interface Lookup {
  endpoint: EndpointKey;
  query: string;
}

export interface RegionParam {
  stateCode?: string;
  countyCodes?: string[];
}

export const LOOKUPS = {
  industries: (): Lookup => ({ endpoint: 'fiokg', query: buildDiscoverIndustriesQuery() }),
  industryCounts: (region: { stateCode: string; countyCodes?: string[] }): Lookup => ({
    endpoint: 'federation',
    query: buildIndustryCountsQuery(region),
  }),
  // Without a region the sawgraph endpoint answers on its own; once a state is
  // picked the region join needs spatial data, which only federation has.
  substances: (region?: RegionParam): Lookup => ({
    endpoint: region?.stateCode ? 'federation' : 'sawgraph',
    query: buildDiscoverSubstancesQuery(region),
  }),
  materialTypes: (region?: RegionParam): Lookup => ({
    endpoint: region?.stateCode ? 'federation' : 'sawgraph',
    query: buildDiscoverMaterialTypesQuery(region),
  }),
  counties: (stateCode: string): Lookup => ({ endpoint: 'spatialkg', query: buildDiscoverCountiesQuery(stateCode) }),
  illinoisWellPurposes: (): Lookup => ({ endpoint: 'hydrologykg', query: buildDiscoverIllinoisPurposesQuery() }),
  maineWellTypes: (): Lookup => ({ endpoint: 'hydrologykg', query: buildDiscoverMaineTypesQuery() }),
  maineWellUses: (): Lookup => ({ endpoint: 'hydrologykg', query: buildDiscoverMaineUsesQuery() }),
  sampleDetails: (samplePointIri: string, filters?: SampleFilters): Lookup => ({
    endpoint: 'federation',
    query: buildSampleDetailsByIri([samplePointIri], filters),
  }),
};
