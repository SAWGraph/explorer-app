export const ENDPOINTS = {
  sawgraph: 'https://apps.okn.us/sawgraph/sparql',
  fiokg: 'https://apps.okn.us/fiokg/sparql',
  spatialkg: 'https://apps.okn.us/spatialkg/sparql',
  hydrologykg: 'https://apps.okn.us/hydrologykg/sparql',
  federation: 'https://apps.okn.us/federation/sparql',
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;
