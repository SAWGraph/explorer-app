import type { AquiferFilters as AquiferFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface AquiferFiltersProps {
  value?: AquiferFiltersType;
  onChange: (filters: AquiferFiltersType) => void;
}

// Two meaningful choices; the query builder expands each to the raw (messy)
// source vocabulary. Surficial aquifers are the shallow, permeable, most
// contamination-vulnerable kind (~99% of the data).
const AQUIFER_TYPE_OPTIONS = [
  { value: 'surficial', label: 'Sand & gravel (surficial)' },
  { value: 'bedrock', label: 'Bedrock' },
];

export function AquiferFilters({ value, onChange }: AquiferFiltersProps) {
  const selected = value?.aquiferTypes ?? [];

  return (
    <div className="aquifer-filters">
      <div className="filter-field">
        <label>Aquifer Type:</label>
        <FlatSelect
          options={AQUIFER_TYPE_OPTIONS}
          selectedValues={selected}
          onChange={(vals) => onChange({ ...value, aquiferTypes: vals })}
          placeholder="All aquifers..."
        />
      </div>
    </div>
  );
}
