import type { WaterBodyFilters as WaterBodyFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { WATER_BODY_FTYPES } from '../../constants/featureTypes';

interface WaterBodyFiltersProps {
  value?: WaterBodyFiltersType;
  onChange: (filters: WaterBodyFiltersType) => void;
}

export function WaterBodyFilters({ value, onChange }: WaterBodyFiltersProps) {
  return (
    <div className="waterbody-filters">
      <div className="filter-field">
        <label>Water Type:</label>
        <FlatSelect
          options={WATER_BODY_FTYPES}
          selectedValues={value?.ftypes ?? []}
          onChange={(vals) => onChange({ ...value, ftypes: vals })}
          placeholder="Any water type..."
        />
      </div>
    </div>
  );
}
