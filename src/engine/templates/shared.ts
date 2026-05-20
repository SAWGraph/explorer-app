/**
 * Build a SPARQL clause that filters ?s2cell to one or more administrative regions.
 * Returns an empty string when no region codes are provided.
 * Pass a distinct `internalVar` when two region filters appear in the same query —
 * otherwise both would emit `VALUES ?_regionFilter` and shadow each other.
 */
export function buildRegionFilterClause(
  regionCodes?: string[],
  variable = '?s2cell',
  internalVar = '?_regionFilter',
): string {
  if (!regionCodes?.length) return '';
  if (regionCodes.length === 1) {
    return `${variable} spatial:connectedTo kwgr:administrativeRegion.USA.${regionCodes[0]} .`;
  }
  const values = regionCodes.map((c) => `kwgr:administrativeRegion.USA.${c}`).join(' ');
  return `VALUES ${internalVar} { ${values} }\n      ${variable} spatial:connectedTo ${internalVar} .`;
}
