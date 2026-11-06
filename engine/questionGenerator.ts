import { entityFor } from './entities';
import type { AnalysisQuestion, SpatialRelationship, RegionFilter } from './types/query';
import { ALL_US_STATES } from './constants/regions';
import { LIST_THRESHOLD, type QuestionTotals } from './entities/wording';

export type { QuestionTotals };

export function generateQuestion(
  q: AnalysisQuestion,
  totals?: QuestionTotals,
): string {
  // Each block in its type's own words (engine/entities/).
  const entityA = entityFor(q.blockA.type).describe(q.blockA, totals);
  const entityC = entityFor(q.blockC.type).describe(q.blockC, totals);
  const rel = describeRelationship(q.relationship);
  // Both regions narrow the query, so both are said, even when they match.
  const regionA = describeRegion(q.blockA.region, totals);
  const regionC = describeRegion(q.blockC.region, totals);

  return `What ${entityA}${regionA} are ${rel} ${entityC}${regionC}?`;
}

function describeRelationship(rel: SpatialRelationship): string {
  switch (rel.type) {
    case 'near': {
      // A level 13 S2 cell is about 1 mile corner to corner, so N hops
      // keeps every match within N+1 miles.
      const miles = (rel.hops ?? 1) + 1;
      return `within at most ${miles} mile${miles > 1 ? 's' : ''} of`;
    }
    case 'downstream':
      return rel.maxDistanceKm
        ? `within ${rel.maxDistanceKm} km downstream of`
        : 'downstream of';
    case 'upstream':
      return rel.maxDistanceKm
        ? `within ${rel.maxDistanceKm} km upstream from`
        : 'upstream from';
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
      const total = region.stateCode ? totals?.counties?.[region.stateCode] : undefined;
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
