// NHDPlusV2 FTYPE options for the water body and stream filters. Shared by the
// editor dropdowns and the Analysis Question renderer so both say the same
// words for the same filter.
export interface FtypeOption {
  value: string;
  label: string;
}

export const WATER_BODY_FTYPES: FtypeOption[] = [
  { value: 'LakePond', label: 'Lake / Pond' },
  { value: 'SwampMarsh', label: 'Swamp / Marsh' },
  { value: 'Reservoir', label: 'Reservoir' },
];

// FTYPE values present on hyf:HY_FlowPath in hydrologykg.
export const STREAM_FTYPES: FtypeOption[] = [
  { value: 'StreamRiver', label: 'Stream / River' },
  { value: 'ArtificialPath', label: 'Artificial Path' },
  { value: 'CanalDitch', label: 'Canal / Ditch' },
  { value: 'Connector', label: 'Connector' },
  { value: 'Pipeline', label: 'Pipeline' },
];

// Feature Type tree for the Surface Water entry. One menu entry, two engine
// types: the parent that is ticked decides whether the block is waterBodies
// (hyf:HY_WaterBody) or streams (hyf:HY_FlowPath).
export type SurfaceWaterType = 'waterBodies' | 'streams';

export const SURFACE_WATER_GROUPS: {
  type: SurfaceWaterType;
  code: string;
  label: string;
  ftypes: FtypeOption[];
}[] = [
  {
    type: 'waterBodies',
    code: '__group:waterBodies',
    label: 'Surface Water Bodies',
    ftypes: WATER_BODY_FTYPES,
  },
  {
    type: 'streams',
    code: '__group:streams',
    label: 'Streams and Flowlines',
    ftypes: STREAM_FTYPES,
  },
];

// A whole parent is stored as no filter, so the query matches an unfiltered
// block exactly. Derived back into the parent code for display.
export function toSurfaceWaterCodes(type: SurfaceWaterType, ftypes: string[] = []): string[] {
  if (ftypes.length) return ftypes;
  return [SURFACE_WATER_GROUPS.find((g) => g.type === type)!.code];
}

// One parent at a time: when codes from both parents arrive, the one that is
// not the current type was just ticked, so it wins. Nothing ticked falls back to
// the default, Surface Water Bodies.
export function fromSurfaceWaterCodes(
  codes: string[],
  current: SurfaceWaterType,
): { type: SurfaceWaterType; ftypes: string[] } {
  const owns = (g: (typeof SURFACE_WATER_GROUPS)[number], code: string) =>
    code === g.code || g.ftypes.some((f) => f.value === code);
  const touched = SURFACE_WATER_GROUPS.filter((g) => codes.some((c) => owns(g, c)));
  const group = touched.find((g) => g.type !== current) ?? touched[0] ?? SURFACE_WATER_GROUPS[0];
  const mine = codes.filter((c) => owns(group, c));
  const whole = mine.includes(group.code) || group.ftypes.every((f) => mine.includes(f.value));
  return { type: group.type, ftypes: whole ? [] : mine };
}
