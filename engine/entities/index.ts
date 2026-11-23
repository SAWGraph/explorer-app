import type { EntityType } from '../types/query';
import { aquifers } from './aquifers';
import { facilities } from './facilities';
import { samples } from './samples';
import { streams } from './streams';
import type { EntityModule } from './types';
import { waterBodies } from './waterBodies';
import { wells } from './wells';

export type { DetailsLoad, EntityModule, RegionMatch } from './types';
export { streamFtypeFilter } from './streams';

const MODULES: Record<EntityType, EntityModule> = { samples, facilities, waterBodies, wells, aquifers, streams };

export const ENTITY_TYPES = Object.keys(MODULES) as EntityType[];

export function entityFor(type: EntityType): EntityModule {
  return MODULES[type];
}
