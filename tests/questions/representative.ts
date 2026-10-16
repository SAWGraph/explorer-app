// One question per distinct code path in query generation, not one per
// combination the editor can build.
//
// The planner and templates branch on each block's type on its own, plus three
// special cases: streams on either side, the wells hydration path, and the
// anchor/target flip for `upstream`. Nothing branches on a particular pair. So
// each entity type has to appear once as block A and once as block C for each
// relationship, which this rotation does in 6 questions:
//
//   samples -> facilities -> waterBodies -> wells -> aquifers -> streams -> samples
//
// Two questions that differ only in which region they name (York vs Cumberland,
// Maine vs Illinois) produce the same SPARQL with a different code in it, so
// only one region is used throughout.
//
// The ceiling: if a change adds a branch on a particular pair (say wells near
// aquifers), the rotation will not cover it. Add that pair here when it does.
import type { AnalysisQuestion } from '../../src/types/query';

export interface NamedQuestion {
  name: string;
  question: AnalysisQuestion;
}

const ME = { stateCode: '23' };

export const REPRESENTATIVE: NamedQuestion[] = [
  // Rotation, near, region on block A.
  {
    name: 'samples near facilities',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'facilities near waterBodies',
    question: {
      blockA: { type: 'facilities', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'waterBodies' },
    },
  },
  {
    name: 'waterBodies near wells',
    question: {
      blockA: { type: 'waterBodies', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'wells' },
    },
  },
  {
    name: 'wells near aquifers',
    question: {
      blockA: { type: 'wells', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'aquifers' },
    },
  },
  {
    name: 'aquifers near streams',
    question: {
      blockA: { type: 'aquifers', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'streams' },
    },
  },
  {
    name: 'streams near samples',
    question: {
      blockA: { type: 'streams', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'samples' },
    },
  },

  // Rotation, downstream, region on block A.
  {
    name: 'samples downstream facilities',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'facilities downstream waterBodies',
    question: {
      blockA: { type: 'facilities', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'waterBodies' },
    },
  },
  {
    name: 'waterBodies downstream wells',
    question: {
      blockA: { type: 'waterBodies', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'wells' },
    },
  },
  {
    name: 'wells downstream aquifers',
    question: {
      blockA: { type: 'wells', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'aquifers' },
    },
  },
  {
    name: 'aquifers downstream streams',
    question: {
      blockA: { type: 'aquifers', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'streams' },
    },
  },
  {
    name: 'streams downstream samples',
    question: {
      blockA: { type: 'streams', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'samples' },
    },
  },

  // Rotation, upstream, region on block A.
  {
    name: 'samples upstream facilities',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'facilities upstream waterBodies',
    question: {
      blockA: { type: 'facilities', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'waterBodies' },
    },
  },
  {
    name: 'waterBodies upstream wells',
    question: {
      blockA: { type: 'waterBodies', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'wells' },
    },
  },
  {
    name: 'wells upstream aquifers',
    question: {
      blockA: { type: 'wells', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'aquifers' },
    },
  },
  {
    name: 'aquifers upstream streams',
    question: {
      blockA: { type: 'aquifers', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'streams' },
    },
  },
  {
    name: 'streams upstream samples',
    question: {
      blockA: { type: 'streams', region: ME },
      relationship: { type: 'upstream' },
      blockC: { type: 'samples' },
    },
  },

  // Region on block C. Which side carries the region decides which side is
  // constrained, which decides the join order.
  {
    name: 'samples near facilities [region on C]',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities', region: ME },
    },
  },
  {
    name: 'samples downstream facilities [region on C]',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities', region: ME },
    },
  },
  {
    name: 'samples upstream facilities [region on C]',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'upstream' },
      blockC: { type: 'facilities', region: ME },
    },
  },

  // Flow-distance bound. A bounded trace seeds an aggregate, so it is a
  // different query, not a filtered one.
  {
    name: 'samples downstream(30km) facilities',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'downstream', maxDistanceKm: 30 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'samples downstream(30km) facilities [region on C]',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'downstream', maxDistanceKm: 30 },
      blockC: { type: 'facilities', region: ME },
    },
  },
  {
    name: 'samples upstream(30km) facilities',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'upstream', maxDistanceKm: 30 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'samples upstream(30km) facilities [region on C]',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'upstream', maxDistanceKm: 30 },
      blockC: { type: 'facilities', region: ME },
    },
  },

  // One filter per entity type.
  {
    name: 'filter: samples (substance, material, concentration, no non-detects)',
    question: {
      blockA: {
        type: 'samples',
        region: ME,
        sampleFilters: {
          substances: ['http://sawgraph.spatialai.org/v1/pfas#PFHpA'],
          materialTypes: [
            'http://sawgraph.spatialai.org/v1/me-egad-data#Groundwater',
          ],
          minConcentration: 4,
          maxConcentration: 100,
          unit: 'ng/L',
          includeNondetects: false,
        },
      },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'filter: facilities (industry)',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        facilityFilters: { industryCodes: ['562212'] },
      },
    },
  },
  {
    name: 'filter: waterBodies (ftype)',
    question: {
      blockA: {
        type: 'waterBodies',
        region: ME,
        waterBodyFilters: { ftypes: ['390'] },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'filter: wells (category)',
    question: {
      blockA: {
        type: 'wells',
        region: ME,
        wellFilters: {
          wellCategories: ['meUse||http://example.org/use/Domestic'],
        },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'filter: aquifers (type)',
    question: {
      blockA: { type: 'wells', region: ME },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'aquifers',
        aquiferFilters: { aquiferTypes: ['bedrock'] },
      },
    },
  },
  {
    name: 'filter: streams (ftype)',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'downstream' },
      blockC: { type: 'streams', streamFilters: { ftypes: ['460'] } },
    },
  },

  // Region scope.
  {
    name: 'no region either side',
    question: {
      blockA: { type: 'samples' },
      relationship: { type: 'downstream' },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'county scope both sides',
    question: {
      blockA: {
        type: 'samples',
        region: { stateCode: '23', countyCodes: ['23019'] },
      },
      relationship: { type: 'near', hops: 1 },
      blockC: {
        type: 'facilities',
        region: { stateCode: '23', countyCodes: ['23005', '23019'] },
      },
    },
  },

  // Hop count changes the near clause.
  {
    name: 'near hops=0',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'near', hops: 0 },
      blockC: { type: 'facilities' },
    },
  },
  {
    name: 'near hops=2',
    question: {
      blockA: { type: 'samples', region: ME },
      relationship: { type: 'near', hops: 2 },
      blockC: { type: 'facilities' },
    },
  },
];
