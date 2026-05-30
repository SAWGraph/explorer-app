import type { SampleFilters as SampleFiltersType, RegionFilter } from '../../types/query';
import {
  useSubstances,
  useMaterialTypes,
} from '../../hooks/useDiscoveryQueries';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface SampleFiltersProps {
  value?: SampleFiltersType;
  onChange: (filters: SampleFiltersType) => void;
  region?: RegionFilter;
}

function withCount(label: string, count?: number): string {
  return count && count > 0 ? `${label} (${count})` : label;
}

export function SampleFilters({ value, onChange, region }: SampleFiltersProps) {
  const { data: substances = [] } = useSubstances(region);
  const { data: materialTypes = [] } = useMaterialTypes(region);

  const substanceOptions = substances.map((s) => ({
    value: s.uri,
    label: withCount(s.shortLabel || s.label, s.count),
  }));
  const materialOptions = materialTypes.map((m) => ({
    value: m.uri,
    label: withCount(m.label, m.count),
  }));

  return (
    <div className='sample-filters'>
      <div className='filter-field'>
        <label>Substance:</label>
        <FlatSelect
          options={substanceOptions}
          selectedValues={value?.substances ?? []}
          onChange={(vals) => {
            const labels: Record<string, string> = {};
            for (const uri of vals) {
              const s = substances.find((sub) => sub.uri === uri);
              if (s) labels[uri] = s.shortLabel || s.label;
            }
            onChange({ ...value, substances: vals, substanceLabels: labels });
          }}
          placeholder='Any substance...'
        />
      </div>

      <div className='filter-field'>
        <label>Material:</label>
        <FlatSelect
          options={materialOptions}
          selectedValues={value?.materialTypes ?? []}
          onChange={(vals) => onChange({ ...value, materialTypes: vals })}
          placeholder='Any material type...'
        />
      </div>

      <div className='filter-row'>
        <div className='filter-field half'>
          <label>Min (ng/L):</label>
          <input
            type='number'
            min={0}
            step='any'
            value={value?.minConcentration ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                minConcentration: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder='Min'
          />
        </div>
        <div className='filter-field half'>
          <label>Max (ng/L):</label>
          <input
            type='number'
            min={0}
            step='any'
            value={value?.maxConcentration ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                maxConcentration: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder='Max'
          />
        </div>
      </div>

      <div className='filter-field'>
        <label className='filter-checkbox'>
          <input
            type='checkbox'
            checked={value?.includeNondetects !== false}
            onChange={(e) =>
              onChange({ ...value, includeNondetects: e.target.checked })
            }
          />
          <span>Include non-detects</span>
        </label>
      </div>
    </div>
  );
}
