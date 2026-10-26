import { useQuery } from '@tanstack/react-query';
import { executeSparql } from '../engine/sparqlClient';
import { buildSampleDetailsByIri } from '../engine/templates/hydrate';
import { buildSamplePointDetail } from '../engine/resultTransformer';
import { fetchCachedSampleDetail } from '../api/resultCacheClient';
import type { SamplePointDetail } from '../types/map';
import type { SampleFilters } from '../types/query';

// Loads the observation table for a single sample point, when its popup opens.
//
// The pipeline used to fetch this for every sample up front: 18-37MB per run
// (37,425 rows for one Maine question) to fill popups that open one at a time.
// One sample point is ~30KB. `enabled` is driven by the popup's open state so
// nothing is fetched until a user actually asks for it.
//
// Prewarmed popups (scripts/warm-sample-details.mts) are served from the API
// cache; everything else falls through to the live endpoint as before.
export function useSampleDetails(
  samplePointIri: string | null,
  enabled: boolean,
  filters?: SampleFilters,
) {
  return useQuery<SamplePointDetail | null>({
    queryKey: ['sampleDetails', samplePointIri, filters],
    enabled: enabled && Boolean(samplePointIri),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const iri = samplePointIri as string;
      const cached = await fetchCachedSampleDetail(iri, filters);
      if (cached) return cached;

      const rows = await executeSparql('federation', buildSampleDetailsByIri([iri], filters));
      return buildSamplePointDetail(rows);
    },
  });
}
