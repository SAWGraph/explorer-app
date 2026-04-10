import { useNavigate } from 'react-router-dom';
import { LAYER_REGISTRY } from '../Map/layerStyles';
import {
  WATER_COLORS, SAMPLE_PUOR, SAMPLE_STROKE, FACILITY_REDS,
  FACILITY_PURPLES, INDUSTRY_STROKE_MAP, FACILITY_STROKE_DEFAULT,
} from '../Map/mapColors';
import './DesignSystem.css';

const COLOR_PALETTES = [
  {
    name: 'Gray',
    tokens: [
      { variable: '--color-gray-50', hex: '#f7fafc' },
      { variable: '--color-gray-100', hex: '#edf2f7' },
      { variable: '--color-gray-200', hex: '#e2e8f0' },
      { variable: '--color-gray-300', hex: '#cbd5e0' },
      { variable: '--color-gray-400', hex: '#a0aec0' },
      { variable: '--color-gray-500', hex: '#718096' },
      { variable: '--color-gray-600', hex: '#718096' },
      { variable: '--color-gray-700', hex: '#4a5568' },
      { variable: '--color-gray-800', hex: '#2d3748' },
      { variable: '--color-gray-900', hex: '#1a202c' },
    ],
  },
  {
    name: 'Primary (Blue)',
    tokens: [
      { variable: '--color-primary-100', hex: '#ebf8ff' },
      { variable: '--color-primary-200', hex: '#bee3f8' },
      { variable: '--color-primary-600', hex: '#3182ce' },
      { variable: '--color-primary-700', hex: '#2b6cb0' },
    ],
  },
  {
    name: 'Indigo (Accent)',
    tokens: [
      { variable: '--color-indigo-100', hex: '#ebf4ff' },
      { variable: '--color-indigo-300', hex: '#a3bffa' },
      { variable: '--color-indigo-600', hex: '#5a67d8' },
      { variable: '--color-indigo-700', hex: '#4c51bf' },
    ],
  },
  {
    name: 'Green',
    tokens: [
      { variable: '--color-green-50', hex: '#f0fff4' },
      { variable: '--color-green-200', hex: '#c6f6d5' },
      { variable: '--color-green-700', hex: '#2f855a' },
    ],
  },
  {
    name: 'Red (Error)',
    tokens: [
      { variable: '--color-red-100', hex: '#fed7d7' },
      { variable: '--color-red-300', hex: '#fc8181' },
      { variable: '--color-red-600', hex: '#e53e3e' },
      { variable: '--color-red-700', hex: '#9b2c2c' },
    ],
  },
  {
    name: 'Yellow (Warning)',
    tokens: [
      { variable: '--color-yellow-100', hex: '#fefcbf' },
      { variable: '--color-yellow-400', hex: '#ecc94b' },
      { variable: '--color-yellow-800', hex: '#744210' },
    ],
  },
];

const SEMANTIC_TAGS = [
  { variable: '--color-tag-facilities', hex: '#cb181d', label: 'Facilities' },
  { variable: '--color-tag-samples', hex: '#b35806', label: 'Samples' },
  { variable: '--color-tag-water-bodies', hex: '#2b8cbe', label: 'Water Bodies' },
  { variable: '--color-tag-near', hex: '#805ad5', label: 'Near' },
  { variable: '--color-tag-downstream', hex: '#d69e2e', label: 'Downstream' },
  { variable: '--color-tag-upstream', hex: '#dd6b20', label: 'Upstream' },
];

const INDUSTRY_COLORS = [
  { code: '5622', hex: '#cb181d', label: 'Waste Treatment & Disposal' },
  { code: '3253', hex: '#ef3b2c', label: 'Pesticide & Chemical Mfg' },
  { code: '9281', hex: '#fb6a4a', label: 'National Security' },
  { code: '3328', hex: '#fc9272', label: 'Coating & Engraving' },
  { code: '3221', hex: '#fcbba1', label: 'Pulp & Paper Mills' },
];

const MAP_COLORS = [
  { hex: '#f1a340', stroke: '#96600a', label: 'Samples', shape: 'circle' as const },
  { hex: '#cb181d', stroke: '#7a0e11', label: 'Facilities', shape: 'square' as const },
  { hex: '#a6bddb', stroke: '#045a8d', label: 'Water Bodies', shape: 'triangle' as const },
  { hex: '#74a9cf', stroke: '#045a8d', label: 'Wells', shape: 'circle' as const },
  { hex: '#4a5568', stroke: '#4a5568', label: 'Region Boundaries', shape: 'dashed-square' as const },
];

