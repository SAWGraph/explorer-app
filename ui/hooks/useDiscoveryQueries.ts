import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { executeSparql } from '../../engine/endpoint';
import type { SparqlRow } from '../../engine/types/sparql';
import type { EntityType } from '../../engine/types/query';
import { buildOptionCountQuery } from '../../engine/templates/fusedQueries';
import { optionCountsFrom } from '../../engine/optionCounts';
import {
  buildDiscoverIndustriesQuery,
  buildDiscoverSubstancesQuery,
  buildDiscoverMaterialTypesQuery,
  buildDiscoverCountiesQuery,
  buildDiscoverIllinoisPurposesQuery,
  buildDiscoverMaineTypesQuery,
  buildDiscoverMaineUsesQuery,
} from '../../engine/templates/regions';
import { FALLBACK_NAICS, type NaicsIndustry } from '../../engine/constants/naics';
import { FALLBACK_SUBSTANCES, resolveRetired, type Substance } from '../../engine/constants/substances';
import { FALLBACK_MATERIAL_TYPES, MATERIAL_GROUP_BY_PRIO, type MaterialType } from '../../engine/constants/materialTypes';
import {
  FALLBACK_WELL_CLASSIFICATIONS,
  WELL_GROUP_LABEL,
  encodeWellToken,
  type WellClassification,
  type WellField,
} from '../../engine/constants/wellClassifications';

export function useIndustries() {
  return useQuery<NaicsIndustry[]>({
    queryKey: ['industries'],
    queryFn: async () => {
      const rows = await executeSparql('fiokg', buildDiscoverIndustriesQuery());
      if (rows.length === 0) return FALLBACK_NAICS;
      const seen = new Set<string>();
      const result: NaicsIndustry[] = [];

      // First pass: collect unique group codes
      for (const r of rows) {
        const gc = r.groupCode;
        if (gc && !seen.has(gc)) {
          seen.add(gc);
          result.push({
            code: gc,
            label: r.groupLabel || gc,
            groupCode: gc,
            groupLabel: r.groupLabel,
          });
        }
      }

      // Second pass: collect unique individual codes
      for (const r of rows) {
        if (!seen.has(r.code)) {
          seen.add(r.code);
          result.push({
            code: r.code,
            label: r.label,
            groupCode: r.groupCode,
            groupLabel: r.groupLabel,
          });
        }
      }

      // Sort: groups first (shorter codes), then specifics
      result.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return result;
    },
    staleTime: Infinity,
    retry: 1,
    placeholderData: FALLBACK_NAICS,
  });
}

interface RegionParam {
  stateCode?: string;
  countyCodes?: string[];
}

// How many entities each option of a type's filter dropdown would find: in the
// region when one is picked, nationwide when none is (#165). Keyed the way the
// dropdown keys its options (optionCountsFrom). Runs once per type and region a
// session, when the dropdown mounts. A failed query leaves the dropdown working,
// with no numbers.
export function useOptionCounts(type: EntityType, region?: RegionParam): UseQueryResult<Record<string, number>> {
  const codes = regionCodes(region);
  return useQuery<Record<string, number>>({
    queryKey: ['optionCounts', type, codes?.join(',') ?? ''],
    queryFn: async () => {
      const rows = await executeSparql('federation', buildOptionCountQuery(type, codes));
      return optionCountsFrom(type, rows);
    },
    staleTime: Infinity,
    retry: 1,
  });
}

// The selected counties, sorted so the same counties in another order share a
// cache entry, or the state; undefined with no state.
function regionCodes(region?: RegionParam): string[] | undefined {
  if (!region?.stateCode) return undefined;
  return region.countyCodes?.length ? [...region.countyCodes].sort() : [region.stateCode];
}

function regionKey(region?: RegionParam): string {
  return regionCodes(region)?.join(',') ?? '';
}

