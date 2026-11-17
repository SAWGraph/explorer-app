export interface Substance {
  uri: string;
  label: string;
  shortLabel?: string;
  count?: number;
}

// One naming rule for substances, used by both the filter dropdown and the
// sample popup. They disagreed before: the dropdown fell back to the source
// parameter's name while the popup did not, so the same substance showed as
// "10-H-Perfluorodecanoic acid" in the dropdown and as a bare "DTXSID10630918"
// in the popup.
//
// Most DSSTox substances carry their own labels, but 33 of the 172 in the graph
// carry none at all; every one of those is named by the source parameter that
// points at it with comptox:sameAsDSSToxSubstance. Nothing is left bare.
export interface SubstanceLabelParts {
  uri: string;
  // skos:altLabel on the DSSTox substance, the short form ("PFOS")
  shortLabel?: string;
  // rdfs:label on the DSSTox substance, the full chemical name
  label?: string;
  // rdfs:label on the source parameter that declares sameAsDSSToxSubstance
  paramLabel?: string;
}

// Some source parameters carry a superseded name of the form
// "<old name>***retired***use <current name>", which names its own replacement.
export function resolveRetired(label?: string): string | undefined {
  if (!label) return undefined;
  if (label.includes('***retired***use ')) return label.split('***retired***use ')[1].trim();
  return label.split('***retired***')[0].replace(/[\s\-,]+$/, '');
}

// Prefer the short form, then the full name, then the source parameter's name,
// and fall back to the DTXSID.
export function substanceLabel(parts: SubstanceLabelParts): string {
  return (
    parts.shortLabel ||
    parts.label ||
    resolveRetired(parts.paramLabel) ||
    parts.uri.split('/').pop() ||
    parts.uri
  );
}

// Fallback substances if discovery query fails (DSSTox URIs)
export const FALLBACK_SUBSTANCES: Substance[] = [
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID3031864', label: 'Perfluorooctanesulfonic acid', shortLabel: 'PFOS' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID8031865', label: 'Perfluorooctanoic acid', shortLabel: 'PFOA' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID1037303', label: 'Perfluoroheptanoic acid', shortLabel: 'PFHpA' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID7040150', label: 'Perfluorohexanesulfonic acid', shortLabel: 'PFHxS' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID8031863', label: 'Perfluorononanoic acid', shortLabel: 'PFNA' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID3031860', label: 'Perfluorodecanoic acid', shortLabel: 'PFDA' },
  { uri: 'http://w3id.org/DSSTox/v1/DTXSID5030030', label: 'Perfluorobutanesulfonic acid', shortLabel: 'PFBS' },
];
