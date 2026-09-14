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
  { value: '0', label: '0 miles' },
  { value: '1', label: '~1 mile' },
  { value: '2', label: '~2 miles' },
  { value: '3', label: '~3 miles' },
  { value: '4', label: '~4 miles' },
];

// Cumulative flowpath length cutoff. '' = unbounded (today's behavior).
const FLOW_DISTANCE_OPTIONS = [
  { value: '', label: 'Any distance' },
  { value: '5', label: 'Within 5 km of flow' },
  { value: '10', label: 'Within 10 km of flow' },
  { value: '30', label: 'Within 30 km of flow' },
  { value: '50', label: 'Within 50 km of flow' },
  { value: '100', label: 'Within 100 km of flow' },
];

export function RelationshipSelector({ value, onChange }: RelationshipSelectorProps) {
  const selected = RELATIONSHIP_TYPES.find((r) => r.value === value.type) || RELATIONSHIP_TYPES[0];
  const currentHops = value.hops ?? 1;

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
        {(value.type === 'downstream' || value.type === 'upstream') && (
          <FlatSelect
            options={FLOW_DISTANCE_OPTIONS}
            selectedValues={[value.maxDistanceKm ? String(value.maxDistanceKm) : '']}
            onChange={(vals) => {
              const km = vals[0] ? parseInt(vals[0]) : undefined;
              onChange({ ...value, maxDistanceKm: km });
            }}
            isMulti={false}
            isClearable={false}
            searchable={false}
            placeholder="Flow distance..."
          />
        )}
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