const COLORBREWER_PALETTES = [
  {
    name: 'Water Features (Sequential Blues)',
    colors: Object.values(WATER_COLORS),
  },
  {
    name: 'Sample Points (Diverging PuOr)',
    colors: SAMPLE_PUOR,
  },
  {
    name: 'Facilities (Sequential Reds)',
    colors: FACILITY_REDS,
  },
  {
    name: 'Facilities (Sequential Purples)',
    colors: FACILITY_PURPLES,
  },
];

const CONCENTRATION_SCALE = [
  { range: '0 ng/L', color: SAMPLE_PUOR[0] },
  { range: '10 ng/L', color: SAMPLE_PUOR[1] },
  { range: '50 ng/L', color: SAMPLE_PUOR[2] },
  { range: '100 ng/L', color: SAMPLE_PUOR[3] },
  { range: '500 ng/L', color: SAMPLE_PUOR[4] },
  { range: '5000+ ng/L', color: SAMPLE_PUOR[5] },
];

function ColorSwatch({ hex, label, variable }: { hex: string; label?: string; variable?: string }) {
  const isDark = isColorDark(hex);
  return (
    <div className="ds-swatch-wrapper">
      <div className="ds-swatch" style={{ backgroundColor: hex }}>
        <span className="ds-swatch-hex" style={{ color: isDark ? '#fff' : '#1a202c' }}>
          {hex}
        </span>
      </div>
      {variable && <span className="ds-swatch-var">{variable}</span>}
      {label && <span className="ds-swatch-label">{label}</span>}
    </div>
  );
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const TILE_BACKGROUNDS = [
  { name: 'Land (cream)', hex: '#f2efe9' },
  { name: 'Vegetation',   hex: '#c8df9f' },
  { name: 'Water (blue)', hex: '#aad3df' },
  { name: 'White',        hex: '#ffffff' },
];

interface ContrastEntry {
  layer: string;
  role: string;
  color: string;
  bg: string;
  bgName: string;
  ratio: number;
  pass: boolean;
}

function buildContrastEntries(): ContrastEntry[] {
  const markers: { layer: string; role: string; hex: string }[] = [
    { layer: 'Samples', role: 'stroke', hex: '#96600a' },
    { layer: 'Facilities', role: 'fill', hex: '#cb181d' },
    { layer: 'Facilities', role: 'stroke', hex: FACILITY_STROKE_DEFAULT },
    { layer: 'Water Bodies', role: 'stroke', hex: '#045a8d' },
    { layer: 'Wells', role: 'stroke', hex: '#045a8d' },
    { layer: 'Region Boundaries', role: 'stroke', hex: '#4a5568' },
  ];
  // Add NAICS strokes
  for (const [code, stroke] of Object.entries(INDUSTRY_STROKE_MAP)) {
    markers.push({ layer: `NAICS ${code}`, role: 'stroke', hex: stroke });
  }
  // PuOr strokes
  SAMPLE_STROKE.forEach((hex, i) => {
    markers.push({ layer: `PuOr[${i}]`, role: 'stroke', hex });
  });

  const entries: ContrastEntry[] = [];
  for (const m of markers) {
    for (const bg of TILE_BACKGROUNDS) {
      const ratio = contrastRatio(m.hex, bg.hex);
      entries.push({
        layer: m.layer,
        role: m.role,
        color: m.hex,
        bg: bg.hex,
        bgName: bg.name,
        ratio,
        pass: ratio >= 3.0,
      });
    }
  }
  return entries;
}

function MapShapeIcon({ shape, fill, stroke }: { shape: string; fill: string; stroke: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32">
      {shape === 'circle' && (
        <circle cx="16" cy="16" r="10" fill={fill} stroke={stroke} strokeWidth="2" />
      )}
      {shape === 'square' && (
        <rect x="5" y="5" width="22" height="22" rx="2" fill={fill} stroke={stroke} strokeWidth="2" />
      )}
      {shape === 'triangle' && (
        <polygon points="16,3 29,28 3,28" fill={fill} stroke={stroke} strokeWidth="2" />
      )}
      {shape === 'dashed-square' && (
        <rect
          x="5" y="5" width="22" height="22" rx="2"
          fill="none" stroke={stroke} strokeWidth="2" strokeDasharray="4,3"
        />
      )}
    </svg>
  );
}

function ContrastTable() {
  const entries = buildContrastEntries();
  const passed = entries.filter((e) => e.pass);
  const failed = entries.filter((e) => !e.pass);

  return (
    <div className="ds-contrast">
      <div className="ds-contrast-summary">
        <span className="ds-contrast-pass">{passed.length} passed</span>
        <span className="ds-contrast-fail">{failed.length} failed</span>
        <span className="ds-contrast-total">of {entries.length} checks</span>
      </div>
      <table className="ds-contrast-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Role</th>
            <th>Color</th>
            <th>Background</th>
            <th>Ratio</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className={e.pass ? '' : 'ds-contrast-row--fail'}>
              <td>{e.layer}</td>
              <td>{e.role}</td>
              <td>
                <span className="ds-contrast-chip" style={{ backgroundColor: e.color }} />
                {e.color}
              </td>
              <td>
                <span className="ds-contrast-chip" style={{ backgroundColor: e.bg }} />
                {e.bgName}
              </td>
              <td>{e.ratio.toFixed(2)}</td>
              <td>{e.pass ? 'Pass' : 'Fail'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DesignSystem() {
  const navigate = useNavigate();

  return (
    <div className="ds-page">
      <div className="ds-header">
        <button className="ds-back" onClick={() => navigate('/')}>&larr; Back to Dashboard</button>
        <h1>Design System</h1>
        <p className="ds-subtitle">Colors, legends, and visual tokens used across SAWGraph Explorer</p>
      </div>

      <div className="ds-content">
        {/* Color Palettes */}
        <section className="ds-section">
          <h2>Color Palettes</h2>
          {COLOR_PALETTES.map((palette) => (
            <div key={palette.name} className="ds-palette">
              <h3>{palette.name}</h3>
              <div className="ds-swatch-row">
                {palette.tokens.map((token) => (
                  <ColorSwatch key={token.variable} hex={token.hex} variable={token.variable} />
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Semantic Tag Colors */}
        <section className="ds-section">
          <h2>Semantic Tags</h2>
          <p className="ds-description">
            Entity and relationship type badges used in query cards and the editor.
          </p>
          <div className="ds-tag-grid">
            {SEMANTIC_TAGS.map((tag) => (
              <div key={tag.variable} className="ds-tag-item">
                <span className="ds-tag-badge" style={{ backgroundColor: tag.hex }}>
                  {tag.label}
                </span>
                <span className="ds-tag-meta">{tag.hex}</span>
                <span className="ds-tag-meta">{tag.variable}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Map Legends */}
        <section className="ds-section">
          <h2>Map Layer Legends</h2>
          <p className="ds-description">
            Shape and color conventions for each map layer type.
          </p>
          <div className="ds-legend-grid">
            {MAP_COLORS.map((item) => (
              <div key={item.label} className="ds-legend-item">
                <MapShapeIcon shape={item.shape} fill={item.hex} stroke={item.stroke} />
                <div className="ds-legend-info">
                  <span className="ds-legend-label">{item.label}</span>
                  <span className="ds-legend-hex">Fill: {item.hex} &middot; Stroke: {item.stroke}</span>
                </div>
              </div>
            ))}
          </div>

          <h3>Layer Registry</h3>
          <p className="ds-description">
            Inline legend SVGs from <code>layerStyles.ts</code>:
          </p>
          <div className="ds-layer-list">
            {LAYER_REGISTRY.map((layer) => (
              <div key={layer.key} className="ds-layer-item">
                <span dangerouslySetInnerHTML={{ __html: layer.legendSvg }} />
                <span className="ds-layer-label">{layer.label}</span>
                <span className="ds-layer-key">{layer.key}</span>
                <span className={`ds-layer-vis ${layer.defaultVisible ? 'visible' : 'hidden'}`}>
                  {layer.defaultVisible ? 'Visible' : 'Hidden'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ColorBrewer Map Palettes */}
        <section className="ds-section">
          <h2>ColorBrewer Map Palettes</h2>
          <p className="ds-description">
            Palettes sourced from <a href="https://colorbrewer2.org" target="_blank" rel="noopener noreferrer">ColorBrewer2.org</a> (Brewer, Harrower &amp; Penn State). Data conventions follow EPA and USGS standards.
          </p>
          {COLORBREWER_PALETTES.map((palette) => (
            <div key={palette.name} className="ds-palette">
              <h3>{palette.name}</h3>
              <div className="ds-swatch-row">
                {palette.colors.map((hex, i) => (
                  <ColorSwatch key={`${palette.name}-${i}`} hex={hex} />
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Concentration Scale */}
        <section className="ds-section">
          <h2>Concentration Scale (PuOr)</h2>
          <p className="ds-description">
            Sample points are colored by max PFAS concentration using log-scale breakpoints.
          </p>
          <div className="ds-swatch-row">
            {CONCENTRATION_SCALE.map((step) => (
              <ColorSwatch key={step.range} hex={step.color} label={step.range} />
            ))}
          </div>
        </section>

        {/* Facility Industry Colors */}
        <section className="ds-section">
          <h2>Facility Industry Colors</h2>
          <p className="ds-description">
            Facilities are color-coded by NAICS industry code prefix.
          </p>
          <div className="ds-industry-grid">
            {INDUSTRY_COLORS.map((item) => (
              <div key={item.code} className="ds-industry-item">
                <div className="ds-industry-swatch" style={{ backgroundColor: item.hex }} />
                <div className="ds-industry-info">
                  <span className="ds-industry-label">NAICS {item.code}</span>
                  <span className="ds-industry-desc">{item.label}</span>
                  <span className="ds-industry-hex">{item.hex}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="ds-section">
          <h2>Typography</h2>
          <div className="ds-type-list">
            {[
              { var: '--text-xs', size: '0.75rem', label: 'Extra Small' },
              { var: '--text-sm', size: '0.8rem', label: 'Small' },
              { var: '--text-base', size: '0.85rem', label: 'Base' },
              { var: '--text-md', size: '0.9rem', label: 'Medium' },
              { var: '--text-lg', size: '1rem', label: 'Large' },
              { var: '--text-xl', size: '1.1rem', label: 'Extra Large' },
              { var: '--text-2xl', size: '1.75rem', label: '2X Large' },
            ].map((t) => (
              <div key={t.var} className="ds-type-item" style={{ fontSize: t.size }}>
                <span className="ds-type-sample">Aa</span>
                <span className="ds-type-meta">
                  {t.label} &middot; {t.var} &middot; {t.size}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Spacing & Radii */}
        <section className="ds-section">
          <h2>Spacing</h2>
          <div className="ds-spacing-list">
            {[
              { var: '--space-xs', value: '0.25rem' },
              { var: '--space-sm', value: '0.5rem' },
              { var: '--space-md', value: '0.75rem' },
              { var: '--space-lg', value: '1rem' },
              { var: '--space-xl', value: '1.5rem' },
              { var: '--space-2xl', value: '2rem' },
              { var: '--space-3xl', value: '2.5rem' },
            ].map((s) => (
              <div key={s.var} className="ds-spacing-item">
                <div className="ds-spacing-bar" style={{ width: s.value }} />
                <span className="ds-spacing-meta">{s.var} &middot; {s.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows */}
        <section className="ds-section">
          <h2>Shadows</h2>
          <div className="ds-shadow-grid">
            <div className="ds-shadow-item" style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
              <span className="ds-shadow-label">--shadow-card</span>
              <span className="ds-shadow-value">0 1px 3px rgba(0,0,0,0.04)</span>
            </div>
            <div className="ds-shadow-item" style={{ boxShadow: '0 4px 12px rgba(90, 103, 216, 0.12)' }}>
              <span className="ds-shadow-label">--shadow-card-hover</span>
              <span className="ds-shadow-value">0 4px 12px rgba(90,103,216,0.12)</span>
            </div>
          </div>
        </section>

        {/* Contrast Checks */}
        <section className="ds-section">
          <h2>Contrast Ratio Checks</h2>
          <p className="ds-description">
            Map marker strokes are tested against dominant OpenStreetMap tile colors per{' '}
            <a href="https://webaim.org/resources/contrastchecker/" target="_blank" rel="noopener noreferrer">
              WCAG 2.1 SC 1.4.11
            </a>{' '}
            (Non-text Contrast). Minimum required ratio: <strong>3:1</strong>.
            Fill colors may not independently pass since strokes carry the contrast.
          </p>
          <ContrastTable />
        </section>
      </div>
    </div>
  );
}
