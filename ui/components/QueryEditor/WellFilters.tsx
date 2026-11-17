import type { RegionFilter, WellFilters as WellFiltersType } from '../../../engine/types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { withCount } from './FlatSelect/withCount';
import { useOptionCounts, useWellClassifications } from '../../hooks/useDiscoveryQueries';
import { wellTokenCount } from '../../../engine/optionCounts';
import { WELL_GROUP_SHORT_LABEL, wellStateOf } from '../../../engine/constants/wellClassifications';

interface WellFiltersProps {
  value?: WellFiltersType;
  onChange: (filters: WellFiltersType) => void;
  region?: RegionFilter;
}

export function WellFilters({ value, onChange, region }: WellFiltersProps) {
  const { data: classifications = [], isLoading } = useWellClassifications();
  // The list's own counts are for the whole state; these are for the region.
  const { data: counts } = useOptionCounts('wells', region);

  // A chosen region state limits the visible groups to that state; with no
  // state chosen every group shows and each pick self-scopes to its state.
  const state = wellStateOf(region?.stateCode);
  const visible = state ? classifications.filter((c) => c.state === state) : classifications;

  const options = visible.map((c) => ({
    value: c.key,
    label: withCount(c.label, counts && wellTokenCount(counts, c.key)),
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
