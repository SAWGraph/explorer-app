import type { EntityBlock } from './types/query';
import { entityFor } from './entities';

// Stage 2 of a run: how narrow each side of the question is.
//
// A side is constrained when the question already narrows it: a region, any
// entity filter, or an IRI pin from chunking. Unconstrained means "every
// facility in the graph", which is the side that must not lead the query.
// How narrow a side is, not whether it is narrowed at all. The seed walks
// outward from whichever side leads, so the question is always which of the two
// is *smaller*, and a boolean cannot answer it: an industry filter with no
// region says "constrained" while meaning every sewage plant in the country.
// Answering the boolean is what made "facilities upstream from PFOS samples in
// York" fail the moment an industry filter was added to block A, after the same
// question had just been fixed without one.
//
//   3  an IRI pin. The executor chose this slice; re-seeding from the other
//      side would throw the slice away.
//   2  a region. Bounded by geography at any level, and the graph is indexed
//      for it.
//   1  an entity filter only. Selective in kind, unbounded in extent.
//   0  nothing.
//
// Ties keep the anchor-first order, so this only ever changes cases where both
// sides are constrained at different levels. Every shape where one side was
// constrained and the other was not keeps the order it had.
export type SideRank = 0 | 1 | 2 | 3;

// What a side of a fused query carries: its block, the region codes it is held
// to, and the IRIs it is pinned to when the executor runs one slice.
export interface Side {
  block: EntityBlock;
  region?: string[];
  pins?: string[];
}

export function sideRank({ block, region, pins }: Side): SideRank {
  if (pins?.length) return 3;
  if (region?.length) return 2;
  return entityFor(block.type).isFiltered(block) ? 1 : 0;
}

// Which side a trace starts from: the narrower one, the anchor on a tie.
export function leadSide(anchor: Side, target: Side): 'anchor' | 'target' {
  return sideRank(target) > sideRank(anchor) ? 'target' : 'anchor';
}
