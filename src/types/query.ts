// The complete state of an analysis question
export interface AnalysisQuestion {
  blockA: EntityBlock;
  relationship: SpatialRelationship;
  blockC: EntityBlock;
}

export type EntityType = 'samples' | 'facilities' | 'waterBodies' | 'wells' | 'aquifers';

export interface EntityBlock {
  type: EntityType;
  region?: RegionFilter;
  sampleFilters?: SampleFilters;
  facilityFilters?: FacilityFilters;
  waterBodyFilters?: WaterBodyFilters;
  wellFilters?: WellFilters;
  aquiferFilters?: AquiferFilters;
}

export interface RegionFilter {
  stateCode?: string;
  countyCodes?: string[];
  countyLabels?: Record<string, string>; // code → name for display
  countySubdivisionURIs?: string[];
}

export interface SampleFilters {
  substances?: string[];
  substanceLabels?: Record<string, string>; // uri → display label
  materialTypes?: string[];
  minConcentration?: number;
  maxConcentration?: number;
  unit?: string;
  includeNondetects?: boolean;
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
  // Encoded category tokens: `${field}||${iri1} ${iri2} ...`
  // where field is 'ilPurpose' | 'meType' | 'meUse'. See wellClassifications.ts.
  wellCategories?: string[];
}

// Canonical aquifer-type kinds ('surficial' | 'bedrock'), each mapped to the
// raw (inconsistent) source vocabulary in the query builder.
export interface AquiferFilters {
  aquiferTypes?: string[];
}

export interface SpatialRelationship {
  type: 'near' | 'downstream' | 'upstream' | 'within';
  hops?: number;
}
