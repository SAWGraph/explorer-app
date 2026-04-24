import { PREFIXES } from '../../constants/prefixes';
import { buildRegionFilterClause } from './shared';

export function buildRegionFilterQuery(
  s2ValuesString: string,
  regionCodes: string[]
): string {
  const regionClause = buildRegionFilterClause(regionCodes, '?s2neighbor');
  return `
    ${PREFIXES}
    SELECT ?s2cell WHERE {
      ${regionClause}
      VALUES ?s2neighbor { ${s2ValuesString} }
      ?s2neighbor kwg-ont:sfTouches | owl:sameAs ?s2cell .
    }
  `;
}

export function buildStrictRegionFilterQuery(
  s2ValuesString: string,
  regionCodes: string[]
): string {
  const regionClause = buildRegionFilterClause(regionCodes);
  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      VALUES ?s2cell { ${s2ValuesString} }
      ${regionClause}
    }
  `;
}

export function buildNearExpansionQuery(s2ValuesString: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      VALUES ?s2neighbor { ${s2ValuesString} }
      ?s2neighbor kwg-ont:sfTouches | owl:sameAs ?s2cell .
      ?s2cell rdf:type kwg-ont:S2Cell_Level13 .
    }
  `;
}

// Finds anchor S2 cells that touch any of the target S2 cells.
// Used after FIND_TARGET_ENTITIES to filter GET_ANCHOR_DETAILS to only
// anchors that are genuinely near the found targets (not all anchors).
export function buildAnchorFilterByTargetProximity(
  anchorS2ValuesString: string,
  targetS2ValuesString: string
): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?anchor WHERE {
      VALUES ?anchor { ${anchorS2ValuesString} }
      VALUES ?target { ${targetS2ValuesString} }
      ?anchor kwg-ont:sfTouches | owl:sameAs ?target .
    }
  `;
}

export function buildRegionBoundaryQuery(regionCode: string): string {
  return `
    ${PREFIXES}
    SELECT ?region ?regionName ?regionWKT WHERE {
      ?region kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.${regionCode} ;
              rdfs:label ?regionName ;
              geo:hasGeometry/geo:asWKT ?regionWKT .
    }
  `;
}
