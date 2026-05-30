import type { EntityBlock as EntityBlockType } from '../../types/query';
import { EntityTypeSelector } from './EntityTypeSelector';
import { SampleFilters } from './SampleFilters';
import { FacilityFilters } from './FacilityFilters';
import { WaterBodyFilters } from './WaterBodyFilters';
import { WellFilters } from './WellFilters';
import { RegionSelector } from './RegionSelector';
import { useState } from 'react';

interface EntityBlockProps {
  label: React.ReactNode;
  value: EntityBlockType;
  onChange: (block: EntityBlockType) => void;
}

export function EntityBlock({ label, value, onChange }: EntityBlockProps) {
  const [showRegion, setShowRegion] = useState(!!value.region?.stateCode);
  const [showFilters, setShowFilters] = useState(
    !!(
      value.sampleFilters?.substances?.length ||
      value.sampleFilters?.materialTypes?.length ||
      value.facilityFilters?.industryCodes?.length ||
      value.waterBodyFilters?.ftypes?.length ||
      value.wellFilters?.wellTypes?.length
    )
  );

  const handleTypeChange = (type: EntityBlockType['type']) => {
    onChange({
      type,
      region: value.region,
    });
  };

  return (
    <div className="entity-block block-card">
      <div className="block-header">
        <span className="block-label">{label}</span>
      </div>

      <EntityTypeSelector value={value.type} onChange={handleTypeChange} />

      {showFilters && (
        <>
          {value.type === 'samples' && (
            <SampleFilters
              value={value.sampleFilters}
              onChange={(f) => onChange({ ...value, sampleFilters: f })}
              region={value.region}
            />
          )}
          {value.type === 'facilities' && (
            <FacilityFilters
              value={value.facilityFilters}
              onChange={(f) => onChange({ ...value, facilityFilters: f })}
              region={value.region}
            />
          )}
          {value.type === 'waterBodies' && (
            <WaterBodyFilters
              value={value.waterBodyFilters}
              onChange={(f) => onChange({ ...value, waterBodyFilters: f })}
            />
          )}
          {value.type === 'wells' && (
            <WellFilters
              value={value.wellFilters}
              onChange={(f) => onChange({ ...value, wellFilters: f })}
              stateCode={value.region?.stateCode}
            />
          )}
        </>
      )}

      {showRegion && (
        <RegionSelector
          value={value.region}
          onChange={(r) => onChange({ ...value, region: r })}
        />
      )}

      <div className="block-actions">
        {!showFilters && (
          <button className="btn-link" onClick={() => setShowFilters(true)}>
            + Add Filters
          </button>
        )}
        {!showRegion && (
          <button className="btn-link" onClick={() => setShowRegion(true)}>
            + Specify Region
          </button>
        )}
      </div>
    </div>
  );
}
