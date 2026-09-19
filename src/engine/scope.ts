import type { EntityBlock } from '../types/query';
import type { EndpointKey } from '../constants/endpoints';
import { executeSparql } from './sparqlClient';
import { blockIsFiltered, buildEntityProbeQuery } from './templates/fusedQueries';
import { buildDiscoverCountiesQuery } from './templates/regions';

// A Scope is a slice of one pipeline step's work. `undefined` scope means "the
// whole thing" — the executor always tries that first and only slices when the
// engine refuses (docs/plans/done/2026-09-13-query-execution-architecture.md).
//
// Exactly one of the three slicing fields is set on any given scope; which one
// is decided per question by `chooseAxis`, because the right axis flips between
// states: Maine has 4,528 samples / 2,976 facilities, Illinois has 78 / 22,574.
export interface Scope {
  label: string;
  anchorIris?: string[];
  targetIris?: string[];
  regionCodes?: string[];
  // Which side's region `regionCodes` narrows. Region slicing is only valid on a
  // side that already had a region filter — adding one to a side that had none
  // would silently change the question.
  regionSide?: 'anchor' | 'target';
}

// A side is "listable" if we can enumerate it in a bounded probe. 200 keeps the
// probe cheap; above it we fall through to the next axis.
const PROBE_LIMIT = 201;

// Last-resort probe. A side with a region or filters can be enumerated in bulk
// even when it is past PROBE_LIMIT — 411 Cook County facilities chunk into 17
// slices that each run in seconds, where the whole question times out.
const BULK_PROBE_LIMIT = 5001;

// Measured chunk sizes that comfortably clear the 30s budget: 25 anchor
// facilities ran 2.8–3.0s, 20 Illinois samples 12.7s, 4 Maine counties ~6s each.
// These are only starting points — any chunk that still fails gets halved.
const ENTITY_CHUNK = 25;
// One county at a time. Bigger groups look cheaper (fewer requests) but a group
// that fails costs a full 30s before we learn to halve it, and single counties
// measured 4.5-7.5s even on the worst shape — they almost always succeed first
// time.
const REGION_CHUNK = 1;
export const IRI_CHUNK = 1000; // by-IRI hydration: 1,000 IRIs ≈ 70KB, 1.0–3.3s

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Splits a scope that already has a slicing list into two halves. Returns null
// when it cannot be divided further (a single entity that still fails).
export function halve(scope: Scope): Scope[] | null {
  const split = <K extends 'anchorIris' | 'targetIris' | 'regionCodes'>(key: K): Scope[] | null => {
    const list = scope[key];
    if (!list || list.length < 2) return null;
    const mid = Math.ceil(list.length / 2);
    return [
      { ...scope, [key]: list.slice(0, mid), label: `${scope.label} (1/2)` },
      { ...scope, [key]: list.slice(mid), label: `${scope.label} (2/2)` },
    ];
  };
  return split('anchorIris') ?? split('targetIris') ?? split('regionCodes');
}

export interface AxisContext {
  anchorBlock: EntityBlock;
  targetBlock: EntityBlock;
  anchorRegion?: string[];
  targetRegion?: string[];
  endpoint: EndpointKey;
}

