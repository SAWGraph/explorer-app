// The executor's behaviour, run end to end against an in-memory endpoint.
//
// These pin what the engine does today, before the redesign moves this code
// into stages (docs/plans/active/2026-11-05-engine-redesign.md, Phase 0): the
// order of steps, the IRIs passed between them, splitting a refused query,
// what is reported missing, and when a run stops. A restructure that changes
// any of it fails here.
//
// No network: every request goes to the fake.
import { describe, expect, it, vi } from 'vitest';
import { executePipeline, type StepProgress } from '../executor';
import { SparqlError } from '../errors';
import { planPipeline } from '../planner';
import type { AnalysisQuestion } from '../types/query';
import { fakeEndpoint, iriRows, pinned, projected, refuse, type FakeEndpoint } from './support/fakeEndpoint';

// "Samples in Maine near landfills": block A is the target, block C (the
// facilities) the anchor the near-join starts from.
const SAMPLES_NEAR_LANDFILLS: AnalysisQuestion = {
  blockA: { type: 'samples', region: { stateCode: '23' } },
  relationship: { type: 'near', hops: 1 },
  blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
};

const SAMPLES = ['http://ex.org/sp/1', 'http://ex.org/sp/2', 'http://ex.org/sp/3'];
const FACILITIES = ['http://ex.org/fac/1', 'http://ex.org/fac/2'];

const run = (
  question: AnalysisQuestion,
  fake: FakeEndpoint,
  signal?: AbortSignal,
  onProgress: (p: StepProgress) => void = () => {},
  chunkOnRefusal?: boolean,
) => executePipeline(planPipeline(question), question, { onProgress, signal, endpoint: fake.run, chunkOnRefusal });

// A graph where the question has an answer and nothing is refused.
const answering = () =>
  fakeEndpoint(({ query }) => {
    if (projected(query) === 'spC') return iriRows(SAMPLES);
    if (projected(query) === 'facilityA') return iriRows(FACILITIES);
    if (query.includes('VALUES ?sp {')) return pinned(query, 'sp').map((sp) => ({ sp, spWKT: 'POINT(-69 45)' }));
    if (query.includes('VALUES ?facility {')) return pinned(query, 'facility').map((facility) => ({ facility, facWKT: 'POINT(-69 45)' }));
    if (query.includes('?regionWKT')) return [{ region: 'http://ex.org/region/23005', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' }];
    throw new Error(`unexpected query:\n${query}`);
  });

describe('a question that answers', () => {
  it('runs find, find, details, details, boundaries, and loads details for exactly what was found', async () => {
    const fake = answering();
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.queries?.map((q) => q.step)).toEqual([0, 1, 2, 3, 4]);
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'federation', 'federation', 'federation', 'spatialkg']);

    // The detail steps pin the IRIs discovery found, and nothing else.
    expect(pinned(fake.calls[2].query, 'sp')).toEqual(SAMPLES);
    expect(pinned(fake.calls[3].query, 'facility')).toEqual(FACILITIES);

    // The two keys the map reads.
    expect(result.data['FIND_TARGET_ENTITIES']).toHaveLength(3);
    expect(result.data['GET_ANCHOR_DETAILS']).toHaveLength(2);
    expect(result.partial).toBeUndefined();
  });
});

describe('a question with nothing on one side', () => {
  it('stops as empty after the target side finds nothing, without sending the other steps', async () => {
    const fake = fakeEndpoint(({ query }) => {
      if (projected(query) === 'spC') return [];
      throw new Error(`should not be sent:\n${query}`);
    });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('empty');
    if (result.status !== 'empty') return;
    expect(result.failedAtStep).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });
});

