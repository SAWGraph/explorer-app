import { PREFIXES } from '../../constants/prefixes';
import { wrapUri } from './samples';

// Maps the UI's canonical aquifer-type kinds to the raw source vocabulary.
// The graph uses inconsistent labels across states (ME "sand and gravel" vs
// IL "coarse-grain_materials") — collapse them into two meaningful choices.
// ponytail: hardcoded map, revisit if the controlled-vocab cleanup lands upstream.
export const AQUIFER_TYPE_VALUES: Record<string, string[]> = {
  surficial: ['sand and gravel', 'coarse-grain_materials', 'sand_gravel'],
  bedrock: ['bedrock'],
};

// Aquifers have no geometry — they're only S2-cell collections — so this
// hydrate returns id + type for a results list, not map rendering. No ?s2cell
// join: a single aquifer touches up to ~69K cells.
export function buildAquifersByIri(aquiferIris: string[]): string {
  const vals = aquiferIris.map(wrapUri).join(' ');
  return `
    ${PREFIXES}
    SELECT DISTINCT ?aquifer ?aquiferType WHERE {
      VALUES ?aquifer { ${vals} }
      ?aquifer rdf:type gwml2:GW_Aquifer .
      OPTIONAL { ?aquifer saw_water:aquiferType ?aquiferType . }
    }
  `;
}
