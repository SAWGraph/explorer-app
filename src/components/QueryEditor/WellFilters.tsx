import type { WellFilters as WellFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { useWellClassifications } from '../../hooks/useDiscoveryQueries';
import { WELL_STATE_FIPS } from '../../constants/wellClassifications';

interface WellFiltersProps {
  value?: WellFiltersType;
  onChange: (filters: WellFiltersType) => void;
  stateCode?: string;
}

function withCount(label: string, count?: number): string {
  return count && count > 0 ? `${label} (${count})` : label;
}

export function WellFilters({ value, onChange, stateCode }: WellFiltersProps) {
  const { data: classifications = [], isLoading } = useWellClassifications();

  // A chosen region state limits the visible groups to that state; with no
  // state chosen every group shows and each pick self-scopes to its state.
  const visible =
    stateCode === WELL_STATE_FIPS.IL
      ? classifications.filter((c) => c.state === 'IL')
      : stateCode === WELL_STATE_FIPS.ME
        ? classifications.filter((c) => c.state === 'ME')
        : classifications;

  const options = visible.map((c) => ({
    value: c.key,
    label: withCount(c.label, c.count),
    group: c.group,
  }));

  return (
    <div className="well-filters">
      <div className="filter-field">
        <label>Well classification:</label>
        <FlatSelect
          options={options}
          selectedValues={value?.wellCategories ?? []}
          onChange={(vals) => onChange({ ...value, wellCategories: vals })}
          placeholder="All wells..."
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