// A graph that refuses any discovery query not pinned to some facilities, the
// way QLever times out on a question too big to run whole. Probing lists
// `facilityCount` landfills and too many samples to enumerate, so the executor
// slices on the facilities, 25 per slice (ENTITY_CHUNK).
const refusingWhole = (
  facilityCount: number,
  options: { refuseFacility?: string; onSlice?: () => void } = {},
) => {
  const all = Array.from({ length: facilityCount }, (_, i) => `http://ex.org/fac/${i + 1}`);
  const base = answering();
  return fakeEndpoint((call) => {
    const { query } = call;
    if (projected(query) === 'facilityP') return iriRows(all);
    if (projected(query) === 'spP') return iriRows(Array.from({ length: 201 }, (_, i) => `http://ex.org/sp/p${i}`));
    if (projected(query) === 'spC' || projected(query) === 'facilityA') {
      const pins = pinned(query, 'facilityA');
      if (pins.length === 0) refuse();
      if (options.refuseFacility && pins.includes(options.refuseFacility)) refuse();
      options.onSlice?.();
      // Neighbouring landfills share samples: facility n is near sample n mod 3.
      return projected(query) === 'spC'
        ? iriRows(pins.map((f) => SAMPLES[Number(f.split('/').pop()) % 3]))
        : iriRows(pins);
    }
    return base.run(call.endpoint, query, call.options);
  });
};

const uncachedRepeats = (fake: FakeEndpoint) => {
  const sent = fake.calls.filter((c) => !c.options.cache).map((c) => c.query);
  return sent.filter((q, i) => sent.indexOf(q) !== i).length;
};

describe('a question too big to run whole', () => {
  it('probes the sides, slices the listable one, and merges the slices without duplicates', async () => {
    const fake = refusingWhole(30);
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial).toBeUndefined();
    // 30 landfills over two slices reach the same 3 samples; each kept once.
    expect(result.data['FIND_TARGET_IRIS']).toEqual(iriRows([SAMPLES[1], SAMPLES[2], SAMPLES[0]]));
    expect(result.data['FIND_ANCHOR_IRIS']).toHaveLength(30);
    expect(result.queries?.filter((q) => q.step === 0).map((q) => q.scope)).toEqual([
      undefined,
      'facilities batch 1',
      'facilities batch 2',
    ]);
    // Probes are cached reads; nothing else goes out twice.
    expect(fake.calls.filter((c) => projected(c.query)?.endsWith('P')).every((c) => c.options.cache)).toBe(true);
    expect(uncachedRepeats(fake)).toBe(0);
  });

  it('reports a slice still refused at one entity as failed, and keeps the rest', async () => {
    const fake = refusingWhole(2, { refuseFacility: 'http://ex.org/fac/2' });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial?.[0]).toEqual({
      step: 'Finding samples near facilities',
      failed: ['facilities batch 1 (2/2)'],
      skipped: [],
    });
    expect(result.data['FIND_TARGET_IRIS']).toEqual(iriRows([SAMPLES[1]]));
  });

  it('skips the slices left when a step passes its 300s budget, and says they were skipped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // Each slice takes 120s: slices 1 to 3 start inside the budget, 4 does not.
      const fake = refusingWhole(100, { onSlice: () => vi.setSystemTime(Date.now() + 120_000) });
      const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;
      // Both discovery steps slice the same way, and each has its own budget.
      expect(result.partial).toEqual([
        { step: 'Finding samples near facilities', failed: [], skipped: ['facilities batch 4'] },
        { step: 'Finding facilities with samples near them', failed: [], skipped: ['facilities batch 4'] },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('remembers a refused query for the endpoint that refused it, not for another', async () => {
    const wholeDiscovery = (fake: FakeEndpoint) =>
      fake.calls.filter((c) => projected(c.query) === 'spC' && pinned(c.query, 'facilityA').length === 0).length;

    const first = refusingWhole(30);
    await run(SAMPLES_NEAR_LANDFILLS, first);
    await run(SAMPLES_NEAR_LANDFILLS, first);
    // The second run goes straight to slicing instead of paying the timeout again.
    expect(wholeDiscovery(first)).toBe(1);

    const other = refusingWhole(30);
    await run(SAMPLES_NEAR_LANDFILLS, other);
    expect(wholeDiscovery(other)).toBe(1);
  });
});

describe('a step that fails', () => {
  it('keeps the answer when an optional step (boundaries) is refused, and reports it', async () => {
    const base = answering();
    const fake = fakeEndpoint((call) => (call.endpoint === 'spatialkg' ? refuse() : base.run(call.endpoint, call.query, call.options)));
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial).toEqual([{ step: 'Loading region boundaries', failed: ['whole query'], skipped: [] }]);
    expect(result.data['FIND_TARGET_ENTITIES']).toHaveLength(3);
  });

  it('fails the run at a required step that cannot be answered at all', async () => {
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (call.query.includes('VALUES ?facility {')) throw new SparqlError('network', 0, 'fetch failed');
      return base.run(call.endpoint, call.query, call.options);
    });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(3);
    expect(result.error).toBeInstanceOf(SparqlError);
    // Not a refusal, so nothing was split or retried.
    expect(fake.calls.filter((c) => c.query.includes('VALUES ?facility {'))).toHaveLength(1);
  });
});

