/**
 * Build a SPARQL clause that filters ?s2cell to one or more administrative regions.
 * Returns an empty string when no region codes are provided.
 */
export function buildRegionFilterClause(regionCodes?: string[], variable = '?s2cell'): string {
  if (!regionCodes?.length) return '';
  if (regionCodes.length === 1) {
    return `${variable} spatial:connectedTo kwgr:administrativeRegion.USA.${regionCodes[0]} .`;
  }
  const values = regionCodes.map((c) => `kwgr:administrativeRegion.USA.${c}`).join(' ');
  return `VALUES ?_regionFilter { ${values} }\n      ${variable} spatial:connectedTo ?_regionFilter .`;
}
