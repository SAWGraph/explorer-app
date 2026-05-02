import { PREFIXES } from '../../constants/prefixes';

export function buildDownstreamTraceQuery(s2ValuesString: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?upstream_flowline rdf:type hyf:HY_FlowPath ;
          spatial:connectedTo ?s2cellus ;
          hyf:downstreamFlowPathTC ?downstream_flowline .
      VALUES ?s2cellus { ${s2ValuesString} }
      ?s2cell spatial:connectedTo ?downstream_flowline ;
              rdf:type kwg-ont:S2Cell_Level13 .
    }
  `;
}

export function buildUpstreamTraceQuery(s2ValuesString: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?s2cell WHERE {
      ?downstream_flowline rdf:type hyf:HY_FlowPath ;
          spatial:connectedTo ?s2cellds .
      ?upstream_flowline hyf:downstreamFlowPathTC ?downstream_flowline .
      VALUES ?s2cellds { ${s2ValuesString} }
      ?s2cell spatial:connectedTo ?upstream_flowline ;
              rdf:type kwg-ont:S2Cell_Level13 .
    }
  `;
}

export function buildDownstreamFlowlineQuery(s2ValuesString: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName WHERE {
      VALUES ?s2cellus { ${s2ValuesString} }
      ?upstream_flowline rdf:type hyf:HY_FlowPath ;
          spatial:connectedTo ?s2cellus ;
          hyf:downstreamFlowPathTC ?flowline .
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
               nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
}

export function buildUpstreamFlowlineQuery(s2ValuesString: string): string {
  return `
    ${PREFIXES}
    SELECT DISTINCT ?flowline ?flowlineWKT ?fl_type ?streamName WHERE {
      VALUES ?s2cellds { ${s2ValuesString} }
      ?downstream_flowline rdf:type hyf:HY_FlowPath ;
          spatial:connectedTo ?s2cellds .
      ?flowline hyf:downstreamFlowPathTC ?downstream_flowline .
      ?flowline geo:hasGeometry/geo:asWKT ?flowlineWKT ;
               nhdplusv2:hasFTYPE ?fl_type .
      OPTIONAL { ?flowline rdfs:label ?streamName }
    }
  `;
}
