import { parseWellToken } from '../../constants/wellClassifications';
import { wrapUri } from './samples';

// Default: all wells from both states.
function bothStates(w: string): string {
  return `{ ${w} rdf:type il_isgs:ISGS-Well } UNION { ${w} rdf:type me_mgs:MGS-Well }`;
}

// Build the well type/category WHERE fragment for a given well variable.
//
// Selection semantics (see issue #25):
//   - OR within a field   (VALUES over the picked IRIs)
//   - AND across Maine type + use   (both triple patterns on the same well)
//   - OR across states     (Illinois block UNION Maine block)
// Nothing selected => both states (unchanged default).
export function buildWellCategoryFilter(
  categories: string[] | undefined,
  wellVar: string,
): string {
  const w = wellVar;
  if (!categories?.length) return bothStates(w);

  const il: string[] = [];
  const meType: string[] = [];
  const meUse: string[] = [];
  for (const token of categories) {
    const { field, uris } = parseWellToken(token);
    if (field === 'ilPurpose') il.push(...uris);
    else if (field === 'meType') meType.push(...uris);
    else if (field === 'meUse') meUse.push(...uris);
  }
  if (!il.length && !meType.length && !meUse.length) return bothStates(w);

  // Unique var suffix so anchor/target sides in a fused query don't collide.
  const s = w.replace('?well', '');
  const values = (uris: string[]) => uris.map(wrapUri).join(' ');
  const blocks: string[] = [];

  if (il.length) {
    blocks.push(
      `{ ${w} rdf:type il_isgs:ISGS-Well . ${w} il_isgs:wellPurpose ?wp${s} . VALUES ?wp${s} { ${values(il)} } }`,
    );
  }
  if (meType.length || meUse.length) {
    const patterns: string[] = [`${w} rdf:type me_mgs:MGS-Well .`];
    if (meType.length)
      patterns.push(`${w} me_mgs:ofWellType ?wt${s} . VALUES ?wt${s} { ${values(meType)} } .`);
    if (meUse.length)
      patterns.push(`${w} me_mgs:hasUse ?wu${s} . VALUES ?wu${s} { ${values(meUse)} } .`);
    blocks.push(`{ ${patterns.join(' ').replace(/\s*\.\s*$/, '')} }`);
  }
  return blocks.join(' UNION ');
}
