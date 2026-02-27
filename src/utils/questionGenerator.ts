import type { AnalysisQuestion, EntityBlock, SpatialRelationship, RegionFilter } from '../types/query';
import { US_STATES } from '../constants/regions';

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
        parts.push(block.sampleFilters.substances.map(extractLabel).join('/'));
      }
      if (block.sampleFilters?.materialTypes?.length) {
        parts.push(block.sampleFilters.materialTypes.map(extractLabel).join('/'));
      }
      return parts.length ? `${parts.join(' ')} samples` : 'samples';
    }
    case 'facilities': {
      const codes = block.facilityFilters?.industryCodes;
      if (codes?.length) {
        return `${codes.join(', ')} facilities`;
      }
      return 'facilities';
    }
    case 'waterBodies':
      return 'water bodies';
  }
}

function describeRelationship(rel: SpatialRelationship): string {
  switch (rel.type) {
    case 'near':
      // Each hop adds ~1-2km (touching S2 neighbors at Level 13)
      return `near (~${(rel.hops || 1) * 2}km)`;
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
  const parts: string[] = [];
  if (region.stateCode) {
    const state = US_STATES.find((s) => s.fips === region.stateCode);
    if (state) parts.push(state.name);
  }
  return parts.length ? ` in ${parts.join(', ')}` : '';
}

function extractLabel(uri: string): string {
  // Extract the last part of a URI or prefixed name
  const lastDot = uri.lastIndexOf('.');
  const lastHash = uri.lastIndexOf('#');
  const lastSlash = uri.lastIndexOf('/');
  const pos = Math.max(lastDot, lastHash, lastSlash);
  return pos >= 0 ? uri.slice(pos + 1) : uri;
}
