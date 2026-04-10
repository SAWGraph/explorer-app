#!/usr/bin/env node
/**
 * WCAG contrast-ratio checker for SAWGraph Explorer.
 *
 * Checks:
 *  1. Map markers vs tile backgrounds  (WCAG 1.4.11 — 3:1 non-text)
 *  2. UI text on backgrounds            (WCAG 1.4.3  — 4.5:1 normal, 3:1 large)
 *  3. Buttons (white text on color)     (WCAG 1.4.3  — 4.5:1)
 *  4. Semantic tags                     (WCAG 1.4.3  — 4.5:1)
 */

// --- Helpers ---
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function printTable(title, entries, threshold) {
  const failures = entries.filter((e) => e.ratio < threshold);
  const passes = entries.filter((e) => e.ratio >= threshold);

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  ${title}  (threshold: ${threshold}:1)`);
  console.log(`${'═'.repeat(90)}`);

  if (failures.length > 0) {
    console.log(`\n  ❌ FAILURES (${failures.length}):\n`);
    console.log(
      '  ' +
        'Pair'.padEnd(45) +
        'FG'.padEnd(10) +
        'BG'.padEnd(10) +
        'Ratio'.padEnd(8) +
        'Need'
    );
    console.log('  ' + '-'.repeat(80));
    for (const f of failures) {
      console.log(
        '  ' +
          f.label.padEnd(45) +
          f.fg.padEnd(10) +
          f.bg.padEnd(10) +
          f.ratio.toFixed(2).padEnd(8) +
          threshold.toFixed(2)
      );
    }
  }

  if (passes.length > 0) {
    console.log(`\n  ✅ PASSES (${passes.length}):\n`);
    console.log(
      '  ' +
        'Pair'.padEnd(45) +
        'FG'.padEnd(10) +
        'BG'.padEnd(10) +
        'Ratio'
    );
    console.log('  ' + '-'.repeat(72));
    for (const p of passes) {
      console.log(
        '  ' +
          p.label.padEnd(45) +
          p.fg.padEnd(10) +
          p.bg.padEnd(10) +
          p.ratio.toFixed(2)
      );
    }
  }

  return { passed: passes.length, failed: failures.length };
}

// ============================================================
// 1. MAP MARKERS vs TILE BACKGROUNDS (3:1 non-text)
// ============================================================
const TILE_BG = [
  { name: 'Land (cream)', hex: '#f2efe9' },
  { name: 'Vegetation',   hex: '#c8df9f' },
  { name: 'Water (blue)', hex: '#aad3df' },
  { name: 'White',        hex: '#ffffff' },
];

const MARKERS = [
  // Samples — fill + new dark strokes
  { layer: 'Samples',             role: 'fill',   hex: '#f1a340' },
  { layer: 'Samples',             role: 'stroke', hex: '#96600a' },
  // Facilities — fill + new dark strokes
  { layer: 'Facilities default',  role: 'fill',   hex: '#cb181d' },
  { layer: 'Facilities default',  role: 'stroke', hex: '#7a0e11' },
  { layer: 'NAICS 5622',          role: 'fill',   hex: '#cb181d' },
  { layer: 'NAICS 5622',          role: 'stroke', hex: '#7a0e11' },
  { layer: 'NAICS 3253',          role: 'fill',   hex: '#ef3b2c' },
  { layer: 'NAICS 3253',          role: 'stroke', hex: '#8b1a12' },
  { layer: 'NAICS 9281',          role: 'fill',   hex: '#fb6a4a' },
  { layer: 'NAICS 9281',          role: 'stroke', hex: '#9e3318' },
  { layer: 'NAICS 3328',          role: 'fill',   hex: '#fc9272' },
  { layer: 'NAICS 3328',          role: 'stroke', hex: '#a04a2e' },
  { layer: 'NAICS 3221',          role: 'fill',   hex: '#fcbba1' },
  { layer: 'NAICS 3221',          role: 'stroke', hex: '#7a5040' },
  // Water Bodies — stroke darkened to #045a8d
  { layer: 'Water Bodies',        role: 'fill',   hex: '#a6bddb' },
  { layer: 'Water Bodies',        role: 'stroke', hex: '#045a8d' },
  // Wells
  { layer: 'Wells',               role: 'fill',   hex: '#74a9cf' },
  { layer: 'Wells',               role: 'stroke', hex: '#045a8d' },
  // Region Boundaries — stroke darkened to #4a5568
  { layer: 'Region Boundaries',   role: 'stroke', hex: '#4a5568' },
  { layer: 'Region Boundaries',   role: 'fill',   hex: '#bdc3c7' },
  // PuOr 6-class fills
  { layer: 'PuOr[0] 0 ng/L',     role: 'fill',   hex: '#b35806' },
  { layer: 'PuOr[1] 10 ng/L',    role: 'fill',   hex: '#f1a340' },
  { layer: 'PuOr[2] 50 ng/L',    role: 'fill',   hex: '#fee0b6' },
  { layer: 'PuOr[3] 100 ng/L',   role: 'fill',   hex: '#d8daeb' },
  { layer: 'PuOr[4] 500 ng/L',   role: 'fill',   hex: '#998ec3' },
  { layer: 'PuOr[5] 5000 ng/L',  role: 'fill',   hex: '#542788' },
  // PuOr 6-class strokes
  { layer: 'PuOr[0] 0 ng/L',     role: 'stroke', hex: '#7a3c04' },
  { layer: 'PuOr[1] 10 ng/L',    role: 'stroke', hex: '#96600a' },
  { layer: 'PuOr[2] 50 ng/L',    role: 'stroke', hex: '#7a5a20' },
  { layer: 'PuOr[3] 100 ng/L',   role: 'stroke', hex: '#6b6d8a' },
  { layer: 'PuOr[4] 500 ng/L',   role: 'stroke', hex: '#5c4a8a' },
  { layer: 'PuOr[5] 5000 ng/L',  role: 'stroke', hex: '#2e1558' },
];

const mapEntries = [];
for (const m of MARKERS) {
  for (const bg of TILE_BG) {
    mapEntries.push({
      label: `${m.layer} ${m.role} vs ${bg.name}`,
      fg: m.hex,
      bg: bg.hex,
      ratio: contrastRatio(m.hex, bg.hex),
    });
  }
}

// ============================================================
// 2. UI TEXT ON BACKGROUNDS (4.5:1 normal text)
// ============================================================
const uiTextEntries = [
  // Body text
  { label: 'Body text on white',                fg: '#2d3748', bg: '#ffffff' },
  { label: 'Body text on gray-50',              fg: '#2d3748', bg: '#f7fafc' },
  // Secondary / label text
  { label: 'Gray-700 on white',                 fg: '#4a5568', bg: '#ffffff' },
  { label: 'Gray-600 on white',                 fg: '#718096', bg: '#ffffff' },
  { label: 'Gray-500 on white',                 fg: '#718096', bg: '#ffffff' },
  { label: 'Gray-400 on white (muted)',         fg: '#a0aec0', bg: '#ffffff' },
  // Labels on tinted backgrounds
  { label: 'Gray-700 on gray-100',              fg: '#4a5568', bg: '#edf2f7' },
  { label: 'Gray-500 on gray-50',               fg: '#718096', bg: '#f7fafc' },
  { label: 'Primary-700 on primary-100',        fg: '#2b6cb0', bg: '#ebf8ff' },
  // Error / warning messages
  { label: 'Red-700 on red-100',                fg: '#9b2c2c', bg: '#fed7d7' },
  { label: 'Yellow-800 on yellow-100',          fg: '#744210', bg: '#fefcbf' },
  // Dashboard welcome text
  { label: 'Gray-700 on gray-50 (dashboard)',   fg: '#4a5568', bg: '#f7fafc' },
  // Query card text
  { label: 'Gray-800 on white (card title)',    fg: '#2d3748', bg: '#ffffff' },
  { label: 'Gray-700 on gray-50 (card desc)',   fg: '#4a5568', bg: '#f7fafc' },
  { label: 'Gray-500 on white (card meta)',     fg: '#718096', bg: '#ffffff' },
  // Pipeline strip
  { label: 'Gray-700 on white (pipeline)',      fg: '#4a5568', bg: '#ffffff' },
  { label: 'Red-700 on white (error pipeline)', fg: '#9b2c2c', bg: '#ffffff' },
  // Modal
  { label: 'Gray-800 on white (modal title)',   fg: '#2d3748', bg: '#ffffff' },
  { label: 'Gray-400 on white (close btn)',     fg: '#a0aec0', bg: '#ffffff' },
  // Dropdown
  { label: 'Gray-700 on white (dropdown)',      fg: '#4a5568', bg: '#ffffff' },
  { label: 'Gray-700 on gray-100 (dd hover)',   fg: '#4a5568', bg: '#edf2f7' },
  // Placeholders / disabled
  { label: 'Gray-400 on white (placeholder)',   fg: '#a0aec0', bg: '#ffffff' },
  { label: 'Gray-400 on gray-50 (pending)',     fg: '#a0aec0', bg: '#f7fafc' },
];

// ============================================================
// 3. BUTTONS — white text on colored background (4.5:1)
// ============================================================
const buttonEntries = [
  { label: 'btn-primary (white on primary-600)',   fg: '#ffffff', bg: '#3182ce' },
  { label: 'btn-primary hover (white on pri-700)', fg: '#ffffff', bg: '#2b6cb0' },
  { label: 'btn-view-more (white on indigo-600)',  fg: '#ffffff', bg: '#5a67d8' },
  { label: 'btn-view-more hover (white on ind-700)', fg: '#ffffff', bg: '#4c51bf' },
  { label: 'btn-secondary text on gray-100',       fg: '#4a5568', bg: '#edf2f7' },
  { label: 'btn-link (primary-600 on white)',       fg: '#3182ce', bg: '#ffffff' },
  { label: 'header-back (indigo-600 on white)',     fg: '#5a67d8', bg: '#ffffff' },
  { label: 'section-link (primary-600 on gray-50)', fg: '#3182ce', bg: '#f7fafc' },
];

// ============================================================
// 4. SEMANTIC TAGS — tag color as text/border on 12% tint (4.5:1)
// ============================================================
// Tags use: color: var(--tag-color); background: color-mix(tag-color 12%, transparent)
// Approximate the 12% tint against white
function tint12(hex) {
  const [r, g, b] = hexToRgb(hex);
  const tr = Math.round(r + (255 - r) * 0.88);
  const tg = Math.round(g + (255 - g) * 0.88);
  const tb = Math.round(b + (255 - b) * 0.88);
  return `#${tr.toString(16).padStart(2, '0')}${tg.toString(16).padStart(2, '0')}${tb.toString(16).padStart(2, '0')}`;
}

