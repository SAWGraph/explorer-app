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
import { counted, fakeEndpoint, iriRows, pinned, projected, refuse, type FakeCall, type FakeEndpoint } from './support/fakeEndpoint';
import type { SparqlRow } from '../types/sparql';

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
) => executePipeline(planPipeline(question, { countSides: false }), question, { onProgress, signal, endpoint: fake.run, chunkOnRefusal });
// Most tests here pin what discovery, details and decoration do, so they plan
// without the counts; "counting both sides first" below plans with them, as
// runQuestion does by default.

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
  it('runs find, find, details, details with the boundaries alongside, and loads details for exactly what was found', async () => {
    const fake = answering();
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.queries?.map((q) => q.step)).toEqual([0, 1, 2, 3, 4]);
    // The boundaries (spatialkg) go out with the first discovery query.
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'spatialkg', 'federation', 'federation', 'federation']);

    // The detail steps pin the IRIs discovery found, and nothing else.
    const sent = (marker: string) => fake.calls.find((c) => c.query.includes(marker))!.query;
    expect(pinned(sent('VALUES ?sp {'), 'sp')).toEqual(SAMPLES);
    expect(pinned(sent('VALUES ?facility {'), 'facility')).toEqual(FACILITIES);

    // The two keys the map reads.
    expect(result.data['FIND_TARGET_ENTITIES']).toHaveLength(3);
    expect(result.data['GET_ANCHOR_DETAILS']).toHaveLength(2);
    expect(result.partial).toBeUndefined();
  });
});

