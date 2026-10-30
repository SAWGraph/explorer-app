export interface SparqlBinding {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}

export interface SparqlResultSet {
  head: { vars: string[] };
  results: {
    bindings: Record<string, SparqlBinding>[];
  };
}

export type SparqlRow = Record<string, string>;