const TAGS = [
  { name: 'Facilities',  color: '#cb181d' },
  { name: 'Samples',     color: '#b35806' },
  { name: 'Water Bodies', color: '#2b8cbe' },
  { name: 'Near',        color: '#805ad5' },
  { name: 'Downstream',  color: '#d69e2e' },
  { name: 'Upstream',    color: '#dd6b20' },
];

const tagEntries = TAGS.map((t) => {
  const bg = tint12(t.color);
  return {
    label: `Tag "${t.name}" (${t.color} on ${bg})`,
    fg: t.color,
    bg,
    ratio: contrastRatio(t.color, bg),
  };
});

// Also check tag badge style (white text on solid color, used in design system page)
const tagBadgeEntries = TAGS.map((t) => ({
  label: `Badge "${t.name}" (white on ${t.color})`,
  fg: '#ffffff',
  bg: t.color,
  ratio: contrastRatio('#ffffff', t.color),
}));

// ============================================================
// Print all results
// ============================================================
console.log('\n🔍 SAWGraph Explorer — Full Contrast Audit\n');

const s1 = printTable('1. MAP MARKERS vs TILE BACKGROUNDS (WCAG 1.4.11 Non-text)', mapEntries, 3.0);
const s2 = printTable('2. UI TEXT ON BACKGROUNDS (WCAG 1.4.3 — AA Normal Text)', uiTextEntries.map(e => ({ ...e, ratio: contrastRatio(e.fg, e.bg) })), 4.5);
const s3 = printTable('3. BUTTONS (WCAG 1.4.3 — AA Normal Text)', buttonEntries.map(e => ({ ...e, ratio: contrastRatio(e.fg, e.bg) })), 4.5);
const s4 = printTable('4a. SEMANTIC TAGS (text on 12% tint)', tagEntries, 4.5);
const s5 = printTable('4b. SEMANTIC TAG BADGES (white on solid)', tagBadgeEntries, 4.5);

// Grand summary
const totalPassed = s1.passed + s2.passed + s3.passed + s4.passed + s5.passed;
const totalFailed = s1.failed + s2.failed + s3.failed + s4.failed + s5.failed;

console.log(`\n${'═'.repeat(90)}`);
console.log(`  GRAND SUMMARY`);
console.log(`${'═'.repeat(90)}`);
console.log(`  Total checks:  ${totalPassed + totalFailed}`);
console.log(`  ✅ Passed:     ${totalPassed}`);
console.log(`  ❌ Failed:     ${totalFailed}`);
console.log(`${'═'.repeat(90)}\n`);
