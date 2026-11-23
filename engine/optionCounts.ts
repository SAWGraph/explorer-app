import type { EntityType } from './types/query';
import type { SparqlRow } from './types/sparql';
import { entityFor } from './entities';
import { parseWellToken } from './constants/wellClassifications';

// The rows of buildOptionCountQuery, keyed the way the type's dropdown keys
// its options: an FTYPE value, an aquifer option ('surficial', 'bedrock'), a
// bare NAICS code, or a well classification IRI (see wellTokenCount). Rows
// that share a key are summed: an aquifer has one type, so the raw values an
// option covers count different aquifers.
export function optionCountsFrom(type: EntityType, rows: SparqlRow[]): Record<string, number> {
  const keyOf = entityFor(type).options?.key ?? ((option: string) => option);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.option || !row.count) continue;
    const key = keyOf(row.option);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + Number(row.count);
  }
  return counts;
}

// A well classification entry stands for one or more IRIs (Illinois active and
// plugged twins share an entry), each well carrying one of them.
export function wellTokenCount(counts: Record<string, number>, token: string): number | undefined {
  const found = parseWellToken(token).uris.filter((uri) => uri in counts);
  if (!found.length) return undefined;
  return found.reduce((sum, uri) => sum + counts[uri], 0);
}
