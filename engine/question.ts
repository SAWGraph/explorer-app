import type { AnalysisQuestion, EntityBlock, SpatialRelationship } from './types/query';
import { entityFor } from './entities';
import type { FilterSlot } from './entities/types';

// Stage 1 of a run: the question in the terms the rest of the engine works in.
//
// The fused queries start from the *anchor* and trace downstream to the
// *target*. Which block plays which role depends on the relationship:
//
//   A near C          anchor = C, target = A
//   A downstream of C anchor = C, target = A   (C is upstream of A)
//   A upstream of C   anchor = A, target = C   (A is the upstream end)
//
// So every trace runs downstream from the anchor, and nothing past this point
// needs a direction. Deciding it here, once, is the point: working it out again
// elsewhere is how "upstream" once answered the mirror question
// (docs/DEBUGGING.md, 2026-09-16) and how step labels named the wrong block.
// A near question joins neighbouring cells; a trace follows the river network.
export type QuestionKind = 'near' | 'trace';

export interface NormalisedQuestion {
  // `within` is in the type but never offered; the planner has always built it
  // as a trace, so it counts as one here. (cacheKey.ts still treats it as near
  // when it fills in default hops; changing that would change cache keys.)
  kind: QuestionKind;
  relationship: SpatialRelationship;
  anchor: EntityBlock;
  target: EntityBlock;
  // Which block of the question the target is (the anchor is the other one),
  // for step labels.
  targetIs: 'A' | 'C';
  // Region codes per role: the counties a block names, else its state.
  anchorRegion?: string[];
  targetRegion?: string[];
}

export function normalise(question: AnalysisQuestion): NormalisedQuestion {
  const { relationship } = question;
  const blockA = ownSlotOnly(question.blockA);
  const blockC = ownSlotOnly(question.blockC);
  const anchorIsA = relationship.type === 'upstream';
  const anchor = anchorIsA ? blockA : blockC;
  const target = anchorIsA ? blockC : blockA;
  return {
    kind: relationship.type === 'near' ? 'near' : 'trace',
    relationship,
    anchor,
    target,
    targetIs: anchorIsA ? 'C' : 'A',
    anchorRegion: regionCodes(anchor),
    targetRegion: regionCodes(target),
  };
}

const FILTER_SLOTS: FilterSlot[] = [
  'sampleFilters',
  'facilityFilters',
  'waterBodyFilters',
  'wellFilters',
  'aquiferFilters',
  'streamFilters',
];

// The block with only its own type's filter slot. A leftover slot (an older
// save, a published link) reaches no query; dropping it here means nothing
// past this point can read it, and the cache key ignores it too (cacheKey.ts).
export function ownSlotOnly(block: EntityBlock): EntityBlock {
  const own = entityFor(block.type).filterSlot;
  const out: EntityBlock = { ...block };
  for (const slot of FILTER_SLOTS) if (slot !== own) delete out[slot];
  return out;
}

function regionCodes(block: EntityBlock): string[] | undefined {
  const region = block.region;
  if (region?.countyCodes?.length) return region.countyCodes;
  if (region?.stateCode) return [region.stateCode];
  return undefined;
}
