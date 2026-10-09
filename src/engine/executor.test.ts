// The executor with the network faked out: what passes from step to step, when
// a step is split and how the slices merge, and when a failure is partial
// rather than fatal. Real steps come from the planner; these are minimal ones,
// so a failure here is about orchestration and never about a query.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { executePipeline, type StepProgress } from './executor';
import { executeSparql } from './sparqlClient';
import { SparqlError } from './sparqlErrors';
import type { PipelineStep, PipelineStepType } from './planner';
import type { Scope } from './scope';
import type { AnalysisQuestion } from '../types/query';
import type { SparqlRow } from '../types/sparql';

vi.mock('./sparqlClient', () => ({ executeSparql: vi.fn() }));
const sparql = vi.mocked(executeSparql);

const QUESTION = {} as AnalysisQuestion;
const timeout = () => new SparqlError('timeout', 429, 'Operation timed out');

// The executor remembers queries that failed whole, for the session, so every
// test builds query text that no other test uses.
let run = 0;
beforeEach(() => {
  run++;
  sparql.mockReset();
});

const step = (type: PipelineStepType, extra: Partial<PipelineStep> = {}): PipelineStep => ({
  type,
  endpoint: 'federation',
  description: type,
  buildQuery: (_ctx, scope) => `${run} ${type} ${scope?.label ?? 'whole'}`,
  ...extra,
});

// Answers by query text; anything unlisted returns no rows.
const answer = (table: Record<string, SparqlRow[] | Error>) =>
  sparql.mockImplementation(async (_endpoint, query) => {
    const hit = table[query.slice(String(run).length + 1)];
    if (hit instanceof Error) throw hit;
    return hit ?? [];
  });

const progress = () => {
  const events: StepProgress[] = [];
  return { events, onProgress: (p: StepProgress) => events.push(p) };
};

describe('step to step', () => {
  test('target and anchor IRIs reach later steps, deduplicated', async () => {
    let seenByHydrate: { targets: string[]; anchors: string[] } | undefined;
    answer({
      'FIND_TARGET_IRIS whole': [{ iri: 't1' }, { iri: 't2' }, { iri: 't1' }],
      'FIND_ANCHOR_IRIS whole': [{ iri: 'a1' }],
      'HYDRATE_TARGET_BY_IRI whole': [{ sp: 't1' }],
    });
    const hydrate = step('HYDRATE_TARGET_BY_IRI', {
      buildQuery: (ctx) => {
        seenByHydrate = { targets: ctx.targetIris, anchors: ctx.anchorIris };
        return `${run} HYDRATE_TARGET_BY_IRI whole`;
      },
    });
    const result = await executePipeline([step('FIND_TARGET_IRIS'), step('FIND_ANCHOR_IRIS'), hydrate], QUESTION, () => {});
    assert.deepEqual(seenByHydrate, { targets: ['t1', 't2'], anchors: ['a1'] });
    assert.equal(result.status, 'success');
  });

  test('hydrate results are aliased into the keys the map layer reads', async () => {
    answer({
      'FIND_TARGET_IRIS whole': [{ iri: 't1' }],
      'HYDRATE_TARGET_BY_IRI whole': [{ sp: 't1' }],
      'HYDRATE_ANCHOR_BY_IRI whole': [{ facility: 'a1' }],
    });
    const result = await executePipeline(
      [step('FIND_TARGET_IRIS'), step('HYDRATE_TARGET_BY_IRI'), step('HYDRATE_ANCHOR_BY_IRI')],
      QUESTION,
      () => {},
    );
    assert.equal(result.status, 'success');
    if (result.status !== 'success') return;
    assert.deepEqual(result.data.FIND_TARGET_ENTITIES, [{ sp: 't1' }]);
    assert.deepEqual(result.data.GET_ANCHOR_DETAILS, [{ facility: 'a1' }]);
  });

  // The modern form of the first bug in docs/DEBUGGING.md: a step that found
  // nothing let the pipeline carry on with stale data and draw the whole US.
  test('no targets stops the pipeline as empty, and nothing after it runs', async () => {
    answer({});
    const result = await executePipeline([step('FIND_TARGET_IRIS'), step('HYDRATE_TARGET_BY_IRI')], QUESTION, () => {});
    assert.equal(result.status, 'empty');
    assert.equal(sparql.mock.calls.length, 1);
  });
});