// Picks how to slice a question that was too big to run whole, preferring
// whichever side we can actually enumerate. Probes are cached for the session.
export async function chooseAxis(ctx: AxisContext): Promise<Scope[] | null> {
  // Both probes are independent, and each can take seconds on an unfiltered
  // side, so overlap them rather than paying for them one after the other.
  const [anchor, target] = await Promise.all([
    probeSide(ctx.anchorBlock, ctx.anchorRegion, ctx.endpoint),
    probeSide(ctx.targetBlock, ctx.targetRegion, ctx.endpoint),
  ]);

  if (anchor) {
    return chunk(anchor, ENTITY_CHUNK).map((iris, i) => ({
      label: `${ctx.anchorBlock.type} batch ${i + 1}`,
      anchorIris: iris,
    }));
  }

  if (target) {
    return chunk(target, ENTITY_CHUNK).map((iris, i) => ({
      label: `${ctx.targetBlock.type} batch ${i + 1}`,
      targetIris: iris,
    }));
  }

  // Neither side is listable — fall back to geography, but only on a side that
  // already has a region. Counties of an existing state filter narrow the same
  // question; inventing a region where there was none would answer a different
  // one.
  const side: 'target' | 'anchor' | null = ctx.targetRegion?.length
    ? 'target'
    : ctx.anchorRegion?.length
      ? 'anchor'
      : null;

  if (side) {
    const codes = side === 'target' ? ctx.targetRegion! : ctx.anchorRegion!;
    const counties = await expandToCounties(codes);
    // Name each slice after its county. When one of these fails the user sees
    // "York County, Maine could not be answered" rather than "1 too large",
    // which is the difference between a fact and a puzzle — the county is the
    // one thing they can act on.
    if (counties.length >= 2) {
      const names = countyNames(side === 'target' ? ctx.targetBlock : ctx.anchorBlock);
      return chunk(counties, REGION_CHUNK).map((group) => ({
        label: group.map((code) => names.get(code) ?? code).join(', '),
        regionCodes: group,
        regionSide: side,
      }));
    }
  }

  // A single county with too many entities to probe cheaply: enumerate them in
  // bulk and chunk. Anchor first — that is the side the trace seeds from.
  for (const s of ['anchor', 'target'] as const) {
    const block = s === 'anchor' ? ctx.anchorBlock : ctx.targetBlock;
    const region = s === 'anchor' ? ctx.anchorRegion : ctx.targetRegion;
    const iris = await probeSide(block, region, ctx.endpoint, BULK_PROBE_LIMIT);
    if (!iris) continue;
    return chunk(iris, ENTITY_CHUNK).map((slice, i) => ({
      label: `${block.type} batch ${i + 1}`,
      ...(s === 'anchor' ? { anchorIris: slice } : { targetIris: slice }),
    }));
  }
  return null;
}

// Last resort for a region slice that is down to a single county and still too
// big: chunk the target entities *inside* that county.
//
// Only the target side is safe to narrow this way. The target is already
// confined to the county by the region slice, so listing its entities changes
// nothing. Narrowing the anchor side would drop anchors outside the county that
// legitimately drain into it — the bug commit 3f50251 documents, where 16 of 39
// contributing landfills sat outside the region.
export async function refineRegionScope(
  ctx: AxisContext,
  scope: Scope,
): Promise<Scope[] | null> {
  if (!scope.regionCodes?.length || scope.regionSide !== 'target') return null;
  const targets = await probeSide(ctx.targetBlock, scope.regionCodes, ctx.endpoint);
  if (!targets) return null;
  return chunk(targets, ENTITY_CHUNK).map((iris, i) => ({
    ...scope,
    label: `${scope.label} part ${i + 1}`,
    targetIris: iris,
  }));
}

// Display names for county codes. The editor populates `countyLabels` when the
// user picks counties, and cacheKey strips it as display-only, so it is free to
// use for labelling. Falls back to the names `expandToCounties` collects, then
// to the code itself — a question built from a URL or the warm-cache script has
// no labels.
function countyNames(block: EntityBlock): Map<string, string> {
  const named = new Map(discoveredCountyNames);
  const labels = block.region?.countyLabels;
  if (labels) for (const [code, label] of Object.entries(labels)) named.set(code, label);
  return named;
}

// Filled in by expandToCounties, which already fetches the names.
const discoveredCountyNames = new Map<string, string>();

async function probeSide(
  block: EntityBlock,
  regionCodes: string[] | undefined,
  endpoint: EndpointKey,
  limit: number = PROBE_LIMIT,
): Promise<string[] | null> {
  // No region and no filters means every entity of that type in the graph —
  // certainly past the probe limit, and the probe itself would scan nationwide.
  if (!regionCodes?.length && !blockIsFiltered(block)) return null;

  const rows = await executeSparql(
    endpoint,
    buildEntityProbeQuery(block, regionCodes, limit),
    { cache: true },
  );
  const iris = [...new Set(rows.map((r) => r.iri).filter(Boolean))];
  // A full probe means "too many to enumerate" — we only know there are ≥limit.
  if (iris.length >= limit || iris.length < 2) return null;
  return iris;
}

// Turns state FIPS codes into their county FIPS codes. County codes are already
// county-level, so they pass through unchanged.
async function expandToCounties(regionCodes: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const code of regionCodes) {
    if (code.length > 2) {
      out.push(code);
      continue;
    }
    const rows = await executeSparql('spatialkg', buildDiscoverCountiesQuery(code), {
      cache: true,
    });
    for (const row of rows) {
      const fips = row.county?.match(/administrativeRegion\.USA\.(\d+)$/)?.[1];
      if (fips && fips.length > 2) {
        out.push(fips);
        if (row.countyName) discoveredCountyNames.set(fips, row.countyName);
      }
    }
  }
  return [...new Set(out)];
}
