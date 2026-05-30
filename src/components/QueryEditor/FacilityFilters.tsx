import { HierarchicalSelect } from './HierarchicalSelect/HierarchicalSelect';
import type { FacilityFilters as FacilityFiltersType, RegionFilter } from '../../types/query';
import { useIndustries, useIndustryCounts } from '../../hooks/useDiscoveryQueries';

interface FacilityFiltersProps {
  value?: FacilityFiltersType;
  onChange: (filters: FacilityFiltersType) => void;
  region?: RegionFilter;
}

export function FacilityFilters({ value, onChange, region }: FacilityFiltersProps) {
  const { data: industries = [] } = useIndustries();
  const { data: counts } = useIndustryCounts(region);

  return (
    <div className="facility-filters">
      <div className="filter-field">
        <label>Industry (NAICS):</label>
        <HierarchicalSelect
          industries={industries}
          selectedCodes={value?.industryCodes ?? []}
          onChange={(codes, labels) => onChange({ ...value, industryCodes: codes, industryLabels: labels })}
          placeholder="Any industry..."
          counts={counts}
        />
      </div>
    </div>
  );
}
