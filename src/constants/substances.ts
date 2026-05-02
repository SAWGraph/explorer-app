export interface Substance {
  uri: string;
  label: string;
  shortLabel?: string;
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
