import type { SpatialRelationship } from '../../types/query';

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
        <select
          value={value.type}
          onChange={(e) =>
            onChange({ ...value, type: e.target.value as SpatialRelationship['type'] })
          }
        >
          {RELATIONSHIP_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="relationship-desc">{selected.description}</span>
      </div>
    </div>
  );
}