describe('a cancelled run', () => {
  it('rejects instead of returning a result, and sends nothing after the cancel', async () => {
    const controller = new AbortController();
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (call.query.includes('VALUES ?sp {')) controller.abort();
      return base.run(call.endpoint, call.query, call.options);
    });

    await expect(run(SAMPLES_NEAR_LANDFILLS, fake, controller.signal)).rejects.toThrow();
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'federation', 'federation']);
  });
});

// What the progress strip (ui/components/Pipeline/PipelineProgressStrip.tsx)
// is told while a question runs.
describe('progress reports', () => {
  const brief = (p: StepProgress) =>
    [p.stepIndex, p.status, p.resultCount ?? null, p.chunksDone ?? null, p.chunksTotal ?? null] as const;

  it('report each step running, then done with its row count', async () => {
    const events: ReturnType<typeof brief>[] = [];
    await run(SAMPLES_NEAR_LANDFILLS, answering(), undefined, (p) => events.push(brief(p)));

    expect(events).toEqual([
      [0, 'running', null, null, null], [0, 'done', 3, null, null],
      [1, 'running', null, null, null], [1, 'done', 2, null, null],
      [2, 'running', null, null, null], [2, 'done', 3, null, null],
      [3, 'running', null, null, null], [3, 'done', 2, null, null],
      [4, 'running', null, null, null], [4, 'done', 1, null, null],
    ]);
  });

  it('count slices as they finish once a step is split', async () => {
    const events: ReturnType<typeof brief>[] = [];
    await run(SAMPLES_NEAR_LANDFILLS, refusingWhole(30), undefined, (p) => events.push(brief(p)));

    // The refused whole query is not a slice; the two facility slices are.
    expect(events.filter(([step]) => step === 0)).toEqual([
      [0, 'running', null, null, null],
      [0, 'running', null, 0, 2],
      [0, 'running', null, 1, 2],
      [0, 'running', null, 2, 2],
      [0, 'done', 3, null, null],
    ]);
  });

  it('report a required step that cannot be answered as failed', async () => {
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (call.query.includes('VALUES ?facility {')) throw new SparqlError('network', 0, 'fetch failed');
      return base.run(call.endpoint, call.query, call.options);
    });
    const events: ReturnType<typeof brief>[] = [];
    await run(SAMPLES_NEAR_LANDFILLS, fake, undefined, (p) => events.push(brief(p)));

    expect(events.at(-1)).toEqual([3, 'failed', null, null, null]);
  });
});

// A graph where neither side can be listed (both probes come back full), so
// the executor falls back to slicing the region that block A already has,
// county by county. Penobscot is still too big as a county, until its samples
// are listed and pinned.
const PENOBSCOT_SAMPLES = ['http://ex.org/sp/p1', 'http://ex.org/sp/p2'];
const regionsIn = (query: string) => [...query.matchAll(/administrativeRegion\.USA\.(\d+)/g)].map((m) => m[1]);
const full = (prefix: string) => iriRows(Array.from({ length: 201 }, (_, i) => `${prefix}${i}`));

