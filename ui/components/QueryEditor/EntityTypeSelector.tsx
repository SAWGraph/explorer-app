import type { EntityType } from '../../../engine/types/query';
import { FlatSelect, type FlatSelectOption } from './FlatSelect/FlatSelect';
import { stateHasWells } from '../../../engine/constants/wellClassifications';
import { InfoTip } from '../common/DefinedTerm';
import { GROUNDWATER_TYPES } from '../../../engine/question';

interface EntityTypeSelectorProps {
  value: EntityType;
  onChange: (type: EntityType) => void;
  stateCode?: string;
  // Groundwater-connected is the relationship: only point types can be picked.
  pointTypesOnly?: boolean;
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

export function EntityTypeSelector({ value, onChange, stateCode, pointTypesOnly = false }: EntityTypeSelectorProps) {
  const shown = value === 'streams' ? 'waterBodies' : value;
  const options = ENTITY_TYPES.map((t) => {
    if (t.disabled) return t;
    if (pointTypesOnly && !GROUNDWATER_TYPES.includes(t.value as EntityType)) {
      return { ...t, disabled: true, info: <InfoTip term="groundwaterConnected" /> };
    }
    if (t.value === 'wells' && !stateHasWells(stateCode)) {
      return { ...t, disabled: true, info: <InfoTip term="wells" /> };
    }
    return t;
  });
  return (
    <div className="entity-type-selector">
      <label>Type:</label>
      <FlatSelect
        options={options}
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
      {value === 'wells' && <InfoTip term="wells" />}
    </div>
  );
}
