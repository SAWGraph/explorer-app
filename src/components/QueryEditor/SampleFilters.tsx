import type { SampleFilters as SampleFiltersType } from '../../types/query';
import { useSubstances, useMaterialTypes } from '../../hooks/useDiscoveryQueries';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface SampleFiltersProps {
  value?: SampleFiltersType;
  onChange: (filters: SampleFiltersType) => void;
}

export function SampleFilters({ value, onChange }: SampleFiltersProps) {
  const { data: substances = [] } = useSubstances();
  const { data: materialTypes = [] } = useMaterialTypes();

  const substanceOptions = substances.map((s) => ({
    value: s.uri,
    label: s.shortLabel || s.label,
  }));
  const materialOptions = materialTypes.map((m) => ({ value: m.uri, label: m.label }));

  return (
    <div className="sample-filters">
      <div className="filter-field">
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
          placeholder="Any substance..."
        />
      </div>

      <div className="filter-field">
        <label>Material:</label>
        <FlatSelect
          options={materialOptions}
          selectedValues={value?.materialTypes ?? []}
          onChange={(vals) => onChange({ ...value, materialTypes: vals })}
          placeholder="Any material type..."
        />
      </div>

      <div className="filter-row">
        <div className="filter-field half">
          <label>Min (ng/L):</label>
          <input
            type="number"
            value={value?.minConcentration ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                minConcentration: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="Min"
          />
        </div>
        <div className="filter-field half">
          <label>Max (ng/L):</label>
          <input
            type="number"
            value={value?.maxConcentration ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                maxConcentration: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="Max"
          />
        </div>
      </div>
    </div>
  );
}