const countySlicing = (countyNames: boolean) => {
  const base = answering();
  return fakeEndpoint((call) => {
    const { query } = call;
    if (call.endpoint === 'spatialkg' && query.includes('?countyName')) {
      return [
        ['23005', 'Cumberland County, Maine'],
        ['23019', 'Penobscot County, Maine'],
      ].map(([code, name]) => ({
        county: `http://ex.org/lod/resource/administrativeRegion.USA.${code}`,
        ...(countyNames ? { countyName: name } : {}),
      }));
    }
    if (projected(query) === 'facilityP') return full('http://ex.org/fac/p');
    if (projected(query) === 'spP') return regionsIn(query).includes('23019') ? iriRows(PENOBSCOT_SAMPLES) : full('http://ex.org/sp/p');
    if (projected(query) === 'spC' || projected(query) === 'facilityA') {
      const regions = regionsIn(query);
      const pinnedSamples = pinned(query, 'spC');
      if (regions.includes('23')) refuse();
      if (regions.includes('23019') && pinnedSamples.length === 0) refuse();
      if (projected(query) === 'facilityA') return iriRows(FACILITIES);
      return iriRows(pinnedSamples.length ? pinnedSamples : [SAMPLES[0]]);
    }
    return base.run(call.endpoint, query, call.options);
  });
};

describe('a question too big to run whole, with neither side listable', () => {
  it('slices block A by county, names each slice after its county, and lists a county still too big', async () => {
    const fake = countySlicing(true);
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial).toBeUndefined();
    expect(result.queries?.filter((q) => q.step === 0).map((q) => q.scope)).toEqual([
      undefined,
      'Cumberland County, Maine',
      'Penobscot County, Maine',
      'Penobscot County, Maine part 1',
    ]);
    expect(result.data['FIND_TARGET_IRIS']).toEqual(iriRows([SAMPLES[0], ...PENOBSCOT_SAMPLES]));
    // The anchor side is never narrowed to a county: landfills outside it can
    // still be near samples inside it.
    expect(
      fake.calls.filter((c) => projected(c.query) === 'facilityP').every((c) => regionsIn(c.query).length === 0),
    ).toBe(true);
  });

  it('labels slices with the county names this endpoint reported, not another endpoint\'s', async () => {
    await run(SAMPLES_NEAR_LANDFILLS, countySlicing(true));
    const result = await run(SAMPLES_NEAR_LANDFILLS, countySlicing(false));

    if (result.status !== 'success') throw new Error(result.status);
    // No names from this endpoint and none on the question: the code stands in.
    expect(result.queries?.filter((q) => q.step === 0).map((q) => q.scope)).toEqual([
      undefined,
      '23005',
      '23019',
      '23019 part 1',
    ]);
  });
});

// A trace adds the stream-lines step (GET_FLOWLINE_GEOMETRIES), which draws the
// river network between the two sides. It is decoration: optional, and split by
// landfill when refused.
const SAMPLES_DOWNSTREAM_OF_LANDFILLS: AnalysisQuestion = {
  ...SAMPLES_NEAR_LANDFILLS,
  relationship: { type: 'downstream' },
};

const tracing = (refuseFlowlinesFrom: number) => {
  const base = answering();
  return fakeEndpoint((call) => {
    if (!call.query.includes('?flowlineWKT')) return base.run(call.endpoint, call.query, call.options);
    const landfills = pinned(call.query, 'facilityA');
    if (landfills.length >= refuseFlowlinesFrom) refuse();
    // Both landfills drain through the shared reach r/1.
    return landfills.flatMap((f) => [
      { flowline: 'http://ex.org/r/1', flowlineWKT: 'LINESTRING(0 0, 1 1)' },
      { flowline: `${f}/reach`, flowlineWKT: 'LINESTRING(1 1, 2 2)' },
    ]);
  });
};

describe('a trace question', () => {
  it('splits refused stream lines by landfill, keeps every sample in each slice, and merges shared reaches', async () => {
    const fake = tracing(2);
    const result = await run(SAMPLES_DOWNSTREAM_OF_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.queries?.filter((q) => q.step === 2).map((q) => q.scope)).toEqual([undefined, 'all (1/2)', 'all (2/2)']);
    // Never sliced on the samples: a partial target list would shrink the drawn network.
    const flowlineCalls = fake.calls.filter((c) => c.query.includes('?flowlineWKT'));
    expect(flowlineCalls.every((c) => pinned(c.query, 'spC').join() === SAMPLES.join())).toBe(true);
    expect(result.data['GET_FLOWLINE_GEOMETRIES'].map((r) => r.flowline)).toEqual([
      'http://ex.org/r/1',
      'http://ex.org/fac/1/reach',
      'http://ex.org/fac/2/reach',
    ]);
  });

  it('keeps the samples and landfills when the stream lines cannot be drawn at all', async () => {
    const result = await run(SAMPLES_DOWNSTREAM_OF_LANDFILLS, tracing(1));

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial).toEqual([
      { step: 'Loading downstream stream geometries', failed: ['all (1/2)', 'all (2/2)'], skipped: [] },
    ]);
    expect(result.data['FIND_TARGET_ENTITIES']).toHaveLength(3);
    expect(result.data['GET_ANCHOR_DETAILS']).toHaveLength(2);
  });
});

