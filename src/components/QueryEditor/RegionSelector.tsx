import type { EntityType, RegionFilter } from '../../types/query';
import { ALL_US_STATES, AVAILABLE_STATE_FIPS } from '../../constants/regions';
import { stateHasWells } from '../../constants/wellClassifications';
import { useCounties } from '../../hooks/useDiscoveryQueries';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface RegionSelectorProps {
  value?: RegionFilter;
  onChange: (region: RegionFilter) => void;
  entityType?: EntityType;
}

export function RegionSelector({ value, onChange, entityType }: RegionSelectorProps) {
  const { data: counties = [], isLoading: countiesLoading } = useCounties(value?.stateCode);

  // The info icon next to Type explains why Wells greys out the other states.
  const stateOptions = ALL_US_STATES.map((s) => ({
    value: s.fips,
    label: `${s.name} (${s.abbreviation})`,
    disabled: !AVAILABLE_STATE_FIPS.has(s.fips) || (entityType === 'wells' && !stateHasWells(s.fips)),
  }));

  const countyOptions = counties.map((c) => ({
    value: c.code,
    label: c.name,
  }));

  return (
    <div className="region-selector">
      <div className="region-field">
        <label>State:</label>
        <FlatSelect
          options={stateOptions}
          selectedValues={value?.stateCode ? [value.stateCode] : []}
          onChange={(vals) =>
            onChange({
              ...value,
              stateCode: vals[0],
              countyCodes: undefined,
            })
          }
          isMulti={false}
          placeholder="Select state..."
        />
      </div>

      {value?.stateCode && (
        <div className="region-field">
          <label>County:</label>
          <FlatSelect
            options={countyOptions}
            selectedValues={value?.countyCodes ?? []}
            onChange={(vals) => {
              const labels: Record<string, string> = {};
              for (const c of counties) {
                if (vals.includes(c.code)) labels[c.code] = c.name;
              }
              onChange({
                ...value,
                countyCodes: vals,
                countyLabels: vals.length ? labels : undefined,
              });
            }}
            isMulti={true}
            isLoading={countiesLoading}
            placeholder="All counties..."
          />
        </div>
      )}
    </div>
  );
}
