export interface MaterialType {
  uri: string;
  label: string;
  count?: number;
  group?: string;
}

// coso:MaterialSample bucket priority (from MIN(?bucketPrio)) -> display group.
export const MATERIAL_GROUP_BY_PRIO: Record<string, string> = {
  '1': 'Biota',
  '2': 'Solid Material',
  '3': 'Water',
  '4': 'Air',
};

// Fallback material types if discovery query fails. Controlled vocabulary lives in
// the root me-egad namespace, not me-egad-data — see pfas-kg's
// datasets/maine/egad/controlledVocab/sample_type.ttl. Verified live 2026-09-11.
export const FALLBACK_MATERIAL_TYPES: MaterialType[] = [
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.GW', label: 'Groundwater (GW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.DW', label: 'Drinking Water (DW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.SW', label: 'Surface Water (SW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.SL', label: 'Soil (SL)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.SU', label: 'Sludge (SU)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.L', label: 'Leachate (L)' },
];
