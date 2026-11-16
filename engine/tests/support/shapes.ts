// The question shapes the editor can build, for the rule tests that loop over
// all of them. Groundwater-connected is offered between point types only
// (engine/question.ts GROUNDWATER_TYPES), and the planner refuses the rest, so
// the loops skip those pairs rather than plan them.
import { GROUNDWATER_TYPES } from '../../question';
import type { EntityType, SpatialRelationship } from '../../types/query';

export const ENTITY_TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];

// The relationships RelationshipSelector offers. 'within' is in the type union
// but is never selectable and never planned for.
export const RELATIONSHIPS: SpatialRelationship['type'][] = ['near', 'downstream', 'upstream', 'groundwaterConnected'];

export function offered(a: EntityType, rel: SpatialRelationship['type'], c: EntityType): boolean {
  if (rel !== 'groundwaterConnected') return true;
  return GROUNDWATER_TYPES.includes(a) && GROUNDWATER_TYPES.includes(c);
}

// 36 pairs for each of near, downstream and upstream, 9 point-type pairs for
// groundwater-connected.
export const SHAPE_COUNT = 36 * 3 + 9;
