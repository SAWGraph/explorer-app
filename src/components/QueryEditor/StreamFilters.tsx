import type { StreamFilters as StreamFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { STREAM_FTYPES } from '../../constants/featureTypes';

interface StreamFiltersProps {
  value?: StreamFiltersType;
  onChange: (filters: StreamFiltersType) => void;
}

export function StreamFilters({ value, onChange }: StreamFiltersProps) {
  return (
    <div className="stream-filters">
      <div className="filter-field">
        <label>Stream Type:</label>
        <FlatSelect
          options={STREAM_FTYPES}
          selectedValues={value?.ftypes ?? []}
          onChange={(vals) => onChange({ ...value, ftypes: vals })}
          placeholder="Any stream type..."
        />
      </div>
    </div>
  );
}
