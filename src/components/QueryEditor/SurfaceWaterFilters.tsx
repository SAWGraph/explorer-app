import { useState } from 'react';
import { HierarchicalSelect } from './HierarchicalSelect/HierarchicalSelect';
import type { TreeItem } from './HierarchicalSelect/useNaicsTree';
import {
  SURFACE_WATER_GROUPS,
  fromSurfaceWaterCodes,
  toSurfaceWaterCodes,
  type SurfaceWaterType,
} from '../../constants/featureTypes';

interface SurfaceWaterFiltersProps {
  type: SurfaceWaterType;
  ftypes?: string[];
  onChange: (type: SurfaceWaterType, ftypes: string[]) => void;
}

// Parents first, so buildTree sees each one before its children.
const ITEMS: TreeItem[] = SURFACE_WATER_GROUPS.flatMap((g) => [
  { code: g.code, label: g.label },
  ...g.ftypes.map((f) => ({ code: f.value, label: f.label, parent: g.code })),
]);

const PARENTS = SURFACE_WATER_GROUPS.map((g) => g.code);

export function SurfaceWaterFilters({ type, ftypes = [], onChange }: SurfaceWaterFiltersProps) {
  // Unticking everything shows an empty tree so a child can be picked next,
  // while the block already holds the default (Surface Water Bodies, any type).
  // Display only: the editor remounts after a run, showing the default it used.
  const [cleared, setCleared] = useState(false);
  // A block replaced from outside while empty shows what it now holds.
  const showEmpty = cleared && type === 'waterBodies' && !ftypes.length;

  return (
    <div className="surface-water-filters">
      <div className="filter-field">
        <label>Feature Type:</label>
        <HierarchicalSelect
          items={ITEMS}
          selectedCodes={showEmpty ? [] : toSurfaceWaterCodes(type, ftypes)}
          onChange={(codes) => {
            setCleared(codes.length === 0);
            const next = fromSurfaceWaterCodes(codes, type);
            onChange(next.type, next.ftypes);
          }}
          placeholder="None selected, Surface Water Bodies will be used"
          labelOnly
          selectAll={false}
          initiallyExpanded={PARENTS}
        />
      </div>
    </div>
  );
}
