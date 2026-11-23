import type { AquiferFilters as AquiferFiltersType, RegionFilter } from '../../../engine/types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { withCount } from './FlatSelect/withCount';
import { useOptionCounts } from '../../hooks/useDiscoveryQueries';

interface AquiferFiltersProps {
  value?: AquiferFiltersType;
  onChange: (filters: AquiferFiltersType) => void;
  region?: RegionFilter;
}

// Two meaningful choices; the query builder expands each to the raw (messy)
// source vocabulary. Surficial aquifers are the shallow, permeable, most
// contamination-vulnerable kind (~99% of the data).
const AQUIFER_TYPE_OPTIONS = [
  { value: 'surficial', label: 'Sand & gravel (surficial)' },
  { value: 'bedrock', label: 'Bedrock' },
];

export function AquiferFilters({ value, onChange, region }: AquiferFiltersProps) {
  const selected = value?.aquiferTypes ?? [];
  const { data: counts } = useOptionCounts('aquifers', region);
  const options = AQUIFER_TYPE_OPTIONS.map((o) => ({ ...o, label: withCount(o.label, counts?.[o.value]) }));

  return (
    <div className="aquifer-filters">
      <div className="filter-field">
        <label>Aquifer Type:</label>
        <FlatSelect
          options={options}
          selectedValues={selected}
          onChange={(vals) => onChange({ ...value, aquiferTypes: vals })}
          placeholder="All aquifers..."
        />
      </div>
    </div>
  );
}
