import type { EntityType } from '../../types/query';
import { FlatSelect, type FlatSelectOption } from './FlatSelect/FlatSelect';

interface EntityTypeSelectorProps {
  value: EntityType;
  onChange: (type: EntityType) => void;
}

// Surface Water is one entry for two engine types. Its value is waterBodies,
// the default; Feature Type switches the block to streams.
const ENTITY_TYPES: FlatSelectOption[] = [
  { value: 'samples', label: 'Sample Results', group: 'Samples' },
  { value: 'facilities', label: 'Facilities', group: 'Features' },
  { value: 'waterBodies', label: 'Surface Water', group: 'Features' },
  { value: 'aquifers', label: 'Ground Water (Aquifers)', group: 'Features' },
  { value: 'wells', label: 'Wells', group: 'Features' },
  { value: '__soon:env', label: 'Coming soon', group: 'Environmental Variables', disabled: true },
  { value: '__soon:model', label: 'Coming soon', group: 'Model Output', disabled: true },
];

export function EntityTypeSelector({ value, onChange }: EntityTypeSelectorProps) {
  const shown = value === 'streams' ? 'waterBodies' : value;
  return (
    <div className="entity-type-selector">
      <label>Type:</label>
      <FlatSelect
        options={ENTITY_TYPES}
        selectedValues={[shown]}
        onChange={(vals) => {
          // Re-picking the current entry would reset its filters, and turn a
          // streams block back into water bodies.
          if (vals[0] && vals[0] !== shown) onChange(vals[0] as EntityType);
        }}
        isMulti={false}
        isClearable={false}
        searchable={false}
        placeholder="Select type..."
      />
    </div>
  );
}