describe('splitting', () => {
  const halves: Scope[] = [{ label: 'half 1' }, { label: 'half 2' }];

  test('a timeout splits the step, and overlapping slices merge as a set', async () => {
    answer({
      'FIND_TARGET_IRIS whole': timeout(),
      'FIND_TARGET_IRIS half 1': [{ iri: 't1' }, { iri: 't2' }],
      'FIND_TARGET_IRIS half 2': [{ iri: 't2' }, { iri: 't3' }],
    });
    const divide = vi.fn(async (_ctx, scope?: Scope) => (scope ? null : halves));
    const { events, onProgress } = progress();
    const result = await executePipeline([step('FIND_TARGET_IRIS', { divide })], QUESTION, onProgress);

    assert.equal(result.status, 'success');
    if (result.status !== 'success') return;
    assert.deepEqual(result.data.FIND_TARGET_IRIS, [{ iri: 't1' }, { iri: 't2' }, { iri: 't3' }]);
    assert.equal(result.partial, undefined);
    // The UI is told how many slices there are once the step splits.
    expect(events).toContainEqual(expect.objectContaining({ status: 'running', chunksTotal: 2 }));
  });

  test('a slice that cannot be split further is reported, and the others are kept', async () => {
    answer({
      'FIND_TARGET_IRIS whole': timeout(),
      'FIND_TARGET_IRIS half 1': [{ iri: 't1' }],
      'FIND_TARGET_IRIS half 2': timeout(),
    });
    const divide = async (_ctx: unknown, scope?: Scope) => (scope ? null : halves);
    const result = await executePipeline([step('FIND_TARGET_IRIS', { divide })], QUESTION, () => {});
    assert.equal(result.status, 'success');
    if (result.status !== 'success') return;
    assert.deepEqual(result.data.FIND_TARGET_IRIS, [{ iri: 't1' }]);
    assert.deepEqual(result.partial, [{ step: 'FIND_TARGET_IRIS', failed: ['half 2'], skipped: [] }]);
  });

  test('an error that splitting cannot help is not split', async () => {
    answer({ 'FIND_TARGET_IRIS whole': new SparqlError('sibling-failure', 500, 'Waited for a result from another thread') });
    const divide = vi.fn(async () => halves);
    const result = await executePipeline([step('FIND_TARGET_IRIS', { divide })], QUESTION, () => {});
    assert.equal(divide.mock.calls.length, 0);
    assert.equal(result.status, 'error');
  });

  test('a query that failed whole once is split straight away the next time', async () => {
    answer({ 'FIND_TARGET_IRIS whole': timeout(), 'FIND_TARGET_IRIS half 1': [{ iri: 't1' }] });
    const divide = async (_ctx: unknown, scope?: Scope) => (scope ? null : halves);
    const steps = [step('FIND_TARGET_IRIS', { divide })];
    await executePipeline(steps, QUESTION, () => {});
    sparql.mockClear();
    await executePipeline(steps, QUESTION, () => {});
    const queries = sparql.mock.calls.map(([, q]) => q);
    assert.ok(!queries.includes(`${run} FIND_TARGET_IRIS whole`), 'the known-too-large whole query was sent again');
  });
});

describe('failure', () => {
  test('a required step with no rows and a failure ends the run as an error at that step', async () => {
    answer({ 'FIND_TARGET_IRIS whole': [{ iri: 't1' }], 'HYDRATE_TARGET_BY_IRI whole': new Error('network down') });
    const { events, onProgress } = progress();
    const result = await executePipeline([step('FIND_TARGET_IRIS'), step('HYDRATE_TARGET_BY_IRI')], QUESTION, onProgress);
    assert.equal(result.status, 'error');
    if (result.status !== 'error') return;
    assert.equal(result.failedAtStep, 1);
    assert.equal(result.error.message, 'network down');
    expect(events.at(-1)).toMatchObject({ stepIndex: 1, status: 'failed' });
  });

  test('an optional step that fails leaves a partial success', async () => {
    answer({ 'FIND_TARGET_IRIS whole': [{ iri: 't1' }], 'GET_REGION_BOUNDARIES whole': new Error('boundary endpoint down') });
    const result = await executePipeline(
      [step('FIND_TARGET_IRIS'), step('GET_REGION_BOUNDARIES', { optional: true })],
      QUESTION,
      () => {},
    );
    assert.equal(result.status, 'success');
    if (result.status !== 'success') return;
    assert.deepEqual(result.partial, [{ step: 'GET_REGION_BOUNDARIES', failed: ['whole query'], skipped: [] }]);
  });
});
