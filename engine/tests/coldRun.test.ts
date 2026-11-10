import { describe, expect, it } from 'vitest';
import { cacheSavedMs, isWarm, parseMs, type PlanNode } from '../scripts/coldRun';

// Shapes taken from real federation responses (2026-11-07 and 2026-11-10).
describe('cacheSavedMs', () => {
  it('is 0 when every node was computed', () => {
    const tree: PlanNode = {
      cache_status: 'computed',
      original_total_time: 0,
      children: [{ cache_status: 'computed', original_total_time: 928 }],
    };
    expect(cacheSavedMs(tree)).toBe(0);
  });

  it('counts a cached root once, not again for its stored children', () => {
    const tree: PlanNode = {
      cache_status: 'cached_not_pinned',
      original_total_time: 393,
      children: [{ cache_status: 'cached_not_pinned', original_total_time: 161 }],
    };
    expect(cacheSavedMs(tree)).toBe(393);
  });

  it('adds the topmost cached node of each branch under a computed root', () => {
    const tree: PlanNode = {
      cache_status: 'computed',
      children: [
        { cache_status: 'cached_pinned', original_total_time: 40, children: [{ cache_status: 'computed', original_total_time: 30 }] },
        { cache_status: 'computed', children: [{ cache_status: 'cached_not_pinned', original_total_time: 7 }] },
      ],
    };
    expect(cacheSavedMs(tree)).toBe(47);
  });

  it('is 0 for a missing tree (a refused query)', () => {
    expect(cacheSavedMs(undefined)).toBe(0);
  });
});

describe('isWarm', () => {
  it('is warm only above 10% of the run', () => {
    expect(isWarm(100, 1000)).toBe(false);
    expect(isWarm(101, 1000)).toBe(true);
    expect(isWarm(1700, 1749)).toBe(true);
  });
});

describe('parseMs', () => {
  it('reads QLever time strings', () => {
    expect(parseMs('991ms')).toBe(991);
    expect(parseMs(12)).toBe(12);
    expect(parseMs('soon')).toBeNull();
  });
});
