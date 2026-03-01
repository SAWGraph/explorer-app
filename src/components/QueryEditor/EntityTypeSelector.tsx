import type { EntityType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface EntityTypeSelectorProps {
  value: EntityType;
  onChange: (type: EntityType) => void;
}

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'samples', label: 'Samples' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'waterBodies', label: 'Water Bodies' },
];

export function EntityTypeSelector({ value, onChange }: EntityTypeSelectorProps) {
  return (
    <div className="entity-type-selector">
      <label>Type:</label>
      <FlatSelect
        options={ENTITY_TYPES}
        selectedValues={[value]}
        onChange={(vals) => {
          if (vals[0]) onChange(vals[0] as EntityType);
        }}
        isMulti={false}
        isClearable={false}
        placeholder="Select type..."
      />
    </div>
  );
}
