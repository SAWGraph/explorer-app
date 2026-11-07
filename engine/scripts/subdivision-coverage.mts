// Counts, for each entity type, how many entities have a subdivision link (a
// direct tie to the county subdivision they sit in, GLOSSARY.md). A region
// filter is exact only for a type that has them: wells got one in #96, the
// other types still trust the S2 cell, which lets in entities from across the
// county line. Issue #123.
//
//   npm run subdivision-coverage            # prints both grids as markdown
//
// Paste the output into the "Subdivision link coverage" section of
// docs/SCHEMA.md. Pure measurement, live, about 340 queries run one at a time
// (about 25 minutes).
//
// Two grids:
// - By state: linked vs unlinked in every state, the selectable ones first. A
//   linked entity
//   counts in the state its subdivision rolls up to; an unlinked one in the
//   state its S2 cell touches, the check the region filter uses today, so an
//   unlinked entity in a cell on a state line counts in both.
// - Combined: the whole graph, which also counts the entities with neither a
//   link nor a cell (unplaced) that no state can show.
import { executeSparql } from '../endpoint';
import { SparqlError } from '../errors';
import { PREFIXES } from '../constants/prefixes';
import { ALL_US_STATES, AVAILABLE_STATE_FIPS } from '../constants/regions';
import { entityFor } from '../entities';
import type { EntityType } from '../types/query';

interface CoverageType {
  type: EntityType;
  label: string;
  // Binds ?e to one entity of the type: the unit the map plots.
  pattern: string;
}

const TYPES: CoverageType[] = [
  { type: 'samples', label: 'Sample points', pattern: '?e a coso:SamplePoint .' },
  // Typed fio:Facility: 853,598 FRS records also carry an industry code
  // (2026-11-07), and counting them as facilities tripled the unplaced count.
  {
    type: 'facilities',
    label: 'Facilities',
    pattern: '?e a fio:Facility ; fio:ofIndustry ?_ic . ?_ic a naics:NAICS-IndustryCode .',
  },
  { type: 'waterBodies', label: 'Water bodies', pattern: '?e a hyf:HY_WaterBody .' },
  { type: 'wells', label: 'Wells', pattern: '{ ?e a il_isgs:ISGS-Well } UNION { ?e a me_mgs:MGS-Well }' },
  { type: 'aquifers', label: 'Aquifers', pattern: '?e a gwml2:GW_Aquifer .' },
  { type: 'streams', label: 'Stream flowlines', pattern: '?e a hyf:HY_FlowPath .' },
];

const SUBDIVISION_LINK = '?e spatial:connectedTo ?_sub . ?_sub a kwg-ont:AdministrativeRegion_3 .';
const COUNTY_LINK = '?e spatial:connectedTo ?_cty . ?_cty a kwg-ont:AdministrativeRegion_2 .';
// Facilities sit in their cell through sfContains, and 56,992 of them have no
// connectedTo to any cell (2026-11-07), so a cell link is either predicate.
const CELL_LINK = '?_cell spatial:connectedTo|kwg-ont:sfContains ?e . ?_cell a kwg-ont:S2Cell_Level13 .';
const stateIri = (fips: string): string => `kwgr:administrativeRegion.USA.${fips}`;

const queries = {
  // What the app can ever put on a map: the engine's own cell bind for the
  // type, no filters. Narrower than the graph: a sample point needs a
  // geometry and a connectedTo cell, a facility an sfContains cell.
  shown: (t: CoverageType) =>
    `?_cell rdf:type kwg-ont:S2Cell_Level13 . ${entityFor(t.type).bindInCell({ type: t.type }, '?_cell', '')}`,
  total: (t: CoverageType) => `${t.pattern}`,
  linked: (t: CoverageType) => `${t.pattern} ${SUBDIVISION_LINK}`,
  unplaced: (t: CoverageType) =>
    `${t.pattern} FILTER NOT EXISTS { ${SUBDIVISION_LINK} } FILTER NOT EXISTS { ${CELL_LINK} }`,
  countyOnly: (t: CoverageType) => `${t.pattern} ${COUNTY_LINK} FILTER NOT EXISTS { ${SUBDIVISION_LINK} }`,
  // The subdivision rolls up through its county to the state. One query per
  // type for every state: grouping is as fast as one state (5s for facilities).
  linkedByState: (t: CoverageType) =>
    `${t.pattern} ${SUBDIVISION_LINK} ?_sub kwg-ont:administrativePartOf+ ?state . ?state a kwg-ont:AdministrativeRegion_1 .`,
  // Per state: grouped, the facilities query took 94s, past the client's 60s.

  unlinkedIn: (t: CoverageType, fips: string) =>
    `?_cell spatial:connectedTo ${stateIri(fips)} . ${CELL_LINK} ${t.pattern} FILTER NOT EXISTS { ${SUBDIVISION_LINK} }`,
};

type Count = number | 'timed out' | 'error';

const RATE_LIMIT_WAIT_MS = 30_000;

