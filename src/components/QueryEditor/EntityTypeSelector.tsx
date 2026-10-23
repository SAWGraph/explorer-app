import type { EntityType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { WELLS_TYPE_DISABLED_REASON, stateHasWells } from '../../constants/wellClassifications';

interface EntityTypeSelectorProps {
  value: EntityType;
  onChange: (type: EntityType) => void;
  stateCode?: string;
}

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'samples', label: 'Samples' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'waterBodies', label: 'Surface Water Bodies' },
  { value: 'streams', label: 'Streams / Flowlines' },
  { value: 'wells', label: 'Wells' },
  { value: 'aquifers', label: 'Aquifers' },
];

export function EntityTypeSelector({ value, onChange, stateCode }: EntityTypeSelectorProps) {
  const options = stateHasWells(stateCode)
    ? ENTITY_TYPES
    : ENTITY_TYPES.map((t) =>
        t.value === 'wells' ? { ...t, disabled: true, title: WELLS_TYPE_DISABLED_REASON } : t,
      );

  return (
    <div className="entity-type-selector">
      <label>Type:</label>
      <FlatSelect
        options={options}
        selectedValues={[value]}
        onChange={(vals) => {
          if (vals[0]) onChange(vals[0] as EntityType);
        }}
        isMulti={false}
        isClearable={false}
        searchable={false}
        placeholder="Select type..."
      />
    </div>
  );
}
