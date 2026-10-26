import type { EntityType } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';
import { WELLS_UNAVAILABLE_HINT, stateHasWells } from '../../constants/wellClassifications';
import { DefinedTerm } from '../common/DefinedTerm';

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
        t.value === 'wells' ? { ...t, disabled: true, hint: WELLS_UNAVAILABLE_HINT } : t,
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
      {value === 'wells' && (
        <DefinedTerm term="wells">
          <svg className="defined-term-icon" width="16" height="16" viewBox="0 0 20 20" role="img" aria-label="About wells data">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 9v5M10 6.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </DefinedTerm>
      )}
    </div>
  );
}