describe('a question with nothing on one side', () => {
  it('stops as empty after the target side finds nothing, without sending the other main steps', async () => {
    const fake = fakeEndpoint(({ query }) => {
      if (projected(query) === 'spC') return [];
      // The boundaries started with the run; the empty answer stops them.
      if (query.includes('?regionWKT')) return new Promise<never>(() => {});
      throw new Error(`should not be sent:\n${query}`);
    });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('empty');
    if (result.status !== 'empty') return;
    expect(result.failedAtStep).toBe(0);
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'spatialkg']);
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
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'spatialkg', 'federation', 'federation']);
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

    const ofStep = (i: number) => events.filter(([step]) => step === i);
    expect(ofStep(0)).toEqual([[0, 'running', null, null, null], [0, 'done', 3, null, null]]);
    expect(ofStep(1)).toEqual([[1, 'running', null, null, null], [1, 'done', 2, null, null]]);
    expect(ofStep(2)).toEqual([[2, 'running', null, null, null], [2, 'done', 3, null, null]]);
    expect(ofStep(3)).toEqual([[3, 'running', null, null, null], [3, 'done', 2, null, null]]);
    expect(ofStep(4)).toEqual([[4, 'running', null, null, null], [4, 'done', 1, null, null]]);
    // The main steps one after another; the boundaries running from the start.
    const at = (i: number, status: string) => events.findIndex(([step, s]) => step === i && s === status);
    expect(at(1, 'running')).toBeGreaterThan(at(0, 'done'));
    expect(at(2, 'running')).toBeGreaterThan(at(1, 'done'));
    expect(at(3, 'running')).toBeGreaterThan(at(2, 'done'));
    expect(at(4, 'running')).toBeLessThan(at(0, 'done'));
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
// With chunkOnRefusal off the run either answers completely or shows the first
// error: no probes or slices, no retry, no 300s step limit, no partial answers.
// Request-size batches (1,000 IRIs a request) are how detail steps send their
// IRIs, not chunking, and stay on.
// Decoration (stream lines, boundaries) is drawn around the answer, so it no
// longer waits its turn behind the main steps: each part starts as soon as
// what it reads is there. The boundaries need only the state; the stream lines
// need both sides found. Measured before: boundaries were 24.8s of a 39.1s run.
describe('decoration alongside the main steps', () => {
  // Resolves once `sent()` holds, or fails after a few turns of the event loop
  // instead of hanging the run (a step that waits too long never sends).
  const whenSent = async (sent: () => boolean, what: string) => {
    for (let i = 0; i < 50 && !sent(); i++) await new Promise((r) => setTimeout(r, 0));
    if (!sent()) throw new Error(`${what} was not sent in time`);
  };

  it('sends the region boundaries while discovery is still running', async () => {
    const base = answering();
    const fake: FakeEndpoint = fakeEndpoint(async (call) => {
      if (projected(call.query) === 'spC') {
        await whenSent(() => fake.calls.some((c) => c.endpoint === 'spatialkg'), 'the boundaries');
      }
      return base.run(call.endpoint, call.query, call.options);
    });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data['GET_REGION_BOUNDARIES']).toHaveLength(1);
  });

  it('sends the stream lines once both sides are found, while the details are still loading', async () => {
    const trace = tracing(3);
    const fake: FakeEndpoint = fakeEndpoint(async (call) => {
      // The stream lines answer only once the details have gone out too.
      if (call.query.includes('?flowlineWKT')) {
        await whenSent(() => fake.calls.some((c) => c.query.includes('VALUES ?sp {')), 'the sample details');
      }
      return trace.run(call.endpoint, call.query, call.options);
    });
    const result = await run(SAMPLES_DOWNSTREAM_OF_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const order = (marker: (q: string) => boolean) => fake.calls.findIndex((c) => marker(c.query));
    expect(order((q) => q.includes('?flowlineWKT'))).toBeGreaterThan(order((q) => projected(q) === 'facilityA'));
    expect(result.data['GET_FLOWLINE_GEOMETRIES']).toHaveLength(3);
  });

  it('stops the decoration still loading when the run ends, and reports it skipped', async () => {
    let boundariesSignal: AbortSignal | undefined;
    const fake = fakeEndpoint(({ query, options }) => {
      if (projected(query) === 'spC') return [];
      boundariesSignal = options.signal;
      return new Promise<never>(() => {});
    });
    const events: StepProgress[] = [];
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake, undefined, (p) => events.push(p));

    expect(result.status).toBe('empty');
    expect(boundariesSignal?.aborted).toBe(true);
    expect(events.filter((p) => p.stepIndex === 4).map((p) => p.status)).toEqual(['running', 'skipped']);
  });

  it('adds nothing to a finished run when a stopped request answers late', async () => {
    let answerLate: () => void = () => {};
    const fake = fakeEndpoint(({ query }) => {
      if (projected(query) === 'spC') return [];
      // An endpoint that ignores the stop and answers anyway.
      return new Promise((resolve) => {
        answerLate = () => resolve([{ region: 'http://ex.org/r/1', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' }]);
      });
    });
    const events: StepProgress[] = [];
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake, undefined, (p) => events.push(p));
    const sent = result.queries?.length;
    const reported = events.length;

    answerLate();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.queries?.length).toBe(sent);
    expect(events).toHaveLength(reported);
  });

  it('lists the SPARQL it sent in step order, whichever answered first', async () => {
    const base = answering();
    const fake = fakeEndpoint(async (call) => {
      // The boundaries answer last, after every main step.
      if (call.endpoint === 'spatialkg') {
        await whenSent(() => fake.calls.some((c) => c.query.includes('VALUES ?facility {')), 'the anchor details');
      }
      return base.run(call.endpoint, call.query, call.options);
    });
    const result = await run(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.queries?.map((q) => q.step)).toEqual([0, 1, 2, 3, 4]);
  });

  it('still rejects with the cancel when the user cancels while decoration is loading', async () => {
    const controller = new AbortController();
    const base = answering();
    const fake = fakeEndpoint((call) => {
      if (call.endpoint === 'spatialkg') return new Promise<never>(() => {});
      if (call.query.includes('VALUES ?sp {')) controller.abort(new Error('cancelled by the user'));
      return base.run(call.endpoint, call.query, call.options);
    });

    await expect(run(SAMPLES_NEAR_LANDFILLS, fake, controller.signal)).rejects.toThrow('cancelled by the user');
  });
});

