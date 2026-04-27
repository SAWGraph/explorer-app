export interface Substance {
  uri: string;
  label: string;
}

// Fallback substances if discovery query fails
export const FALLBACK_SUBSTANCES: Substance[] = [
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFOS_A', label: 'PFOS' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFOA_A', label: 'PFOA' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFHPA_A', label: 'PFHpA' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFHXS_A', label: 'PFHxS' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFNA_A', label: 'PFNA' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFDA_A', label: 'PFDA' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFBS_A', label: 'PFBS' },
];
