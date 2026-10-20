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
