import type {
  AnalysisQuestion,
  EntityBlock,
  SpatialRelationship,
  RegionFilter,
  SampleFilters,
} from '../types/query';
import { ALL_US_STATES } from '../constants/regions';
import { NAICS_SECTOR_SHORT } from '../constants/naics';

export interface QuestionTotals {
  counties?: number;
  industries?: number;
  substances?: number;
  materialTypes?: number;
}

const LIST_THRESHOLD = 3;

export function generateQuestion(
  q: AnalysisQuestion,
  totals?: QuestionTotals,
): string {
  const entityA = describeEntity(q.blockA, totals);
  const entityC = describeEntity(q.blockC, totals);
  const rel = describeRelationship(q.relationship);
  const regionA = describeRegion(q.blockA.region, totals);

  return `What ${entityA}${regionA} are ${rel} ${entityC}?`;
}

// Returns either the joined list, a count summary ("N counties"), or an "all/any" phrase.
function summarize(
  items: string[],
  total: number | undefined,
  pluralNoun: string,
  singularNoun: string,
  listJoin: string,
  allWord: 'all' | 'any',
): string {
  if (total !== undefined && total > 0 && items.length === total) {
    return `${allWord} ${allWord === 'any' ? singularNoun : pluralNoun}`;
  }
  if (items.length > LIST_THRESHOLD) {
    return `${items.length} ${pluralNoun}`;
  }
  return items.join(listJoin);
}

function describeConcentration(f?: SampleFilters): string {
  if (!f) return '';
  const { minConcentration: min, maxConcentration: max, unit } = f;
  const u = unit ? ` ${unit}` : '';
  if (min !== undefined && max !== undefined) return ` (${min}-${max}${u})`;
  if (min !== undefined) return ` (above ${min}${u})`;
  if (max !== undefined) return ` (below ${max}${u})`;
  return '';
}

function describeEntity(block: EntityBlock, totals?: QuestionTotals): string {
  switch (block.type) {
    case 'samples': {
      const conc = describeConcentration(block.sampleFilters);
      const subs = block.sampleFilters?.substances ?? [];
      const mats = block.sampleFilters?.materialTypes ?? [];
      const subLabels = block.sampleFilters?.substanceLabels ?? {};
      const subItems = subs.map((uri) => subLabels[uri] || extractLabel(uri));
      const matItems = mats.map(extractLabel);

      const subAll =
        totals?.substances !== undefined &&
        totals.substances > 0 &&
        subItems.length === totals.substances;
      const matAll =
        totals?.materialTypes !== undefined &&
        totals.materialTypes > 0 &&
        matItems.length === totals.materialTypes;
      const subLong = subItems.length > LIST_THRESHOLD || subAll;
      const matLong = matItems.length > LIST_THRESHOLD || matAll;

      // Inline adjective form when both lists are short — preserves today's phrasing.
      if (!subLong && !matLong) {
        const parts: string[] = [];
        if (subItems.length) parts.push(subItems.join('/'));
        if (matItems.length) parts.push(matItems.join('/'));
        return (parts.length ? `${parts.join(' ')} samples` : 'samples') + conc;
      }

      // Postfix form for long/all selections — reads naturally.
      const clauses: string[] = [];
      if (subItems.length) {
        clauses.push(
          summarize(subItems, totals?.substances, 'substances', 'substance', '/', 'any'),
        );
      }
      if (matItems.length) {
        clauses.push(
          summarize(
            matItems,
            totals?.materialTypes,
            'material types',
            'material type',
            '/',
            'any',
          ),
        );
      }
      return (clauses.length ? `samples with ${clauses.join(' and ')}` : 'samples') + conc;
    }
    case 'facilities': {
      const codes = block.facilityFilters?.industryCodes;
      const labels = block.facilityFilters?.industryLabels ?? {};
      if (codes?.length) {
        // Show only top-level codes (no code is a prefix of another in the set)
        const codeSet = new Set(codes);
        const topLevel = codes.filter((code) => {
          for (let len = 1; len < code.length; len++) {
            if (codeSet.has(code.substring(0, len))) return false;
          }
          return true;
        });
        // "any industry" → bare 'facilities'. Compare pre-dedupe so all 20
        // NAICS roots still trigger this even though Manufacturing/Retail/
        // Transportation dedupe to fewer short labels.
        if (totals?.industries !== undefined && topLevel.length === totals.industries) {
          return 'facilities';
        }
        // Prefer curated short sector names; fall back to official label.
        const seen = new Set<string>();
        const displayLabels: string[] = [];
        for (const code of topLevel) {
          const label = NAICS_SECTOR_SHORT[code] ?? labels[code] ?? code;
          if (!seen.has(label)) {
            seen.add(label);
            displayLabels.push(label);
          }
        }
        const summary = summarize(
          displayLabels,
          undefined,
          'industries',
          'industry',
          ', ',
          'any',
        );
        return `${summary} facilities`;
      }
      return 'facilities';
    }
    case 'waterBodies':
      return 'surface water bodies';
    case 'wells':
      return 'wells';
  }
}

function describeRelationship(rel: SpatialRelationship): string {
  switch (rel.type) {
    case 'near': {
      const miles = rel.hops || 1;
      return `near (~${miles} mile${miles > 1 ? 's' : ''})`;
    }
    case 'downstream':
      return 'downstream of';
    case 'upstream':
      return 'upstream from';
    case 'within':
      return 'within';
  }
}

function describeRegion(region?: RegionFilter, totals?: QuestionTotals): string {
  if (!region) return '';

  const stateName = region.stateCode
    ? ALL_US_STATES.find((s) => s.fips === region.stateCode)?.name
    : undefined;

  if (region.countyCodes?.length && region.countyLabels) {
    const countyNames = region.countyCodes
      .map((c) => region.countyLabels?.[c])
      .filter((s): s is string => Boolean(s));
    if (countyNames.length) {
      const total = totals?.counties;
      if (total !== undefined && total > 0 && countyNames.length === total) {
        return stateName ? ` in all counties in ${stateName}` : ' in all counties';
      }
      if (countyNames.length > LIST_THRESHOLD) {
        return stateName
          ? ` in ${countyNames.length} counties in ${stateName}`
          : ` in ${countyNames.length} counties`;
      }
      return ` in ${countyNames.join(' & ')}`;
    }
  }

  if (stateName) return ` in ${stateName}`;
  return '';
}

function extractLabel(uri: string): string {
  // Extract the last part of a URI or prefixed name
  const lastDot = uri.lastIndexOf('.');
  const lastHash = uri.lastIndexOf('#');
  const lastSlash = uri.lastIndexOf('/');
  const pos = Math.max(lastDot, lastHash, lastSlash);
  return pos >= 0 ? uri.slice(pos + 1) : uri;
}
