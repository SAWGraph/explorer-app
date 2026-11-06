import type { AnalysisQuestion, EntityBlock, SpatialRelationship } from './types/query';

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
export interface NormalisedQuestion {
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
  const { blockA, blockC, relationship } = question;
  const anchorIsA = relationship.type === 'upstream';
  const anchor = anchorIsA ? blockA : blockC;
  const target = anchorIsA ? blockC : blockA;
  return {
    relationship,
    anchor,
    target,
    targetIs: anchorIsA ? 'C' : 'A',
    anchorRegion: regionCodes(anchor),
    targetRegion: regionCodes(target),
  };
}

function regionCodes(block: EntityBlock): string[] | undefined {
  const region = block.region;
  if (region?.countyCodes?.length) return region.countyCodes;
  if (region?.stateCode) return [region.stateCode];
  return undefined;
}
