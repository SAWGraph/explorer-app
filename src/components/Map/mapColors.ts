// ColorBrewer2.org palettes — centralized map color system
// See: https://github.com/SAWGraph/explorer-app/wiki/Design-System-References

// Water Features — Sequential Blues (6-class)
export const WATER_COLORS = {
  lightest: '#f1eef6',
  watershed: '#d0d1e6',
  mid: '#a6bddb',
  aquifer: '#74a9cf',
  flowline: '#2b8cbe',
  well: '#045a8d',
};

// Samples — Diverging PuOr (6-class)
export const SAMPLE_PUOR = [
  '#b35806', '#f1a340', '#fee0b6',
  '#d8daeb', '#998ec3', '#542788',
];
export const SAMPLE_DEFAULT = '#f1a340';

// Darker stroke colors for each PuOr class (pass 3:1 on all tile backgrounds)
export const SAMPLE_STROKE = [
  '#7a3c04', '#96600a', '#7a5a20',
  '#6b6d8a', '#5c4a8a', '#2e1558',
];
export const SAMPLE_STROKE_DEFAULT = '#96600a';

// Facilities — Sequential Reds (9-class)
export const FACILITY_REDS = [
  '#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a',
  '#ef3b2c', '#cb181d', '#a50f15', '#67000d',
];

// Facilities — Sequential Purples (9-class, secondary)
export const FACILITY_PURPLES = [
  '#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8',
  '#807dba', '#6a51a3', '#54278f', '#3f007d',
];

// NAICS → Reds mapping
export const INDUSTRY_COLOR_MAP: Record<string, string> = {
  '5622': '#cb181d',
  '3253': '#ef3b2c',
  '9281': '#fb6a4a',
  '3328': '#fc9272',
  '3221': '#fcbba1',
};
export const FACILITY_DEFAULT = '#cb181d';

// Darker stroke colors for each NAICS facility fill (pass 3:1 on all tile backgrounds)
export const INDUSTRY_STROKE_MAP: Record<string, string> = {
  '5622': '#7a0e11',
  '3253': '#8b1a12',
  '9281': '#9e3318',
  '3328': '#a04a2e',
  '3221': '#7a5040',
};
export const FACILITY_STROKE_DEFAULT = '#7a0e11';

// Region boundaries
export const REGION = { border: '#4a5568', fill: '#bdc3c7' };

// Log-scale breakpoints (ng/L) for PuOr 6-class mapping
const CONCENTRATION_BREAKS = [0, 10, 50, 100, 500, 5000];

export function getSampleRadius(maxConcentration: string | number | undefined): number {
  if (maxConcentration == null || maxConcentration === '') return 5;
  const val = typeof maxConcentration === 'string' ? parseFloat(maxConcentration) : maxConcentration;
  if (isNaN(val) || val < 10) return 5;
  if (val < 100) return 8;
  return 12;
}

function getSampleIndex(maxConcentration: string | number | undefined): number {
  if (maxConcentration == null || maxConcentration === '') return 1; // default index
  const val = typeof maxConcentration === 'string' ? parseFloat(maxConcentration) : maxConcentration;
  if (isNaN(val)) return 1;

  for (let i = CONCENTRATION_BREAKS.length - 1; i >= 0; i--) {
    if (val >= CONCENTRATION_BREAKS[i]) return i;
  }
  return 0;
}

export function getSampleColor(maxConcentration: string | number | undefined): string {
  return SAMPLE_PUOR[getSampleIndex(maxConcentration)] ?? SAMPLE_PUOR[SAMPLE_PUOR.length - 1];
}

export function getSampleStroke(maxConcentration: string | number | undefined): string {
  return SAMPLE_STROKE[getSampleIndex(maxConcentration)] ?? SAMPLE_STROKE[SAMPLE_STROKE.length - 1];
}
