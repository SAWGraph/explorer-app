import type { WellFilters as WellFiltersType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface WellFiltersProps {
  value?: WellFiltersType;
  onChange: (filters: WellFiltersType) => void;
  stateCode?: string;
}

const WELL_TYPE_OPTIONS = [
  { value: 'ISGS-Well', label: 'Illinois Wells (ISGS)' },
  { value: 'MGS-Well', label: 'Maine Wells (MGS)' },
];

const WELL_TO_STATE: Record<string, { fips: string; stateName: string; sourceLabel: string }> = {
  'ISGS-Well': { fips: '17', stateName: 'Illinois', sourceLabel: 'Illinois Wells (ISGS)' },
  'MGS-Well': { fips: '23', stateName: 'Maine', sourceLabel: 'Maine Wells (MGS)' },
};

export function WellFilters({ value, onChange, stateCode }: WellFiltersProps) {
  const selected = value?.wellTypes ?? [];
  const mismatches = stateCode
    ? selected.filter((t) => WELL_TO_STATE[t] && WELL_TO_STATE[t].fips !== stateCode)
    : [];

  return (
    <div className="well-filters">
      <div className="filter-field">
        <label>Well Source:</label>
        <FlatSelect
          options={WELL_TYPE_OPTIONS}
          selectedValues={selected}
          onChange={(vals) => onChange({ ...value, wellTypes: vals })}
          placeholder="All wells..."
        />
        {mismatches.length > 0 && (
          <div className="filter-warning" role="alert">
            {mismatches.map((t) => (
              <div key={t}>
                {WELL_TO_STATE[t].sourceLabel} only exist in {WELL_TO_STATE[t].stateName} — the selected state will return no results.
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
