import type { WaterBodyFilters as WaterBodyFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface WaterBodyFiltersProps {
  value?: WaterBodyFiltersType;
  onChange: (filters: WaterBodyFiltersType) => void;
}

const FTYPE_OPTIONS = [
  { value: 'StreamRiver', label: 'Stream / River' },
  { value: 'LakePond', label: 'Lake / Pond' },
  { value: 'Reservoir', label: 'Reservoir' },
  { value: 'Swamp', label: 'Swamp / Marsh' },
  { value: 'Estuary', label: 'Estuary' },
];

export function WaterBodyFilters({ value, onChange }: WaterBodyFiltersProps) {
  return (
    <div className="waterbody-filters">
      <div className="filter-field">
        <label>Water Type:</label>
        <FlatSelect
          options={FTYPE_OPTIONS}
          selectedValues={value?.ftypes ?? []}
          onChange={(vals) => onChange({ ...value, ftypes: vals })}
          placeholder="Any water type..."
        />
      </div>
    </div>
  );
}
