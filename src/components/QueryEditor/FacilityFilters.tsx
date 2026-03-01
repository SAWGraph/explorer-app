import { HierarchicalSelect } from './HierarchicalSelect/HierarchicalSelect';
import type { FacilityFilters as FacilityFiltersType } from '../../types/query';
import { useIndustries } from '../../hooks/useDiscoveryQueries';

interface FacilityFiltersProps {
  value?: FacilityFiltersType;
  onChange: (filters: FacilityFiltersType) => void;
}

export function FacilityFilters({ value, onChange }: FacilityFiltersProps) {
  const { data: industries = [] } = useIndustries();

  return (
    <div className="facility-filters">
      <div className="filter-field">
        <label>Industry (NAICS):</label>
        <HierarchicalSelect
          industries={industries}
          selectedCodes={value?.industryCodes ?? []}
          onChange={(codes, labels) => onChange({ ...value, industryCodes: codes, industryLabels: labels })}
          placeholder="Any industry..."
        />
      </div>
    </div>
  );
}
