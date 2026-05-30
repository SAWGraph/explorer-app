// `suffix` (default '') is appended to the SPARQL variable names so this
// fragment can be reused inside fused queries where anchor and target sides
// need disambiguated vars (e.g. '?industryGroupA').
export function buildIndustryValues(codes?: string[], suffix = ''): string {
  if (!codes || codes.length === 0) return '';

  const groups: string[] = [];
  const specifics: string[] = [];

  for (const code of codes) {
    if (code.length > 4) {
      specifics.push(`naics:NAICS-${code}`);
    } else {
      groups.push(`naics:NAICS-${code}`);
    }
  }

  let clause = '';
  if (groups.length > 0) {
    clause += `VALUES ?industryGroup${suffix} { ${groups.join(' ')} }\n      `;
  }
  if (specifics.length > 0) {
    clause += `VALUES ?industryCode${suffix} { ${specifics.join(' ')} }\n      `;
  }
  return clause;
}
