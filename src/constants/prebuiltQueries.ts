import type { AnalysisQuestion } from '../types/query';

export interface PrebuiltQuery {
  id: string;
  title: string;
  description: string;
  tags: string[];
  question: AnalysisQuestion;
}

// Order matters: Dashboard.tsx renders the first four on the landing page and
// the rest behind "Explore More". Those four are deliberately four different
// question shapes — all three relationships, and wells, samples and streams as
// the thing being asked about — rather than four variations on "samples near
// facilities", which is what a reader took to be the whole tool.
export const PREBUILT_QUERIES: PrebuiltQuery[] = [
  // Demo set (Proto-OKN close-out): pinned to the top so they are the four
  // cards on the landing page. Their results and sample popups are prewarmed.
  // Remove this block after the demo to restore the ordering described above.
  {
    id: 'samples-near-airports-indiana',
    title: 'Samples Near Airport Facilities in Indiana',
    description:
      'Find PFAS sample points within roughly two miles of Other Airport Operations (NAICS 488119) and Scheduled Passenger Air Transportation (NAICS 481111) facilities across Indiana.',
    tags: ['Samples', 'Facilities', 'Near', 'Indiana', 'Airports'],
    question: {
      blockA: { type: 'samples', region: { stateCode: '18' } },
      relationship: { type: 'near', hops: 2 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['488119', '481111'],
          industryLabels: {
            '488119': 'Other Airport Operations',
            '481111': 'Scheduled Passenger Air Transportation',
          },
        },
      },
    },
  },
  {
    id: 'waterbodies-near-airports-indiana',
    title: 'Surface Water Bodies Near Airport Facilities in Indiana',
    description:
      'Locate surface water bodies within roughly a mile of Other Airport Operations (NAICS 488119) and Scheduled Passenger Air Transportation (NAICS 481111) facilities across Indiana.',
    tags: ['Surface Water Bodies', 'Facilities', 'Near', 'Indiana', 'Airports'],
    question: {
      blockA: { type: 'waterBodies', region: { stateCode: '18' } },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['488119', '481111'],
          industryLabels: {
            '488119': 'Other Airport Operations',
            '481111': 'Scheduled Passenger Air Transportation',
          },
        },
      },
    },
  },
  {
    id: 'facilities-upstream-pfos-york-cumberland',
    title: 'Facilities Upstream from PFOS Samples in York and Cumberland Counties',
    description:
      'Given samples that tested positive for PFOS in York and Cumberland counties, Maine, trace the river network back the other way: which facilities in those counties sit upstream, and are therefore candidate sources.',
    tags: ['Facilities', 'Samples', 'Upstream', 'PFOS', 'Maine', 'York', 'Cumberland'],
    question: {
      blockA: {
        type: 'facilities',
        region: {
          stateCode: '23',
          countyCodes: ['23031', '23005'],
          countyLabels: { '23031': 'York County, Maine', '23005': 'Cumberland County, Maine' },
        },
      },
      relationship: { type: 'upstream' },
      blockC: {
        // Both blocks carry the counties, as in the PFHpA question below: the
        // scope belongs to the samples, and mirroring it keeps the trace from
        // reaching every PFOS sample in the graph.
        type: 'samples',
        region: {
          stateCode: '23',
          countyCodes: ['23031', '23005'],
          countyLabels: { '23031': 'York County, Maine', '23005': 'Cumberland County, Maine' },
        },
        sampleFilters: {
          substances: ['http://w3id.org/DSSTox/v1/DTXSID3031864'],
          substanceLabels: { 'http://w3id.org/DSSTox/v1/DTXSID3031864': 'PFOS' },
        },
      },
    },
  },
  {
    id: 'samples-downstream-airports-indiana',
    title: 'Indiana Samples Downstream of Airports & Air Transportation Sites',
    description:
      'Trace downstream flow paths from Other Airport Operations (NAICS 488119) and Scheduled Passenger Air Transportation (NAICS 481111) facilities in Indiana to find PFAS sample points in potentially affected areas.',
    tags: ['Samples', 'Facilities', 'Downstream', 'Indiana', 'Airports'],
    question: {
      blockA: { type: 'samples', region: { stateCode: '18' } },
      relationship: { type: 'downstream' },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['488119', '481111'],
          industryLabels: {
            '488119': 'Other Airport Operations',
            '481111': 'Scheduled Passenger Air Transportation',
          },
        },
      },
    },
  },
  {
    id: 'facilities-upstream-pfhpa-gw-cumberland',
    title: 'Facilities Upstream from PFHpA Groundwater Contamination in Cumberland County',
    description:
      'Given groundwater that tested positive for PFHpA (10-1000 ng/L) in Cumberland County, Maine, trace the river network back the other way: which facilities in the county sit upstream of that contamination, and are therefore candidate sources.',
    tags: ['Facilities', 'Samples', 'Upstream', 'PFHpA', 'Groundwater', 'Cumberland'],
    question: {
      blockA: {
        type: 'facilities',
        region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'Cumberland County, Maine' } },
      },
      relationship: { type: 'upstream' },
      blockC: {
        type: 'samples',
        // Both blocks carry the county. The question this replaced scoped the
        // samples and left the facilities open; mirroring it moved the scope to
        // the facilities and left *samples* open, which asks the trace to reach
        // every PFHpA groundwater sample in the graph.
        region: { stateCode: '23', countyCodes: ['23005'], countyLabels: { '23005': 'Cumberland County, Maine' } },
        sampleFilters: {
          substances: ['http://w3id.org/DSSTox/v1/DTXSID1037303'],
          substanceLabels: { 'http://w3id.org/DSSTox/v1/DTXSID1037303': 'PFHpA' },
          materialTypes: ['http://w3id.org/sawgraph/v1/me-egad#sampleMaterialType.GW'],
          minConcentration: 10,
          maxConcentration: 1000,
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
    id: 'facilities-upstream-streams-cook',
    title: 'Chemical & Plastics Manufacturers Upstream from Streams in Cook County, IL',
    description:
      'Which Chemical Manufacturing (NAICS 325) and Plastics and Rubber Products Manufacturing (NAICS 326) facilities in Cook County, Illinois sit upstream of a stream, within 50 km of flow, and which reaches they drain into.',
    tags: ['Facilities', 'Streams', 'Upstream', 'Illinois', 'Cook', 'NAICS 325', 'NAICS 326', '50 km'],
    question: {
      blockA: {
        type: 'facilities',
        region: { stateCode: '17', countyCodes: ['17031'], countyLabels: { '17031': 'Cook County, Illinois' } },
        facilityFilters: {
          industryCodes: ['325', '326'],
          industryLabels: {
            '325': 'Chemical Manufacturing',
            '326': 'Plastics and Rubber Products Manufacturing',
          },
        },
      },
      relationship: { type: 'upstream', maxDistanceKm: 50 },
      blockC: {
        type: 'streams',
      },
    },
  },
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
    id: 'wells-near-landfill-dod-maine',
    title: 'Maine Private Wells Near Landfills & DoD Sites',
    description:
      'Locate Maine private wells (MGS) within proximity of Solid Waste Landfills (NAICS 562212) and National Security / DoD facilities (NAICS 928110) statewide. These are the two facility classes most often implicated in Maine PFAS investigations.',
    tags: ['Wells', 'Facilities', 'Near', 'Maine', 'Landfill', 'DoD'],
    question: {
      blockA: {
        type: 'wells',
        region: { stateCode: '23' },
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
    id: 'wells-near-wwtp-maine',
    title: 'Maine Private Wells Near Wastewater Treatment Facilities',
    description:
      'Identify Maine private wells (MGS) near sewage treatment facilities (NAICS 221320). Biosolid land-application from these POTWs is the dominant PFAS exposure pathway driving Maine well-sampling priorities.',
    tags: ['Wells', 'Facilities', 'Near', 'Maine', 'Wastewater', 'Biosolids'],
    question: {
      blockA: {
        type: 'wells',
        region: { stateCode: '23' },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: {
          industryCodes: ['221320'],
          industryLabels: { '221320': 'Sewage Treatment Facilities' },
        },
      },
    },
  },
];
