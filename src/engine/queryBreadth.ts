import type { AnalysisQuestion, EntityBlock } from '../types/query';

// Detects filter combinations that consistently overwhelm the backend
// (statewide + broad industries + no substance filter), producing a 502
// from the sample-detail step before GROUP BY can collapse the join.
// Returns a one-line warning when the combination is risky, null otherwise.
export function assessQueryBreadth(question: AnalysisQuestion): string | null {
  const { blockA, blockC } = question;

  const samples = blockA.type === 'samples' ? blockA : blockC.type === 'samples' ? blockC : null;
  const facilities =
    blockA.type === 'facilities' ? blockA : blockC.type === 'facilities' ? blockC : null;
  if (!samples || !facilities) return null;

  if (samples.sampleFilters?.substances?.length) return null;

  if (hasCountyFilter(blockA) || hasCountyFilter(blockC)) return null;

  const codes = facilities.facilityFilters?.industryCodes ?? [];
  if (!codes.length) return null;

  const sectorCodes = codes.filter((c) => c.length <= 3);
  const allManufacturing =
    codes.includes('31') && codes.includes('32') && codes.includes('33');

  const tooBroad = allManufacturing || sectorCodes.length >= 2;
  if (!tooBroad) return null;

  return (
    'This combination (statewide scope, multiple broad industry sectors, ' +
    'no substance filter) often exceeds the backend timeout and returns ' +
    'a 502 error. Try narrowing by county, by a specific substance, or by ' +
    'a more specific NAICS subsector (e.g. 322 Paper, 325 Chemicals).'
  );
}

function hasCountyFilter(block: EntityBlock): boolean {
  return Boolean(block.region?.countyCodes?.length);
}