// The endpoint's gateway throttles bursts with a 429 that says "rate limited"
// and asks for 30s. That one is backoff; any other 429 is QLever's 30s query
// timeout, which executeSparql already retried once.
async function count(where: string, variable = '?e', attempt = 0): Promise<Count> {
  const query = `${PREFIXES}\nSELECT (COUNT(DISTINCT ${variable}) AS ?n) WHERE { ${where} }`;
  try {
    const rows = await executeSparql('federation', query);
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    if (err instanceof SparqlError && err.status === 429 && /rate limited/i.test(err.detail) && attempt < 3) {
      process.stderr.write(`  rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000}s\n`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
      return count(where, variable, attempt + 1);
    }
    // A stall (no response in 60s) is not retried by executeSparql. Both
    // stalls in the 2026-11-07 run answered in under 7s when sent again.
    if (err instanceof SparqlError && err.kind === 'timeout' && err.status === 0 && attempt < 1) {
      process.stderr.write('  stalled, sending once more\n');
      return count(where, variable, attempt + 1);
    }
    process.stderr.write(`  ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof SparqlError && err.kind === 'timeout' ? 'timed out' : 'error';
  }
}

// Counts per state, keyed by FIPS. A state exists under a KWG and a Data
// Commons IRI; only the KWG one is kept.
async function countByState(where: string, attempt = 0): Promise<Map<string, number> | 'timed out' | 'error'> {
  const query = `${PREFIXES}\nSELECT ?state (COUNT(DISTINCT ?e) AS ?n) WHERE { ${where} } GROUP BY ?state`;
  try {
    const rows = await executeSparql('federation', query);
    const byFips = new Map<string, number>();
    for (const row of rows) {
      const fips = /administrativeRegion\.USA\.(\d{2})$/.exec(row.state ?? '')?.[1];
      if (fips) byFips.set(fips, Number(row.n));
    }
    return byFips;
  } catch (err) {
    if (err instanceof SparqlError && err.status === 429 && /rate limited/i.test(err.detail) && attempt < 3) {
      process.stderr.write(`  rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000}s\n`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
      return countByState(where, attempt + 1);
    }
    process.stderr.write(`  ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof SparqlError && err.kind === 'timeout' ? 'timed out' : 'error';
  }
}

const num = (n: Count): string => (typeof n === 'number' ? n.toLocaleString('en-US') : n);
const pct = (part: Count, whole: Count): string =>
  typeof part === 'number' && typeof whole === 'number' && whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '';

async function combinedGrid(): Promise<string> {
  const lines = [
    '| Type | Total | Linked | No link, S2 cell only | Unplaced | County link only | App can show |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const t of TYPES) {
    process.stderr.write(`combined: ${t.label}\n`);
    const total = await count(queries.total(t));
    const linked = await count(queries.linked(t));
    const unplaced = await count(queries.unplaced(t));
    const countyOnly = await count(queries.countyOnly(t));
    const shown = await count(queries.shown(t), entityFor(t.type).iriVar(''));
    const unlinked: Count =
      typeof total === 'number' && typeof linked === 'number' && typeof unplaced === 'number'
        ? total - linked - unplaced
        : 'error';
    const cell = (n: Count) => `${num(n)} ${pct(n, total) && `(${pct(n, total)})`}`.trim();
    lines.push(`| ${t.label} | ${num(total)} | ${cell(linked)} | ${cell(unlinked)} | ${cell(unplaced)} | ${cell(countyOnly)} | ${cell(shown)} |`);
  }
  return lines.join('\n');
}

// The 50 states plus DC, which has facilities (1,765 located by cell only).
const STATES = [...ALL_US_STATES, { fips: '11', name: 'District of Columbia', abbreviation: 'DC' }];

async function stateGrids(): Promise<{ selectable: string; other: string }> {
  const linked = new Map<string, Awaited<ReturnType<typeof countByState>>>();
  for (const t of TYPES) {
    process.stderr.write(`by state, linked: ${t.label}\n`);
    linked.set(t.label, await countByState(queries.linkedByState(t)));
  }
  const header = [
    `| State | ${TYPES.map((t) => t.label).join(' | ')} |`,
    `|---|${TYPES.map(() => '---:').join('|')}|`,
  ];
  const rows = new Map<string, string>();
  for (const s of STATES) {
    process.stderr.write(`by state, no link: ${s.name}\n`);
    const cells: string[] = [];
    for (const t of TYPES) {
      const byState = linked.get(t.label);
      const l: Count = byState instanceof Map ? (byState.get(s.fips) ?? 0) : (byState ?? 'error');
      const u = await count(queries.unlinkedIn(t, s.fips));
      if (l === 0 && u === 0) {
        cells.push('no data');
        continue;
      }
      const share = typeof l === 'number' && typeof u === 'number' ? pct(l, l + u) : '';
      cells.push(`${num(l)} / ${num(u)}${share ? ` (${share})` : ''}`);
    }
    rows.set(s.fips, `| ${s.name} | ${cells.join(' | ')} |`);
  }
  const pick = (selectable: boolean) =>
    [...header, ...STATES.filter((s) => AVAILABLE_STATE_FIPS.has(s.fips) === selectable).map((s) => rows.get(s.fips))].join('\n');
  return { selectable: pick(true), other: pick(false) };
}

const startedAt = Date.now();
const date = new Date().toISOString().slice(0, 10);
const combined = await combinedGrid();
const byState = await stateGrids();
const minutes = ((Date.now() - startedAt) / 60_000).toFixed(1);

console.log(`Measured ${date} on federation (${minutes} min).

**Combined**, the whole graph. Linked: at least one subdivision link. No link, S2 cell only: no subdivision link, located only by the S2 cell it sits in. Unplaced: neither. County link only: linked to a county but not to a subdivision (already counted in one of the middle columns). App can show: entities the engine's own cell bind for the type finds, so the most any question can put on the map.

${combined}

**By state**, linked / no link (share linked). An entity with no link counts in a state when its S2 cell touches that state, so one on a state line counts in both.

Selectable states:

${byState.selectable}

Other states (no state pick, but a side with no region can reach them):

${byState.other}`);
