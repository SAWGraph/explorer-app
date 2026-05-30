import { useQuery } from '@tanstack/react-query';
import { executeSparql } from '../engine/sparqlClient';
import {
  buildDiscoverIndustriesQuery,
  buildDiscoverSubstancesQuery,
  buildDiscoverMaterialTypesQuery,
  buildDiscoverCountiesQuery,
  buildIndustryCountsQuery,
} from '../engine/templates/regions';
import { FALLBACK_NAICS, type NaicsIndustry } from '../constants/naics';
import { FALLBACK_SUBSTANCES, type Substance } from '../constants/substances';
import { FALLBACK_MATERIAL_TYPES, type MaterialType } from '../constants/materialTypes';

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

export function useIndustryCounts(region?: RegionParam) {
  const key = region?.stateCode
    ? (region.countyCodes?.length ? [...region.countyCodes].sort() : [region.stateCode]).join(',')
    : '';
  return useQuery<Record<string, number>>({
    queryKey: ['industryCounts', key],
    queryFn: async () => {
      if (!region?.stateCode) return {};
      const rows = await executeSparql(
        'federation',
        buildIndustryCountsQuery({ stateCode: region.stateCode, countyCodes: region.countyCodes }),
      );
      const counts: Record<string, number> = {};
      for (const r of rows) {
        const uri = r.industryCode || '';
        const code = uri.split(/[#/]/).pop()?.replace(/^NAICS-/, '');
        if (!code) continue;
        counts[code] = Number(r.num) || 0;
      }
      return counts;
    },
    enabled: !!region?.stateCode,
    staleTime: Infinity,
  });
}

function regionKey(region?: RegionParam): string {
  if (!region?.stateCode) return '';
  const codes = region.countyCodes?.length ? [...region.countyCodes].sort() : [region.stateCode];
  return codes.join(',');
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
        uri: r.substance,
        label: r.label,
        shortLabel: r.short_label,
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
