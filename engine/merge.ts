import type { SparqlRow } from './types/sparql';

// Stage 6 of a run: combine what the slices of one step returned, and pick out
// the IRIs later steps need.

export interface SliceMerger {
  readonly rows: SparqlRow[];
  add(sliceRows: SparqlRow[]): void;
}

// Slices can overlap (the same river reach is reached from several anchors),
// so rows merge as a set. Whole-row identity is the right key: for aggregate
// rows the GROUP BY key never spans slices (chunking always follows that key),
// so identical rows are genuine duplicates.
export function sliceMerger(): SliceMerger {
  const rows: SparqlRow[] = [];
  const seen = new Set<string>();
  return {
    rows,
    add(sliceRows) {
      for (const row of sliceRows) {
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    },
  };
}

// The entity IRIs a discovery step found, once each, in the order first seen.
// These are what the details and stream-lines steps load.
export function foundIris(rows: SparqlRow[]): string[] {
  const iris = new Set<string>();
  for (const r of rows) if (r.iri) iris.add(r.iri);
  return [...iris];
}
