import type {
  AnalysisQuestion,
  EntityBlock,
  SpatialRelationship,
  RegionFilter,
} from '../types/query';
import { ALL_US_STATES } from '../constants/regions';

export function generateQuestion(q: AnalysisQuestion): string {
  const entityA = describeEntity(q.blockA);
  const entityC = describeEntity(q.blockC);
  const rel = describeRelationship(q.relationship);
  const regionA = describeRegion(q.blockA.region);

  return `What ${entityA}${regionA} are ${rel} ${entityC}?`;
}

function describeEntity(block: EntityBlock): string {
  switch (block.type) {
    case 'samples': {
      const parts: string[] = [];
      if (block.sampleFilters?.substances?.length) {
        const labels = block.sampleFilters.substanceLabels ?? {};
        parts.push(
          block.sampleFilters.substances
            .map((uri) => labels[uri] || extractLabel(uri))
            .join('/'),
        );
      }
      if (block.sampleFilters?.materialTypes?.length) {
        parts.push(
          block.sampleFilters.materialTypes.map(extractLabel).join('/'),
        );
      }
      return parts.length ? `${parts.join(' ')} samples` : 'samples';
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
        const formatted = topLevel.map((code) =>
          labels[code] ? `${code} - ${labels[code]}` : code,
        );
        return `${formatted.join(', ')} facilities`;
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

function describeRegion(region?: RegionFilter): string {
  if (!region) return '';

  // Show county names if available, otherwise state name
  if (region.countyCodes?.length && region.countyLabels) {
    const countyNames = region.countyCodes
      .map((c) => region.countyLabels?.[c])
      .filter(Boolean);
    if (countyNames.length) return ` in ${countyNames.join(' & ')}`;
  }

  if (region.stateCode) {
    const state = ALL_US_STATES.find((s) => s.fips === region.stateCode);
    if (state) return ` in ${state.name}`;
  }

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
