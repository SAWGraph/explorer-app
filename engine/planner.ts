import type { AnalysisQuestion, EntityBlock } from './types/query';
import type { EndpointKey } from './constants/endpoints';
import type { SparqlRow } from './types/sparql';
import { entityFor } from './entities';
import {
  buildFusedNearQuery,
  buildFusedHydrologyQuery,
  buildFusedFlowlineQuery,
  buildFusedWellQuery,
  buildEntityCountQuery,
} from './templates/fusedQueries';
import { buildRegionBoundaryQuery } from './templates/spatial';
import type { SparqlRunner } from './endpoint';
import { normalise, type QuestionKind } from './question';
import { divideDiscovery, divideIriList, irisFor, iriScopes, scopedRegions, type Scope } from './slicing';

// Reads the way the user chose it: these are the three labels in
// RELATIONSHIP_TYPES (ui/components/QueryEditor/RelationshipSelector.tsx).
// 'within' is in the type union but is never offered and never planned for.
const RELATIONSHIP_PREPOSITION: Record<AnalysisQuestion['relationship']['type'], string> = {
  near: 'near',
  downstream: 'downstream of',
  upstream: 'upstream from',
  within: 'within',
};

export type PipelineStepType =
  | 'COUNT_TARGET'
  | 'COUNT_ANCHOR'
  | 'FIND_TARGET_IRIS'
  | 'FIND_ANCHOR_IRIS'
  | 'HYDRATE_TARGET_BY_IRI'
  | 'HYDRATE_ANCHOR_BY_IRI'
  | 'GET_SAMPLE_DETAILS'
  | 'GET_FLOWLINE_GEOMETRIES'
  | 'GET_REGION_BOUNDARIES';

export interface PipelineStep {
  type: PipelineStepType;
  endpoint: EndpointKey;
  description: string;
  buildQuery: (context: PipelineContext, scope?: Scope) => string;
  // Pre-split before the first attempt. Only for steps that inline a list of
  // IRIs, where the list length is already known and a single request would
  // exceed the gateway's body limit.
  initialScopes?: (context: PipelineContext) => Scope[] | undefined;
  // Called when a scope fails with a splittable error. Returns smaller scopes,
  // or null when this step cannot be divided any further. `sparql` is the
  // executor's runner, for divisions that have to ask the graph first (probes).
  divide?: (
    context: PipelineContext,
    scope: Scope | undefined,
    sparql: SparqlRunner,
  ) => Promise<Scope[] | null>;
  // The steps that must be done before this one starts. The executor starts
  // every step whose wait is over, so a step with a short wait runs alongside
  // the others (decoration while the details load). A step the plan leaves out
  // counts as done: query-sweep runs one step on its own.
  after: PipelineStepType[];
  // Losing this step degrades the map but still leaves a usable answer.
  optional?: boolean;
  // Reuse the response for the rest of the session (immutable reference data).
  cache?: boolean;
  // Advice, not part of the answer: a failure is dropped (the step reports
  // skipped) and never fails the run or makes it partial, with chunking on or
  // off. Sent once, never retried or split. The counts.
  advisory?: boolean;
  // Stop waiting for this step's request after this long (the endpoint's own
  // limit is 60s). An advisory step that runs out is dropped.
  timeoutMs?: number;
  // A count step: which side it counts, and which block that side is.
  counts?: { side: 'target' | 'anchor'; block: 'A' | 'C' };
}

export interface PlanOptions {
  // Count both sides before discovery (plan decision 6). Default on.
  countSides?: boolean;
}

export interface PipelineContext {
  question: AnalysisQuestion;
  targetIris: string[];
  anchorIris: string[];
  results: Record<string, SparqlRow[]>;
  // What the count steps found, by side. Missing when a count was dropped or
  // not planned.
  counts?: { target?: number; anchor?: number };
}

// A count is advice: past this, the run goes on without it (decision 21).
// Measured live on 2026-11-06: 57 of 58 cold counts took 1.1s or less.
const COUNT_TIMEOUT_MS = 10_000;

interface FusedContext {
  anchorBlock: EntityBlock;
  targetBlock: EntityBlock;
  kind: QuestionKind;
  relationship: AnalysisQuestion['relationship'];
  anchorRegion?: string[];
  targetRegion?: string[];
}

