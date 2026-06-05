// `suffix` (default '') is appended to the SPARQL variable names so this
// fragment can be reused inside fused queries where anchor and target sides
// need disambiguated vars (e.g. '?selectedIndustryA').
export function buildIndustryValues(codes?: string[], suffix = ''): string {
  if (!codes || codes.length === 0) return '';

  const iris = codes.map((code) => `naics:NAICS-${code}`).join(' ');
  const sel = `?selectedIndustry${suffix}`;
  const ic = `?industryCode${suffix}`;

  return `VALUES ${sel} { ${iris} }
      FILTER(${ic} = ${sel} || EXISTS { ${ic} fio:subcodeOf ${sel} })
      `;
}
