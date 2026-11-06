// runQuestion (engine/run.ts) is the one way to run a question: the app, the
// scripts and the tests call it instead of wiring planPipeline into
// executePipeline themselves. These check it runs the same plan through the
// endpoint it is given, reports progress, and can be cancelled.
import { describe, expect, it } from 'vitest';
import { runQuestion } from '../run';
import type { StepProgress } from '../executor';
import type { AnalysisQuestion } from '../types/query';
import { fakeEndpoint, iriRows, pinned, projected } from './support/fakeEndpoint';

const QUESTION: AnalysisQuestion = {
  blockA: { type: 'samples', region: { stateCode: '23' } },
  relationship: { type: 'near', hops: 1 },
  blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
};

const answering = () =>
  fakeEndpoint(({ query }) => {
    if (projected(query) === 'spC') return iriRows(['http://ex.org/sp/1']);
    if (projected(query) === 'facilityA') return iriRows(['http://ex.org/fac/1']);
    if (query.includes('VALUES ?sp {')) return pinned(query, 'sp').map((sp) => ({ sp, spWKT: 'POINT(-69 45)' }));
    if (query.includes('VALUES ?facility {')) return pinned(query, 'facility').map((facility) => ({ facility, facWKT: 'POINT(-69 45)' }));
    if (query.includes('?regionWKT')) return [{ region: 'http://ex.org/r/1', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' }];
    throw new Error(`unexpected query:\n${query}`);
  });

describe('runQuestion', () => {
  it('runs every step of the plan through the endpoint it is given', async () => {
    const fake = answering();
    const result = await runQuestion(QUESTION, { endpoint: fake.run });

    expect(result.status).toBe('success');
    // The boundaries (spatialkg) go out alongside the first discovery query.
    expect(fake.calls.map((c) => c.endpoint)).toEqual(['federation', 'spatialkg', 'federation', 'federation', 'federation']);
  });

  it('reports each step as it runs', async () => {
    const seen: Pick<StepProgress, 'stepIndex' | 'status'>[] = [];
    await runQuestion(QUESTION, { endpoint: answering().run, onProgress: ({ stepIndex, status }) => seen.push({ stepIndex, status }) });
    for (const stepIndex of [0, 1, 2, 3, 4]) {
      expect(seen.filter((p) => p.stepIndex === stepIndex).map((p) => p.status)).toEqual(['running', 'done']);
    }
  });

  it('rejects when cancelled, sending nothing after', async () => {
    const controller = new AbortController();
    const fake = answering();
    const run = runQuestion(QUESTION, {
      endpoint: async (endpoint, query, options) => {
        controller.abort();
        return fake.run(endpoint, query, options);
      },
      signal: controller.signal,
    });
    await expect(run).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
});