// Both sides are counted before discovery (COUNT_TARGET, COUNT_ANCHOR). A side
// at 0 ends the run there; the counts go into the advice when a question is
// too big; and a count that fails or is slow is dropped, never failing a run.
describe('counting both sides first', () => {
  const COUNTS = { spP: 3, facilityP: 2 };
  // Answers the counts with `counts` (by counted variable), the rest as `answering` does.
  const withCounts = (counts: Record<string, number | (() => never) | 'hang'> = COUNTS, base = answering()) =>
    fakeEndpoint((call) => {
      const side = counted(call.query);
      if (!side) return base.run(call.endpoint, call.query, call.options);
      const answer = counts[side];
      if (typeof answer === 'function') return answer();
      if (answer === 'hang') {
        // Answers only when stopped, the way fetch does.
        return new Promise<never>((_, reject) => {
          call.options.signal?.addEventListener('abort', () => reject(call.options.signal?.reason));
        });
      }
      return [{ count: String(answer) }];
    });
  const runCounted = (
    fake: FakeEndpoint,
    options: { chunkOnRefusal?: boolean; onProgress?: (p: StepProgress) => void; question?: AnalysisQuestion; countLimitMs?: number } = {},
  ) => {
    const question = options.question ?? SAMPLES_NEAR_LANDFILLS;
    const steps = planPipeline(question).map((s) =>
      options.countLimitMs && s.type.startsWith('COUNT_') ? { ...s, timeoutMs: options.countLimitMs } : s,
    );
    return executePipeline(steps, question, { endpoint: fake.run, chunkOnRefusal: options.chunkOnRefusal, onProgress: options.onProgress });
  };

  it('counts both sides together, before any discovery query, and keeps the counts by block', async () => {
    const fake = withCounts();
    const result = await runCounted(fake);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const firstDiscovery = fake.calls.findIndex((c) => projected(c.query));
    expect(fake.calls.slice(0, firstDiscovery).map((c) => counted(c.query)).filter(Boolean)).toEqual(['spP', 'facilityP']);
    // Samples are block A (the target of a near question), landfills block C.
    expect(result.counts).toEqual({ A: 3, C: 2 });
  });

  it('ends the run as empty when a side counts 0, before any discovery query, naming the block', async () => {
    const fake = withCounts({ spP: 3, facilityP: 0 });
    const result = await runCounted(fake);

    expect(result.status).toBe('empty');
    if (result.status !== 'empty') return;
    expect(result.emptyBlock).toBe('C');
    expect(result.failedAtStep).toBe(1);
    expect(fake.calls.some((c) => projected(c.query))).toBe(false);
  });

  it('drops a count that fails and runs on, with chunking on and off', async () => {
    for (const chunkOnRefusal of [true, false]) {
      const events: StepProgress[] = [];
      const result = await runCounted(withCounts({ spP: () => refuse(), facilityP: 2 }), { chunkOnRefusal, onProgress: (p) => events.push(p) });

      expect(result.status).toBe('success');
      if (result.status !== 'success') continue;
      expect(result.counts).toEqual({ C: 2 });
      expect(result.partial).toBeUndefined();
      expect(events.filter((p) => p.stepIndex === 0).map((p) => p.status)).toEqual(['running', 'skipped']);
      // The dropped count is still in the SPARQL list, with its error.
      expect(result.queries?.find((q) => q.step === 0)?.error).toBeTruthy();
    }
  });

  it('drops a count that takes longer than its limit, without a retry', async () => {
    const fake = withCounts({ spP: 'hang', facilityP: 2 });
    const result = await runCounted(fake, { countLimitMs: 20 });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.counts).toEqual({ C: 2 });
    expect(fake.calls.filter((c) => counted(c.query) === 'spP')).toHaveLength(1);
    expect(fake.calls.filter((c) => counted(c.query)).every((c) => c.options.retry === false)).toBe(true);
  });

  it('carries the counts on a failed run, for the advice', async () => {
    const base = answering();
    const fake = withCounts(COUNTS, fakeEndpoint((call) => (projected(call.query) === 'spC' ? refuse() : base.run(call.endpoint, call.query, call.options))));
    const result = await runCounted(fake, { chunkOnRefusal: false });

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.counts).toEqual({ A: 3, C: 2 });
  });

  it('does not probe a side its count says is too big to list, when splitting a refused question', async () => {
    // 30 landfills (listable), more samples than a probe lists.
    const fake = withCounts({ spP: 5000, facilityP: 30 }, refusingWhole(30));
    const result = await runCounted(fake);

    expect(result.status).toBe('success');
    expect(fake.calls.some((c) => projected(c.query) === 'facilityP')).toBe(true);
    expect(fake.calls.some((c) => projected(c.query) === 'spP')).toBe(false);
  });
});

