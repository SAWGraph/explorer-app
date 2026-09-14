import { useQuery } from '@tanstack/react-query';
import { executeSparql } from '../engine/sparqlClient';
import { buildSampleDetailsByIri } from '../engine/templates/hydrate';
import { buildSamplePointDetail } from '../engine/resultTransformer';
import type { SamplePointDetail } from '../types/map';
import type { SampleFilters } from '../types/query';

// Loads the observation table for a single sample point, when its popup opens.
//
// The pipeline used to fetch this for every sample up front: 18-37MB per run
// (37,425 rows for one Maine question) to fill popups that open one at a time.
// One sample point is ~30KB. `enabled` is driven by the popup's open state so
// nothing is fetched until a user actually asks for it.
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
      const rows = await executeSparql(
        'federation',
        buildSampleDetailsByIri([samplePointIri as string], filters),
      );
      return buildSamplePointDetail(rows);
    },
  });
}
