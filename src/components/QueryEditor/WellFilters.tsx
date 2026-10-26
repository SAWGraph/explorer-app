import type { WellFilters as WellFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { useWellClassifications } from '../../hooks/useDiscoveryQueries';
import { WELL_GROUP_SHORT_LABEL, wellStateOf } from '../../constants/wellClassifications';

interface WellFiltersProps {
  value?: WellFiltersType;
  onChange: (filters: WellFiltersType) => void;
  stateCode?: string;
}

function withCount(label: string, count?: number): string {
  return count && count > 0 ? `${label} (${count.toLocaleString()})` : label;
}

export function WellFilters({ value, onChange, stateCode }: WellFiltersProps) {
  const { data: classifications = [], isLoading } = useWellClassifications();

  // A chosen region state limits the visible groups to that state; with no
  // state chosen every group shows and each pick self-scopes to its state.
  const state = wellStateOf(stateCode);
  const visible = state ? classifications.filter((c) => c.state === state) : classifications;

  const options = visible.map((c) => ({
    value: c.key,
    label: withCount(c.label, c.count),
    group: state ? WELL_GROUP_SHORT_LABEL[c.field] : c.group,
  }));

  return (
    <div className="well-filters">
      <div className="filter-field">
        <label>Well classification:</label>
        <FlatSelect
          options={options}
          selectedValues={value?.wellCategories ?? []}
          onChange={(vals) => {
            const labels: Record<string, string> = {};
            for (const key of vals) {
              const c = classifications.find((cls) => cls.key === key);
              if (c) labels[key] = c.label;
            }
            onChange({ ...value, wellCategories: vals, wellCategoryLabels: labels });
          }}
          placeholder="All wells..."
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
