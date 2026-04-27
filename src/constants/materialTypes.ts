export interface MaterialType {
  uri: string;
  label: string;
}

// Fallback material types if discovery query fails
export const FALLBACK_MATERIAL_TYPES: MaterialType[] = [
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.GW', label: 'Groundwater (GW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.DW', label: 'Drinking Water (DW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.SW', label: 'Surface Water (SW)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.SL', label: 'Soil (SL)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.SO', label: 'Sludge (SO)' },
  { uri: 'http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.L', label: 'Leachate (L)' },
];