describe('with chunking on refusal turned off', () => {
  const runWithoutChunking = (question: AnalysisQuestion, fake: FakeEndpoint) =>
    run(question, fake, undefined, undefined, false);
  const manySamples = (n: number) => Array.from({ length: n }, (_, i) => `http://ex.org/sp/${i}`);
  const withSamples = (samples: string[], detail: (call: FakeCall) => SparqlRow[] | undefined) => {
    const base = answering();
    return fakeEndpoint((call) => {
      if (projected(call.query) === 'spC') return iriRows(samples);
      if (call.query.includes('VALUES ?sp {')) {
        const rows = detail(call);
        if (rows) return rows;
      }
      return base.run(call.endpoint, call.query, call.options);
    });
  };

  it('fails at the refused step instead of probing and splitting it', async () => {
    const fake = refusingWhole(30);
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(0);
    expect(result.chunkingOff).toBe(true);
    expect(result.error).toBeInstanceOf(SparqlError);
    // The whole query, once. No probes, no slices. (The boundaries went out
    // alongside it, and were stopped.)
    expect(fake.calls.filter((c) => c.endpoint === 'federation').map((c) => projected(c.query))).toEqual(['spC']);
  });

  it('asks the endpoint not to retry', async () => {
    const fake = answering();
    await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);
    expect(fake.calls.every((c) => c.options.retry === false)).toBe(true);

    const on = answering();
    await run(SAMPLES_NEAR_LANDFILLS, on);
    expect(on.calls.every((c) => c.options.retry !== false)).toBe(true);
  });

  it('sends a query refused in an earlier run instead of going straight to slices', async () => {
    const fake = refusingWhole(30);
    await run(SAMPLES_NEAR_LANDFILLS, fake); // chunking on: refused, remembered, split
    fake.calls.length = 0;
    await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);
    expect(fake.calls.filter((c) => c.endpoint === 'federation').map((c) => projected(c.query))).toEqual(['spC']);
  });

  it('fails the run when an optional step (stream lines) is refused', async () => {
    const result = await runWithoutChunking(SAMPLES_DOWNSTREAM_OF_LANDFILLS, tracing(2));

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(2);
    expect(result.chunkingOff).toBe(true);
  });

  it('fails the run when one request-size batch is refused, and sends no more batches', async () => {
    const fake = withSamples(manySamples(2500), (call) => (pinned(call.query, 'sp')[0] === 'http://ex.org/sp/1000' ? refuse() : undefined));
    const result = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, fake);

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.failedAtStep).toBe(2);
    expect((result.error as SparqlError).kind).toBe('timeout');
    // Batch 1 answered, batch 2 was refused, batch 3 was never sent.
    expect(fake.calls.filter((c) => c.query.includes('VALUES ?sp {'))).toHaveLength(2);
  });

  it('fails the run on a failure that is not a refusal, where chunking on keeps the rest', async () => {
    const networkOnBatch2 = () =>
      withSamples(manySamples(2500), (call) =>
        pinned(call.query, 'sp')[0] === 'http://ex.org/sp/1000' ? (() => { throw new SparqlError('network', 0, 'fetch failed'); })() : undefined,
      );

    const off = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, networkOnBatch2());
    expect(off.status).toBe('error');
    if (off.status !== 'error') return;
    expect((off.error as SparqlError).kind).toBe('network');
    expect(off.chunkingOff).toBe(true);

    const on = await run(SAMPLES_NEAR_LANDFILLS, networkOnBatch2());
    expect(on.status).toBe('success');
    if (on.status !== 'success') return;
    expect(on.partial).toEqual([{ step: 'Loading details for samples', failed: ['batch 2'], skipped: [] }]);
  });

  it('sends every batch however long the step takes, where chunking on stops at 300s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // Six batches, each taking 120s: past the 300s step limit after three.
      const slow = () =>
        withSamples(manySamples(6000), () => {
          vi.setSystemTime(Date.now() + 120_000);
          return undefined;
        });

      const off = await runWithoutChunking(SAMPLES_NEAR_LANDFILLS, slow());
      expect(off.status).toBe('success');
      if (off.status !== 'success') return;
      expect(off.partial).toBeUndefined();

      const on = await run(SAMPLES_NEAR_LANDFILLS, slow());
      expect(on.status).toBe('success');
      if (on.status !== 'success') return;
      expect(on.partial?.[0].skipped).toEqual(['batch 4', 'batch 5', 'batch 6']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still sends a long IRI list in request-size batches', async () => {
    const fake = withSamples(manySamples(2500), () => undefined);
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
