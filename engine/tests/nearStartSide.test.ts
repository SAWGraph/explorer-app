// A near query written from the target (the start-side sweep's override) must
// ask the same question as the anchor-led one: the same lines, in another
// order, with only the hop path turned around. The flipped form returns the
// same rows because kwg-ont:sfTouches and owl:sameAs are stored both ways (0
// one-way sfTouches pairs of 59,335,852 on federation, 2026-11-07, issue #139).
// A dropped pin or region on the flipped side would be a different question
// that still answers, which nothing else would notice.
//
// Without the override a near body stays anchor first: near questions have no
// start-side rule yet (issue #133).
//
// No network: these only build query strings.
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildFusedNearQuery } from '../templates/fusedQueries';
import type { EntityType } from '../types/query';

const TYPES: EntityType[] = ['samples', 'facilities', 'waterBodies', 'wells', 'aquifers', 'streams'];
const HOPS = [0, 1, 2, 3, 4];

const lines = (q: string) =>
  q
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const isHopLine = (l: string) => l.startsWith('BIND(?s2') || /^\?s2(anchor|target) .*(sfTouches|sameAs)/.test(l);

describe('a near query from either start side', () => {
  it('writes the same lines from the target, with the hop path reversed', () => {
    let checked = 0;
    for (const a of TYPES)
      for (const t of TYPES)
        for (const hops of HOPS)
          for (const pinned of [false, true]) {
            const opts = {
              anchor: { type: a },
              target: { type: t },
              anchorRegion: ['23'],
              targetRegion: ['23005'],
              hops,
              project: 'target' as const,
              ...(pinned ? { anchorIris: ['http://example.org/a1'], targetIris: ['http://example.org/t1'] } : {}),
            };
            const name = `${t} near(${hops}) ${a}${pinned ? ' pinned' : ''}`;
            const unset = buildFusedNearQuery(opts);
            const anchorLed = buildFusedNearQuery({ ...opts, lead: 'anchor' });
            const targetLed = buildFusedNearQuery({ ...opts, lead: 'target' });

            assert.equal(unset, anchorLed, `${name}: with no lead the body stays anchor first`);

            const aHop = lines(anchorLed).filter(isHopLine);
            const tHop = lines(targetLed).filter(isHopLine);
            assert.equal(aHop.length, 1, `${name}: one hop path`);
            assert.equal(tHop.length, 1, `${name}: one hop path`);
            const swap = (l: string) => l.replace(/\?s2anchor|\?s2target/g, (v) => (v === '?s2anchor' ? '?s2target' : '?s2anchor'));
            assert.equal(tHop[0], swap(aHop[0]), `${name}: the target-led hop path runs from ?s2target to ?s2anchor`);

            const rest = (q: string) => lines(q).filter((l) => !isHopLine(l)).sort();
            assert.deepEqual(rest(targetLed), rest(anchorLed), `${name}: every other line is the same`);
            assert.notEqual(targetLed, anchorLed, `${name}: the target-led body is written in another order`);
            checked++;
          }
    assert.equal(checked, TYPES.length * TYPES.length * HOPS.length * 2);
  });
});
