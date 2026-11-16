// A groundwater-connected run (#121) through runQuestion with a fake endpoint.
// The answer is the two sides; the aquifers that link them and the regional
// ones left out come back as decoration, so the map can draw them and the note
// can say what was left out. Neither may cost the answer: a failed link step is
// reported as partial, a failed regional check is dropped without a word.
import { describe, expect, it } from 'vitest';
import { runQuestion } from '../run';
import type { PipelineSuccess } from '../executor';
import type { AnalysisQuestion } from '../types/query';
import { counted, fakeEndpoint, iriRows, pinned, projected, refuse, type FakeCall } from './support/fakeEndpoint';

const QUESTION: AnalysisQuestion = {
  blockA: { type: 'wells' },
  relationship: { type: 'groundwaterConnected' },
  blockC: {
    type: 'samples',
    region: { stateCode: '23', countyCodes: ['23011'] },
    sampleFilters: { substances: ['http://w3id.org/DSSTox/v1/DTXSID8031865'], minConcentration: 100, includeNondetects: false },
  },
};

const LINK_ROW = {
  aquifer: 'http://ex.org/aquifer/MGS-Aquifer.06489',
  aquiferType: 'sand and gravel',
  aquiferWKT: 'POLYGON((-69.8 44.3, -69.7 44.3, -69.7 44.4, -69.8 44.3))',
  countA: '16',
  countC: '13',
};
const SKIPPED_ROW = { aquifer: 'http://ex.org/aquifer/BR0001' };

const isLink = (q: string) => q.includes('?aquiferWKT');
const isSkipped = (q: string) => q.includes('SELECT DISTINCT (?_linkAquifer AS ?aquifer)');

const answering = (override?: (call: FakeCall) => void) =>
  fakeEndpoint((call) => {
    override?.(call);
    const { query } = call;
    if (counted(query)) return [{ count: '1' }];
    if (projected(query) === 'wellC') return iriRows(['http://ex.org/well/1']);
    if (projected(query) === 'spA') return iriRows(['http://ex.org/sp/1']);
    if (isLink(query)) return [LINK_ROW];
    if (isSkipped(query)) return [SKIPPED_ROW];
    if (query.includes('?wellWKT')) return [{ well: 'http://ex.org/well/1', wellWKT: 'POINT(-69.75 44.35)' }];
    if (query.includes('VALUES ?sp {')) return pinned(query, 'sp').map((sp) => ({ sp, spWKT: 'POINT(-69.76 44.36)' }));
    if (query.includes('?regionWKT')) return [{ region: 'http://ex.org/r/1', regionWKT: 'POLYGON((0 0, 1 0, 1 1, 0 0))' }];
    throw new Error(`unexpected query:\n${query}`);
  });

describe('a groundwater-connected run', () => {
  it('answers by block and carries the link and regional aquifers as decoration', async () => {
    const result = await runQuestion(QUESTION, { endpoint: answering().run });
    expect(result.status).toBe('success');
    const success = result as PipelineSuccess;
    // Near's roles: block A (wells) is the target.
    expect(success.blockA.map((r) => r.well)).toEqual(['http://ex.org/well/1']);
    expect(success.blockC.map((r) => r.sp)).toEqual(['http://ex.org/sp/1']);
    expect(success.decoration.linkAquifers).toEqual([LINK_ROW]);
    expect(success.decoration.skippedAquifers).toEqual([SKIPPED_ROW]);
    expect(success.decoration.streamLines).toEqual([]);
    expect(success.partial).toBeUndefined();
  });

  it('drops a failed regional check without a word', async () => {
    const fake = answering(({ query }) => {
      if (isSkipped(query)) refuse('timeout');
    });
    const result = await runQuestion(QUESTION, { endpoint: fake.run });
    expect(result.status).toBe('success');
    const success = result as PipelineSuccess;
    expect(success.decoration.skippedAquifers).toEqual([]);
    expect(success.decoration.linkAquifers).toEqual([LINK_ROW]);
    expect(success.partial).toBeUndefined();
    // Sent once: advice is not worth a retry.
    expect(fake.calls.filter((c) => isSkipped(c.query))).toHaveLength(1);
  });

  it('keeps the answer when the link outlines fail, and says they are missing', async () => {
    const result = await runQuestion(QUESTION, {
      endpoint: answering(({ query }) => {
        if (isLink(query)) refuse('out-of-memory');
      }).run,
    });
    expect(result.status).toBe('success');
    const success = result as PipelineSuccess;
    expect(success.blockA).toHaveLength(1);
    expect(success.decoration.linkAquifers).toEqual([]);
    expect(success.partial?.map((p) => p.step)).toEqual(['Loading the aquifers that link them']);
  });
});

describe('other runs', () => {
  it('carry no link or regional aquifers', async () => {
    const near: AnalysisQuestion = { ...QUESTION, relationship: { type: 'near', hops: 1 } };
    const result = await runQuestion(near, { endpoint: answering().run });
    expect(result.status).toBe('success');
    const { decoration } = result as PipelineSuccess;
    expect('linkAquifers' in decoration).toBe(false);
    expect('skippedAquifers' in decoration).toBe(false);
  });
});
