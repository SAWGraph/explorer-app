// @vitest-environment jsdom
//
// A failed run offers "Run again" on the error strip. It is the only retry a
// run with chunking off gets (the engine does not retry then), and it helps
// with chunking on too: a server that was busy a minute ago often answers now.
// It runs the same question fresh, skipping the result cache.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PipelineResult } from '../../engine/executor';
import { SparqlError } from '../../engine/errors';

const engine = vi.hoisted(() => ({ runQuestion: vi.fn(), fetchCachedResult: vi.fn() }));
vi.mock('../../engine/run', () => ({ runQuestion: engine.runQuestion }));
vi.mock('../api/resultCacheClient', () => ({ fetchCachedResult: engine.fetchCachedResult }));

import { useQueryStore } from '../store/queryStore';
import { PipelineProgressStrip } from '../components/Pipeline/PipelineProgressStrip';

const initial = useQueryStore.getState();
const FAILED: PipelineResult = {
  status: 'error',
  failedAtStep: 0,
  message: 'Error at step: Finding samples near facilities',
  error: new SparqlError('timeout', 429, 'Operation timed out'),
  failure: { code: 'timeout', slices: { failed: [], skipped: [] }, status: 429, raw: 'Operation timed out' },
};

beforeEach(() => {
  useQueryStore.setState(initial, true);
  engine.runQuestion.mockReset().mockResolvedValue({ status: 'success', blockA: [], blockC: [], decoration: { boundaries: [], streamLines: [] } });
  engine.fetchCachedResult.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

describe('Run again on the error strip', () => {
  it('shows on a failed run and runs the question again, skipping the cache', async () => {
    useQueryStore.setState({ pipelineResult: FAILED });
    render(<PipelineProgressStrip />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    });

    expect(engine.runQuestion).toHaveBeenCalledTimes(1);
    expect(engine.fetchCachedResult).not.toHaveBeenCalled();
    expect(useQueryStore.getState().pipelineResult?.status).toBe('success');
  });

  it('is not offered when the run found nothing (running it again finds nothing again)', () => {
    useQueryStore.setState({ pipelineResult: { status: 'empty', failedAtStep: 0, message: 'No results at step: x' } });
    render(<PipelineProgressStrip />);
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
  });

  it('is not offered while a run is going', () => {
    useQueryStore.setState({ pipelineResult: FAILED, isRunning: true });
    render(<PipelineProgressStrip />);
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
  });
});
