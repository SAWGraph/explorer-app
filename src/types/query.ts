// The complete state of an analysis question
export interface AnalysisQuestion {
  blockA: EntityBlock;
  relationship: SpatialRelationship;
  blockC: EntityBlock;
}

export type EntityType = 'samples' | 'facilities' | 'waterBodies' | 'wells';

export interface EntityBlock {
  type: EntityType;
  region?: RegionFilter;
  sampleFilters?: SampleFilters;
  facilityFilters?: FacilityFilters;
  waterBodyFilters?: WaterBodyFilters;
  wellFilters?: WellFilters;
}

export interface RegionFilter {
  stateCode?: string;
  countyCodes?: string[];
  countySubdivisionURIs?: string[];
}

export interface SampleFilters {
  substances?: string[];
  materialTypes?: string[];
  minConcentration?: number;
  maxConcentration?: number;
  unit?: string;
}

export interface FacilityFilters {
  industryCodes?: string[];
  industryLabels?: Record<string, string>; // code → label for display
}

export interface WaterBodyFilters {
  waterTypes?: string[];
  ftypes?: string[];
}

export interface WellFilters {
  wellTypes?: string[];
}

export interface SpatialRelationship {
  type: 'near' | 'downstream' | 'upstream' | 'within';
  hops?: number;
}