function hydrateStep(
  block: EntityBlock,
  side: 'target' | 'anchor',
  fused: FusedContext,
  after: PipelineStepType[],
): PipelineStep {
  const type = side === 'target' ? 'HYDRATE_TARGET_BY_IRI' : 'HYDRATE_ANCHOR_BY_IRI';
  // How a type's details load, and from where, is the entity module's to say
  // (engine/entities/). Most load the IRIs discovery found, in request-size
  // chunks; wells re-derive their set server-side.
  const entity = entityFor(block.type);
  const { details } = entity;
  // "target"/"anchor" are planner concepts, and which block they name flips
  // between relationship types, so they have no business in a user-facing
  // label. Wells are the one case where this understates the work: their step
  // re-derives the whole set server-side rather than loading details of what
  // discovery found. The label describes what the step delivers, which is what
  // the progress strip is for.
  const description = `Loading details for ${entity.label}`;

  if (details.kind === 'rederive') {
    return {
      type,
      endpoint: details.endpoint,
      description,
      after,
      buildQuery: () =>
        buildFusedWellQuery({
          anchor: fused.anchorBlock,
          target: fused.targetBlock,
          kind: fused.kind,
          hops: fused.relationship.hops,
          maxDistanceKm: fused.relationship.maxDistanceKm,
          anchorRegion: fused.anchorRegion,
          targetRegion: fused.targetRegion,
          wellSide: side === 'target' ? 'target' : 'anchor',
        }),
      // A re-derived set has no IRI list to pre-split, and nothing to divide:
      // the query ignores the scope, so every "half" re-sent the identical
      // query until the 300s step budget ran out. #82's wells step spent 533s
      // that way before failing. It now fails on its first refusal.
    };
  }

  return {
    type,
    endpoint: details.endpoint,
    description,
    after,
    buildQuery: (ctx, scope) => details.buildQuery(irisFor(ctx, scope, side), block),
    initialScopes: (ctx) => iriScopes(side === 'target' ? ctx.targetIris : ctx.anchorIris, side),
    divide: async (ctx, scope) =>
      divideIriList(scope, side === 'target' ? ctx.targetIris : ctx.anchorIris, side),
  };
}

