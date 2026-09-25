import { useMemo } from 'react';
import type { SampleFilters as SampleFiltersType, RegionFilter } from '../../types/query';
import {
  useSubstances,
  useMaterialTypes,
} from '../../hooks/useDiscoveryQueries';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { HierarchicalSelect } from './HierarchicalSelect/HierarchicalSelect';

// Material types have no hierarchy of their own — discovery buckets each one into
// a coso:MaterialSample subclass. These synthetic parents make the bucket
// tickable and collapsible; they are expanded back to their children before
// anything is stored, so the SPARQL only ever sees real material-type URIs.
const GROUP_PREFIX = '__group:';

interface SampleFiltersProps {
  value?: SampleFiltersType;
  onChange: (filters: SampleFiltersType) => void;
  region?: RegionFilter;
}

function withCount(label: string, count?: number): string {
  return count && count > 0 ? `${label} (${count.toLocaleString()})` : label;
}

export function SampleFilters({ value, onChange, region }: SampleFiltersProps) {
  const { data: substances = [] } = useSubstances(region);
  const { data: materialTypes = [] } = useMaterialTypes(region);

  const substanceOptions = substances.map((s) => ({
    value: s.uri,
    label: withCount(s.shortLabel || s.label, s.count),
  }));
  const { materialItems, materialCounts, childrenByGroup } = useMemo(() => {
    const childrenByGroup = new Map<string, string[]>();
    const materialCounts: Record<string, number> = {};
    for (const m of materialTypes) {
      const group = GROUP_PREFIX + (m.group ?? 'Other');
      const kids = childrenByGroup.get(group) ?? [];
      kids.push(m.uri);
      childrenByGroup.set(group, kids);
      if (m.count) materialCounts[m.uri] = m.count;
    }
    // Groups first, so buildTree sees each parent before its children.
    const materialItems = [
      ...[...childrenByGroup.keys()].map((group) => ({
        code: group,
        label: group.slice(GROUP_PREFIX.length),
      })),
      ...materialTypes.map((m) => ({
        code: m.uri,
        label: m.label,
        parent: GROUP_PREFIX + (m.group ?? 'Other'),
      })),
    ];
    return { materialItems, materialCounts, childrenByGroup };
  }, [materialTypes]);

  // A fully selected group shows as one chip rather than N. Derived, never stored.
  const selectedMaterials = value?.materialTypes;
  const selectedMaterialCodes = useMemo(() => {
    const codes = [...(selectedMaterials ?? [])];
    const selected = new Set(codes);
    for (const [group, kids] of childrenByGroup) {
      if (kids.length > 0 && kids.every((uri) => selected.has(uri))) codes.push(group);
    }
    return codes;
  }, [selectedMaterials, childrenByGroup]);

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
        <HierarchicalSelect
          items={materialItems}
          selectedCodes={selectedMaterialCodes}
          onChange={(codes) => {
            const uris = codes.flatMap((code) =>
              code.startsWith(GROUP_PREFIX) ? childrenByGroup.get(code) ?? [] : [code],
            );
            const labels: Record<string, string> = {};
            for (const uri of uris) {
              const m = materialTypes.find((mat) => mat.uri === uri);
              if (m) labels[uri] = m.label;
            }
            onChange({ ...value, materialTypes: uris, materialTypeLabels: labels });
          }}
          placeholder='Any material type...'
          counts={materialCounts}
          labelOnly
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