export function useSubstances(region?: RegionParam) {
  const key = regionKey(region);
  return useQuery<Substance[]>({
    queryKey: ['substances', key],
    queryFn: async () => {
      const rows = await executeSparql(
        region?.stateCode ? 'federation' : 'sawgraph',
        buildDiscoverSubstancesQuery(region),
      );
      if (rows.length === 0) return key ? [] : FALLBACK_SUBSTANCES;
      return rows.map((r) => ({
        // ponytail: first DTXSID only; every label maps to at most one today.
        // Empty for substances with no DSSTox identifier.
        uri: r.dtxsids?.split(' ')[0] ?? '',
        label: resolveRetired(r.display_label) ?? '',
        count: r.num ? Number(r.num) : undefined,
      }));
    },
    staleTime: Infinity,
    retry: 1,
    placeholderData: FALLBACK_SUBSTANCES,
  });
}

export function useMaterialTypes(region?: RegionParam) {
  const key = regionKey(region);
  return useQuery<MaterialType[]>({
    queryKey: ['materialTypes', key],
    queryFn: async () => {
      const rows = await executeSparql(
        region?.stateCode ? 'federation' : 'sawgraph',
        buildDiscoverMaterialTypesQuery(region),
      );
      if (rows.length === 0) return key ? [] : FALLBACK_MATERIAL_TYPES;
      return rows.map((r) => ({
        uri: r.matType,
        label: r.label || r.matType.split(/[#/]/).pop() || r.matType,
        count: r.num ? Number(r.num) : undefined,
        group: MATERIAL_GROUP_BY_PRIO[r.bucketPrio] ?? 'Other',
      }));
    },
    staleTime: Infinity,
    retry: 1,
    placeholderData: FALLBACK_MATERIAL_TYPES,
  });
}

export function useCounties(stateCode?: string) {
  return useQuery({
    queryKey: ['counties', stateCode],
    queryFn: async () => {
      if (!stateCode) return [];
      const rows = await executeSparql('spatialkg', buildDiscoverCountiesQuery(stateCode));
      return rows.map((r) => ({
        uri: r.county,
        name: r.countyName,
        code: r.county.split('.').pop() || '',
      }));
    },
    enabled: !!stateCode,
    staleTime: Infinity,
  });
}

function localName(uri: string): string {
  return uri.split(/[#/.]/).pop() || uri;
}

// Illinois active/plugged twins share a label once the trailing "Plugged" is
// stripped (some lack the comma, e.g. "Mine Service Plugged"). Collapse them
// into one entry whose token carries both IRIs.
function collapseIllinois(rows: SparqlRow[]): WellClassification[] {
  const byLabel = new Map<string, { uris: string[]; count: number }>();
  for (const r of rows) {
    const raw = r.label || localName(r.value);
    const label = raw.replace(/,?\s*Plugged$/i, '').trim();
    const entry = byLabel.get(label) ?? { uris: [], count: 0 };
    entry.uris.push(r.value);
    entry.count += r.num ? Number(r.num) : 0;
    byLabel.set(label, entry);
  }
  return [...byLabel.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([label, { uris, count }]) => ({
      key: encodeWellToken('ilPurpose', uris),
      label,
      count,
      state: 'IL' as const,
      field: 'ilPurpose' as const,
      group: WELL_GROUP_LABEL.ilPurpose,
    }));
}

function maineEntries(
  rows: SparqlRow[],
  field: Extract<WellField, 'meType' | 'meUse'>,
): WellClassification[] {
  return rows.map((r) => ({
    key: encodeWellToken(field, [r.value]),
    label: localName(r.value),
    count: r.num ? Number(r.num) : undefined,
    state: 'ME' as const,
    field,
    group: WELL_GROUP_LABEL[field],
  }));
}

export function useWellClassifications() {
  return useQuery<WellClassification[]>({
    queryKey: ['wellClassifications'],
    queryFn: async () => {
      const [il, meType, meUse] = await Promise.all([
        executeSparql('hydrologykg', buildDiscoverIllinoisPurposesQuery()),
        executeSparql('hydrologykg', buildDiscoverMaineTypesQuery()),
        executeSparql('hydrologykg', buildDiscoverMaineUsesQuery()),
      ]);
      const merged = [
        ...collapseIllinois(il),
        ...maineEntries(meType, 'meType'),
        ...maineEntries(meUse, 'meUse'),
      ];
      return merged.length ? merged : FALLBACK_WELL_CLASSIFICATIONS;
    },
    staleTime: Infinity,
    retry: 1,
    placeholderData: FALLBACK_WELL_CLASSIFICATIONS,
  });
}
