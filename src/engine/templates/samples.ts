import type { SampleFilters } from '../../types/query';

export function wrapUri(uri: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return `<${uri}>`;
  return uri;
}

const NG_PER_L_UNIT_URI = 'http://qudt.org/vocab/unit/NanoGM-PER-L';

// Emits the SPARQL fragment that filters by substance / material / concentration
// range. Requires the caller to bind ?result, ?result_value, and ?unit before
// this fragment appears. `suffix` (default '') is appended to every variable
// so the same fragment can be used inside fused queries where anchor and
// target sides need disambiguated vars (e.g. '?resultC').
export function buildSampleFilterClauses(filters?: SampleFilters, suffix = ''): string {
  if (!filters) return '';
  let clauses = '';

  if (filters.substances?.length) {
    clauses += `VALUES ?substance${suffix} { ${filters.substances.map(wrapUri).join(' ')} }\n      `;
  }
  if (filters.materialTypes?.length) {
    clauses += `VALUES ?matType${suffix} { ${filters.materialTypes.map(wrapUri).join(' ')} }\n      `;
  }

  const hasRange =
    filters.minConcentration != null || filters.maxConcentration != null;
  const excludeNondetects = filters.includeNondetects === false;

  if (hasRange || excludeNondetects) {
    clauses += `OPTIONAL { ?result${suffix} qudt:quantityValue/qudt:numericValue ?numericResult${suffix} }\n      `;
    clauses += `OPTIONAL { ?result${suffix} qudt:enumeratedValue ?enumDetected${suffix} }\n      `;
  }

  if (hasRange) {
    clauses += `BIND(COALESCE(xsd:decimal(?numericResult${suffix}), xsd:decimal(?result_value${suffix})) as ?numericValue${suffix})\n      `;
    clauses += `VALUES ?unit${suffix} { <${NG_PER_L_UNIT_URI}> }\n      `;

    const numericChecks: string[] = [];
    if (filters.minConcentration != null) {
      numericChecks.push(`?numericValue${suffix} >= ${filters.minConcentration}`);
    }
    if (filters.maxConcentration != null) {
      numericChecks.push(`?numericValue${suffix} <= ${filters.maxConcentration}`);
    }
    const numericExpr = `BOUND(?numericValue${suffix}) && ${numericChecks.join(' && ')}`;

    if (excludeNondetects) {
      clauses += `FILTER(${numericExpr})\n      `;
      clauses += `FILTER(!BOUND(?enumDetected${suffix}))\n      `;
    } else {
      clauses += `FILTER((${numericExpr}) || BOUND(?enumDetected${suffix}))\n      `;
    }
  } else if (excludeNondetects) {
    clauses += `FILTER(!BOUND(?enumDetected${suffix}))\n      `;
  }

  return clauses;
}
