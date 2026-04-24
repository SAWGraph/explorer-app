import type { SpatialRelationship } from '../../types/query';
import { FlatSelect } from './FlatSelect/FlatSelect';

interface RelationshipSelectorProps {
  value: SpatialRelationship;
  onChange: (rel: SpatialRelationship) => void;
}

const RELATIONSHIP_TYPES: { value: SpatialRelationship['type']; label: string; description: string }[] = [
  { value: 'near', label: 'Near', description: 'of the feature(s) below' },
  { value: 'downstream', label: 'Downstream of', description: 'downstream of the feature(s) below' },
  { value: 'upstream', label: 'Upstream from', description: 'upstream from the feature(s) below' },
];

const NEAR_DISTANCE_OPTIONS = [
  { value: '1', label: '~1.6 km' },
  { value: '2', label: '~3.2 km' },
  { value: '3', label: '~4.8 km' },
  { value: '4', label: '~6.4 km' },
];

export function RelationshipSelector({ value, onChange }: RelationshipSelectorProps) {
  const selected = RELATIONSHIP_TYPES.find((r) => r.value === value.type) || RELATIONSHIP_TYPES[0];
  const currentHops = value.hops || 1;

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
        {value.type === 'near' && (
          <FlatSelect
            options={NEAR_DISTANCE_OPTIONS}
            selectedValues={[String(currentHops)]}
            onChange={(vals) => {
              if (vals[0]) onChange({ ...value, hops: parseInt(vals[0]) });
            }}
            isMulti={false}
            isClearable={false}
            placeholder="Distance..."
          />
        )}
        <span className="relationship-desc">{selected.description}</span>
      </div>
    </div>
  );
}
