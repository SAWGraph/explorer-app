import type { StreamFilters as StreamFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface StreamFiltersProps {
  value?: StreamFiltersType;
  onChange: (filters: StreamFiltersType) => void;
}

// NHDPlusV2 FTYPE values present on hyf:HY_FlowPath in hydrologykg.
const FTYPE_OPTIONS = [
  { value: 'StreamRiver', label: 'Stream / River' },
  { value: 'ArtificialPath', label: 'Artificial Path' },
  { value: 'CanalDitch', label: 'Canal / Ditch' },
  { value: 'Connector', label: 'Connector' },
  { value: 'Pipeline', label: 'Pipeline' },
];

export function StreamFilters({ value, onChange }: StreamFiltersProps) {
  return (
    <div className="stream-filters">
      <div className="filter-field">
        <label>Stream Type:</label>
        <FlatSelect
          options={FTYPE_OPTIONS}
          selectedValues={value?.ftypes ?? []}
          onChange={(vals) => onChange({ ...value, ftypes: vals })}
          placeholder="Any stream type..."
        />
      </div>
    </div>
  );
}
