import type { AnalysisQuestion } from '../types/query';

export interface PrebuiltQuery {
  id: string;
  title: string;
  description: string;
  tags: string[];
  question: AnalysisQuestion;
}

export const PREBUILT_QUERIES: PrebuiltQuery[] = [
  {
    id: 'samples-near-agchem-maine',
    title: 'Samples Near Agricultural Chemical Facilities in Maine',
    description:
      'Find PFAS sample points located near pesticide, fertilizer, and agricultural chemical manufacturing facilities (NAICS 3253) across the state of Maine.',
    tags: ['Samples', 'Facilities', 'Near', 'Maine', 'NAICS 3253'],
    question: {
      blockA: {
        type: 'samples',
        region: { stateCode: '23' },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['3253'],
          industryLabels: { '3253': 'Pesticide, Fertilizer, and Other Agricultural Chemical Manufacturing' },
        },
      },
    },
  },
  {
    id: 'samples-near-landfill-dod-penobscot-knox',
    title: 'Samples Near Landfills & DOD Sites in Penobscot and Knox County',
    description:
      'Identify PFAS sample points near Solid Waste Landfills (NAICS 562212) and National Security / DOD facilities (NAICS 928110) in Penobscot and Knox counties, Maine.',
    tags: ['Samples', 'Facilities', 'Near', 'Penobscot', 'Knox', 'Landfill', 'DOD'],
    question: {
      blockA: {
        type: 'samples',
        region: { stateCode: '23', countyCodes: ['23019', '23013'], countyLabels: { '23019': 'Penobscot County, Maine', '23013': 'Knox County, Maine' } },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['562212', '928110'],
          industryLabels: {
            '562212': 'Solid Waste Landfill',
            '928110': 'National Security',
          },
        },
      },
    },
  },
  {
    id: 'waterbodies-near-landfill-dod-penobscot-knox',
    title: 'Surface Water Bodies Near Landfills & DOD Sites in Penobscot and Knox County',
    description:
      'Locate surface water bodies (lakes, ponds, reservoirs) near Solid Waste Landfills (NAICS 562212) and National Security / DOD facilities (NAICS 928110) in Penobscot and Knox counties, Maine.',
    tags: ['Surface Water Bodies', 'Facilities', 'Near', 'Penobscot', 'Knox', 'Landfill'],
    question: {
      blockA: {
        type: 'waterBodies',
        region: { stateCode: '23', countyCodes: ['23019', '23013'], countyLabels: { '23019': 'Penobscot County, Maine', '23013': 'Knox County, Maine' } },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['562212', '928110'],
          industryLabels: {
            '562212': 'Solid Waste Landfill',
            '928110': 'National Security',
          },
        },
      },
    },
  },
  {
    id: 'samples-downstream-waste-indiana',
    title: 'Samples Downstream of Waste Treatment Facilities in Indiana',
    description:
      'Trace downstream flow paths from Waste Treatment and Disposal facilities (NAICS 5622) in Indiana to find PFAS sample points in potentially affected areas.',
    tags: ['Samples', 'Facilities', 'Downstream', 'Indiana', 'Waste Treatment'],
    question: {
      blockA: {
        type: 'samples',
        region: { stateCode: '18' },
      },
      relationship: { type: 'downstream' },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['5622'],
          industryLabels: { '5622': 'Waste Treatment and Disposal' },
        },
      },
    },
  },
  {
    id: 'facilities-upstream-pfhpa-gw-cumberland',
    title: 'Facilities Upstream from PFHpA Groundwater Samples in Cumberland County',
    description:
      'Identify facilities located upstream of groundwater sample points that tested positive for PFHpA (10-1000 ng/L) in Cumberland County, Maine. Traces upstream hydrology flow paths.',
    tags: ['Facilities', 'Samples', 'Upstream', 'PFHpA', 'Groundwater', 'Cumberland'],
    question: {
      blockA: {
        type: 'samples',
        sampleFilters: {
          substances: ['http://w3id.org/sawgraph/v1/me-egad-data#parameter.PFHPA_A'],
          materialTypes: ['http://w3id.org/sawgraph/v1/me-egad-data#sampleMaterialType.GW'],
          minConcentration: 10,
          maxConcentration: 1000,
        },
        region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'Cumberland County, Maine' } },
      },
      relationship: { type: 'upstream' },
      blockC: {
        type: 'facilities',
      },
    },
  },
];
