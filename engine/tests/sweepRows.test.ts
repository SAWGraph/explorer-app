// The query sweep (engine/scripts/query-sweep.mts) writes one CSV row per
// request the engine sent: which step, which batch or slice, and what came
// back. sweepRows joins the recording endpoint's records with the run's
// queries to get there. No network: a fake endpoint answers.
import { describe, expect, it } from 'vitest';
import { recordingEndpoint, type RequestRecord } from '../endpoint';
import { executePipeline } from '../executor';
import { planPipeline } from '../planner';
import { sweepRows } from '../scripts/sweepRows';
import type { AnalysisQuestion } from '../types/query';
import { fakeEndpoint, iriRows, pinned, projected, refuse } from './support/fakeEndpoint';

const QUESTION: AnalysisQuestion = {
  blockA: { type: 'samples', region: { stateCode: '23' } },
  relationship: { type: 'near', hops: 1 },
  blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
};
const samples = (n: number) => Array.from({ length: n }, (_, i) => `http://ex.org/sp/${i}`);

const sweep = async (answer: Parameters<typeof fakeEndpoint>[0], chunkOnRefusal: boolean, steps = planPipeline(QUESTION)) => {
  const records: RequestRecord[] = [];
  const fake = fakeEndpoint(answer);
  const result = await executePipeline(steps, QUESTION, { endpoint: recordingEndpoint(fake.run, (r) => records.push(r)), chunkOnRefusal });
  return sweepRows(steps, result.queries, records);
};

describe('one sweep row per request', () => {
  it('names the step and the batch of each request', async () => {
    const rows = await sweep(({ query }) => {
      if (projected(query) === 'spC') return iriRows(samples(1500));
      if (projected(query) === 'facilityA') return iriRows(['http://ex.org/f/1']);
      if (query.includes('VALUES ?sp {')) return pinned(query, 'sp').map((sp) => ({ sp }));
      return [{ x: '1' }];
    }, false);

    expect(rows.map((r) => [r.step, r.slice, r.status, r.kind])).toEqual([
      ['FIND_TARGET_IRIS', '', 200, 'ok'],
      ['FIND_ANCHOR_IRIS', '', 200, 'ok'],
      ['HYDRATE_TARGET_BY_IRI', 'batch 1', 200, 'ok'],
      ['HYDRATE_TARGET_BY_IRI', 'batch 2', 200, 'ok'],
      ['HYDRATE_ANCHOR_BY_IRI', '', 200, 'ok'],
      ['GET_REGION_BOUNDARIES', '', 200, 'ok'],
    ]);
    expect(rows[2].rows).toBe(1000);
    expect(rows[3].rows).toBe(500);
    expect(rows[2].requestBytes).toBeGreaterThan(rows[3].requestBytes);
  });

  it('records the refusal that stopped a run with chunking off', async () => {
    const steps = planPipeline(QUESTION).slice(0, 1);
    const rows = await sweep(() => refuse(), false, steps);
    expect(rows).toEqual([expect.objectContaining({ step: 'FIND_TARGET_IRIS', slice: '', status: 429, kind: 'timeout', rows: 0 })]);
  });

  it('shows the probes and slices chunking on added', async () => {
    const steps = planPipeline(QUESTION).slice(0, 1);
    const rows = await sweep(({ query }) => {
      if (projected(query) === 'facilityP') return iriRows(['http://ex.org/f/1', 'http://ex.org/f/2']);
      if (projected(query) === 'spP') return iriRows(samples(201));
      if (pinned(query, 'facilityA').length === 0) refuse();
      return iriRows(['http://ex.org/sp/1']);
    }, true, steps);

    expect(rows.map((r) => [r.step, r.slice, r.kind])).toEqual([
      ['FIND_TARGET_IRIS', '', 'timeout'],
      ['PROBE', '', 'ok'],
      ['PROBE', '', 'ok'],
      ['FIND_TARGET_IRIS', 'facilities batch 1', 'ok'],
    ]);
  });
});
