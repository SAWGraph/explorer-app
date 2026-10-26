import type { EntityBlock as EntityBlockType } from '../../types/query';
import { EntityTypeSelector } from './EntityTypeSelector';
import { SampleFilters } from './SampleFilters';
import { FacilityFilters } from './FacilityFilters';
import { WellFilters } from './WellFilters';
import { AquiferFilters } from './AquiferFilters';
import { SurfaceWaterFilters } from './SurfaceWaterFilters';
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
      value.wellFilters?.wellCategories?.length ||
      value.aquiferFilters?.aquiferTypes?.length
    )
  );

  const handleTypeChange = (type: EntityBlockType['type']) => {
    onChange({
      type,
      region: value.region,
    });
  };

  const surfaceWaterType = value.type === 'waterBodies' || value.type === 'streams' ? value.type : null;

  return (
    <div className="entity-block block-card">
      <div className="block-header">
        <span className="block-label">{label}</span>
      </div>

      <EntityTypeSelector value={value.type} onChange={handleTypeChange} />

      {/* Not behind "+ Add Filters": Feature Type decides what gets queried. */}
      {surfaceWaterType && (
        <SurfaceWaterFilters
          type={surfaceWaterType}
          ftypes={(surfaceWaterType === 'streams' ? value.streamFilters : value.waterBodyFilters)?.ftypes}
          onChange={(type, ftypes) =>
            onChange({
              type,
              region: value.region,
              // A whole parent is no filter at all, matching a saved unfiltered
              // block, so the editor does not report a change that is none.
              ...(ftypes.length &&
                (type === 'streams' ? { streamFilters: { ftypes } } : { waterBodyFilters: { ftypes } })),
            })
          }
        />
      )}

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
          {value.type === 'wells' && (
            <WellFilters
              value={value.wellFilters}
              onChange={(f) => onChange({ ...value, wellFilters: f })}
              stateCode={value.region?.stateCode}
            />
          )}
          {value.type === 'aquifers' && (
            <AquiferFilters
              value={value.aquiferFilters}
              onChange={(f) => onChange({ ...value, aquiferFilters: f })}
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
        {!showFilters && !surfaceWaterType && (
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