function buildFusedSteps(question: AnalysisQuestion, { countSides = true }: PlanOptions): PipelineStep[] {
  const { blockA, blockC } = question;

  // Which block is the anchor (where the trace starts) and which the target is
  // decided once, in engine/question.ts. Every trace runs downstream from the
  // anchor, so nothing here needs a direction.
  const oriented = normalise(question);
  const { relationship, anchor: anchorBlock, target: targetBlock } = oriented;
  const { anchorRegion, targetRegion } = oriented;

  const steps: PipelineStep[] = [];

  const buildIriQuery = (project: 'target' | 'anchor', scope?: Scope): string => {
    const shared = {
      anchor: anchorBlock,
      target: targetBlock,
      project,
      anchorIris: scope?.anchorIris,
      targetIris: scope?.targetIris,
      ...scopedRegions(scope, anchorRegion, targetRegion),
    };
    if (oriented.kind === 'near') {
      return buildFusedNearQuery({ ...shared, hops: relationship.hops ?? 1 });
    }
    return buildFusedHydrologyQuery({
      ...shared,
      maxDistanceKm: relationship.maxDistanceKm,
    });
  };

  // Splitting a discovery query is the Slice stage's call (slicing.ts).
  const divideFound = divideDiscovery({
    anchorBlock,
    targetBlock,
    anchorRegion,
    targetRegion,
    endpoint: 'federation',
  });

  // Both discovery steps are one fused query that resolves block A and block C
  // together, so a label naming only one side reads as though the other had not
  // been queried yet — which is exactly how it was reported. Name both, in the
  // words of the question the user asked ("What <A> are <rel> <C>?").
  //
  // Which step returns which block is not fixed: normalise() (engine/question.ts)
  // puts block A on the target side for near and downstream, and on the anchor
  // side for upstream. Key the label off the block the step returns, not
  // off its target/anchor role, or the upstream labels come out swapped.
  const prep = RELATIONSHIP_PREPOSITION[relationship.type];
  const aLabel = entityFor(blockA.type).label;
  const cLabel = entityFor(blockC.type).label;
  const findingA = `Finding ${aLabel} ${prep} ${cLabel}`;
  const findingC = `Finding ${cLabel} with ${aLabel} ${prep} them`;
  
  // The main steps (find, find, details, details) still run one at a time, in
  // this order: only decoration runs alongside (plan decision 12). Whether the
  // main steps can share the endpoint is for a sweep to measure first.
  // Both sides counted first, together. A side at 0 ends the run before any
  // discovery query (it has no answer), and the counts go into the advice when
  // the question is too big and into how a refused query is split.
  const counts: PipelineStepType[] = [];
  if (countSides) {
    const targetBlockName = oriented.targetIs;
    const anchorBlockName = oriented.targetIs === 'A' ? 'C' : 'A';
    const sides = [
      { side: 'target', type: 'COUNT_TARGET', block: targetBlock, region: targetRegion, name: targetBlockName },
      { side: 'anchor', type: 'COUNT_ANCHOR', block: anchorBlock, region: anchorRegion, name: anchorBlockName },
    ] as const;
    for (const { side, type, block, region, name } of sides) {
      steps.push({
        type,
        endpoint: 'federation',
        description: `Counting ${entityFor(block.type).label} in the ${name === 'A' ? 'first' : 'second'} block`,
        after: [],
        buildQuery: () => buildEntityCountQuery(block, region),
        cache: true,
        advisory: true,
        timeoutMs: COUNT_TIMEOUT_MS,
        counts: { side, block: name },
      });
      counts.push(type);
    }
  }

  steps.push({
    type: 'FIND_TARGET_IRIS',
    endpoint: 'federation',
    description: oriented.targetIs === 'A' ? findingA : findingC,
    after: counts,
    buildQuery: (_ctx, scope) => buildIriQuery('target', scope),
    divide: divideFound,
  });
  steps.push({
    type: 'FIND_ANCHOR_IRIS',
    endpoint: 'federation',
    description: oriented.targetIs === 'A' ? findingC : findingA,
    // Not for its rows: a target side that finds nothing ends the run, and
    // waiting saves this query when it does.
    after: ['FIND_TARGET_IRIS'],
    buildQuery: (_ctx, scope) => buildIriQuery('anchor', scope),
    divide: divideFound,
  });

  // Supporting stream layer. Skipped when a side is already streams — those
  // flowlines come back as the answer set and would be drawn twice.
  const streamsAreAnswer =
    entityFor(targetBlock.type).isFlowline || entityFor(anchorBlock.type).isFlowline;
  if (oriented.kind === 'trace' && !streamsAreAnswer) {
    steps.push({
      type: 'GET_FLOWLINE_GEOMETRIES',
      endpoint: 'federation',
      description: `Loading ${relationship.type} stream geometries`,
      // Traces from the anchors found and stops at the targets found, then
      // runs alongside the details.
      after: ['FIND_TARGET_IRIS', 'FIND_ANCHOR_IRIS'],
      buildQuery: (ctx, scope) =>
        buildFusedFlowlineQuery({
          anchor: anchorBlock,
          target: targetBlock,
          anchorIris: scope?.anchorIris ?? ctx.anchorIris,
          // Never sliced: the target set bounds the trace, so a partial list
          // would silently shrink the drawn network rather than split it.
          targetIris: ctx.targetIris,
          maxDistanceKm: relationship.maxDistanceKm,
        }),
      initialScopes: (ctx) => iriScopes(ctx.anchorIris, 'anchor'),
      divide: async (ctx, scope) => divideIriList(scope, ctx.anchorIris, 'anchor'),
      // Stream geometry is map decoration — losing a slice of it should not
      // discard the samples and facilities the run already found.
      optional: true,
    });
  }

  const fusedCtx: FusedContext = {
    kind: oriented.kind,
    anchorBlock,
    targetBlock,
    relationship,
    anchorRegion,
    targetRegion,
  };

  steps.push(hydrateStep(targetBlock, 'target', fusedCtx, ['FIND_ANCHOR_IRIS']));
  steps.push(hydrateStep(anchorBlock, 'anchor', fusedCtx, ['HYDRATE_TARGET_BY_IRI']));

  // Per-observation detail is no longer fetched up front. It filled map popups
  // one click at a time but cost 18–37MB per run (one sample point is ~30KB);
  // useSampleDetails fetches it per sample when a popup opens.
  // Region boundaries
  const stateCode = blockA.region?.stateCode || blockC.region?.stateCode;
  const hasRegion = Boolean(anchorRegion || targetRegion);
  if (hasRegion && stateCode) {
    steps.push({
      type: 'GET_REGION_BOUNDARIES',
      endpoint: 'spatialkg',
      description: 'Loading region boundaries',
      // Needs only the state, so it starts with the run instead of after it.
      after: [],
      buildQuery: () => buildRegionBoundaryQuery(stateCode),
      // County outlines never change within a session, and this step was
      // measured at 25.5s on a cold cache (docs/QUERY-SWEEP.md 3.8).
      cache: true,
      optional: true,
    });
  }

  return steps;
}

export function planPipeline(question: AnalysisQuestion, options: PlanOptions = {}): PipelineStep[] {
  return buildFusedSteps(question, options);
}
