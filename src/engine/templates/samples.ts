import type { SampleFilters } from '../../types/query';

export function wrapUri(uri: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return `<${uri}>`;
  return uri;
}

const NG_PER_L_UNIT_URI = 'http://qudt.org/vocab/unit/NanoGM-PER-L';

// Binds ?numericResult, ?nonDetect and a single-valued ?result_value from
// qudt:quantityValue. coso:measurementValue is deliberately not used: it is
// multi-valued for non-detects, returning both "non-detect" and "non-quantified",
// which duplicates every non-detect row and makes MAX() return a string.
export function resultValueClauses(suffix = ''): string {
  return `OPTIONAL { ?result${suffix} qudt:quantityValue/qudt:numericValue ?numericResult${suffix} }
      OPTIONAL { ?result${suffix} qudt:quantityValue ?_qv${suffix} .
                 ?_qv${suffix} rdf:type coso:NonDetectQuantityValue .
                 BIND(true AS ?nonDetect${suffix}) }
      BIND(COALESCE(STR(?numericResult${suffix}),
             IF(BOUND(?nonDetect${suffix}), "non-detect", "non-quantified")) AS ?result_value${suffix})`;
}

// Emits the SPARQL fragment that filters by substance / material / concentration
// range. Requires the caller to bind ?result and ?unit, and to emit
// resultValueClauses() beforehand, which provides ?result_value and friends.
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

  if (hasRange) {
    clauses += `BIND(xsd:decimal(?numericResult${suffix}) as ?numericValue${suffix})\n      `;
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
    } else {
      clauses += `FILTER((${numericExpr}) || BOUND(?nonDetect${suffix}))\n      `;
    }
  } else if (excludeNondetects) {
    clauses += `FILTER(BOUND(?numericResult${suffix}))\n      `;
  }

  return clauses;
}
