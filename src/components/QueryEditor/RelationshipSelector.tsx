import type { SpatialRelationship } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface RelationshipSelectorProps {
  value: SpatialRelationship;
  onChange: (rel: SpatialRelationship) => void;
}

const RELATIONSHIP_TYPES: { value: SpatialRelationship['type']; label: string; description: string }[] = [
  { value: 'near', label: 'Near', description: '~1-2 km of the feature(s) below' },
  { value: 'downstream', label: 'Downstream of', description: 'downstream of the feature(s) below' },
  { value: 'upstream', label: 'Upstream from', description: 'upstream from the feature(s) below' },
];

export function RelationshipSelector({ value, onChange }: RelationshipSelectorProps) {
  const selected = RELATIONSHIP_TYPES.find((r) => r.value === value.type) || RELATIONSHIP_TYPES[0];

  return (
    <div className="relationship-selector block-card">
      <div className="block-header">
        <span className="block-label">Relationship</span>
      </div>
      <div className="relationship-content">
        <FlatSelect
          options={RELATIONSHIP_TYPES}
          selectedValues={[value.type]}
          onChange={(vals) => {
            if (vals[0]) onChange({ ...value, type: vals[0] as SpatialRelationship['type'] });
          }}
          isMulti={false}
          isClearable={false}
          placeholder="Select relationship..."
        />
        <span className="relationship-desc">{selected.description}</span>
      </div>
    </div>
  );
}
