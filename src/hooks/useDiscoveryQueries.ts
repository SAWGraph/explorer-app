import { useQuery } from '@tanstack/react-query';
import { executeSparql } from '../engine/sparqlClient';
import {
  buildDiscoverIndustriesQuery,
  buildDiscoverSubstancesQuery,
  buildDiscoverMaterialTypesQuery,
  buildDiscoverCountiesQuery,
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

export function useSubstances() {
  return useQuery<Substance[]>({
    queryKey: ['substances'],
    queryFn: async () => {
      const rows = await executeSparql('sawgraph', buildDiscoverSubstancesQuery());
      if (rows.length === 0) return FALLBACK_SUBSTANCES;
      return rows.map((r) => ({
        uri: r.substance,
        label: r.label,
        shortLabel: r.short_label,
      }));
    },
    staleTime: Infinity,
    retry: 1,
    placeholderData: FALLBACK_SUBSTANCES,
  });
}

export function useMaterialTypes() {
  return useQuery<MaterialType[]>({
    queryKey: ['materialTypes'],
    queryFn: async () => {
      const rows = await executeSparql('sawgraph', buildDiscoverMaterialTypesQuery());
      if (rows.length === 0) return FALLBACK_MATERIAL_TYPES;
      return rows.map((r) => ({ uri: r.matType, label: r.label }));
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