// With chunkOnRefusal off, a query the endpoint refuses is not split into
// smaller ones: the run reports the refusal. Request-size batches (1,000 IRIs a
// request) are a transport limit, not a rescue, and stay on.
describe('with chunking on refusal turned off', () => {
  const runWithoutChunking = (question: AnalysisQuestion, fake: FakeEndpoint) =>
    run(question, fake, undefined, undefined, false);

  it('fails at the refused step instead of probing and splitting it', async () => {
    const fake = refusingWhole(30);
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(0);
    expect(result.chunkingOff).toBe(true);
    expect(result.error).toBeInstanceOf(SparqlError);
    // The whole query, once. No probes, no slices.
    expect(fake.calls.map((c) => projected(c.query))).toEqual(['spC']);
  });

  it('sends a query refused in an earlier run instead of going straight to slices', async () => {
    const fake = refusingWhole(30);
    await run(SAMPLES_NEAR_LANDFILLS, fake); // chunking on: refused, remembered, split
    fake.calls.length = 0;
    await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);
    expect(fake.calls.map((c) => projected(c.query))).toEqual(['spC']);
  });

  it('keeps the answer when an optional step is refused, as with chunking on', async () => {
    const result = await runWithoutChunking(SAMPLES_DOWNSTREAM_OF_LANDFILLS, tracing(2));

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.partial).toEqual([
      { step: 'Loading downstream stream geometries', failed: ['whole query'], skipped: [] },
    ]);
    // So the incomplete-results notice can say why it was not split.
    expect(result.chunkingOff).toBe(true);
  });

  it('fails the run when one request-size batch of a required step is refused', async () => {
    const samples = Array.from({ length: 1500 }, (_, i) => `http://ex.org/sp/${i}`);
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (projected(call.query) === 'spC') return iriRows(samples);
      if (call.query.includes('VALUES ?sp {') && pinned(call.query, 'sp').length === 500) refuse();
      return base.run(call.endpoint, call.query, call.options);
    });
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    // The other batch answered, but with chunking off a refusal is shown, not
    // worked around: the whole run fails at that step.
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(2);
    expect(result.chunkingOff).toBe(true);
    expect((result.error as SparqlError).kind).toBe('timeout');
  });

  it('keeps the chunking-off note when a later slice fails for another reason', async () => {
    const samples = Array.from({ length: 1500 }, (_, i) => `http://ex.org/sp/${i}`);
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (projected(call.query) === 'spC') return iriRows(samples);
      if (call.query.includes('VALUES ?sp {')) {
        if (pinned(call.query, 'sp').length === 1000) refuse();
        throw new SparqlError('network', 0, 'fetch failed');
      }
      return base.run(call.endpoint, call.query, call.options);
    });
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.chunkingOff).toBe(true);
    // The error shown is the refusal, not the network failure that came after.
    expect((result.error as SparqlError).kind).toBe('timeout');
  });

  it('still sends a long IRI list in request-size batches', async () => {
    const samples = Array.from({ length: 2500 }, (_, i) => `http://ex.org/sp/${i}`);
    const base = answering();
    const fake = fakeEndpoint((call) =>
      projected(call.query) === 'spC' ? iriRows(samples) : base.run(call.endpoint, call.query, call.options),
    );
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    const sampleDetails = fake.calls.filter((c) => c.query.includes('VALUES ?sp {'));
    expect(sampleDetails.map((c) => pinned(c.query, 'sp').length)).toEqual([1000, 1000, 500]);
  });

  it('is on when not set', async () => {
    const result = await run(SAMPLES_NEAR_LANDFILLS, refusingWhole(30));
    expect(result.status).toBe('success');
  });
});
