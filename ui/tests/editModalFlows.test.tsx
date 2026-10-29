// @vitest-environment jsdom
//
// Every way into and out of the Edit Analysis Question modal, one test per row
// of the agreed flow table. Dismissing the modal on a new analysis used to send
// the user to the dashboard and throw away results they had already applied, so
// these tests render the real routes and read the URL afterwards: a store-only
// test cannot see a stray navigate().
//
// Only the edges are faked: the query engine (so a run can succeed, fail, or
// hang until cancelled), the result cache, the discovery lookups, and the
// Leaflet map, none of which jsdom can run or should reach the network for.
//
//   npm test
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PipelineResult } from '../../engine/executor';

const engine = vi.hoisted(() => ({ executePipeline: vi.fn() }));

vi.mock('../../engine/executor', async (orig) => ({
  ...(await orig<typeof import('../../engine/executor')>()),
  executePipeline: engine.executePipeline,
}));
vi.mock('../api/resultCacheClient', () => ({
  cacheDisabled: () => true,
  fetchCachedResult: async () => null,
  fetchPublishedResult: async () => null,
  savePublishedResult: async () => undefined,
}));
vi.mock('../hooks/useDiscoveryQueries', () => {
  const none = () => ({ data: [], isLoading: false, isError: false, error: null });
  return {
    useIndustries: none,
    useIndustryCounts: none,
    useSubstances: none,
    useMaterialTypes: none,
    useCounties: none,
    useWellClassifications: none,
  };
});
vi.mock('../components/Map/ResultsMap', () => ({ ResultsMap: () => <div data-testid="map" /> }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

import { useQueryStore } from '../store/queryStore';
import { EditorView } from '../components/Layout/EditorView';
import { PublishedView } from '../components/Layout/PublishedView';
import { PREBUILT_QUERIES } from '../../engine/constants/prebuiltQueries';
import { blankAnalysisQuestion } from '../constants/blankAnalysis';
import { savedQuestionsRepo } from '../storage/savedQuestionsStore';
import type { AnalysisQuestion, EntityBlock } from '../../engine/types/query';

const PREBUILT = PREBUILT_QUERIES[0];
const API = 'http://api.test';
const initialStore = useQueryStore.getState();

const ok = (tag: string): PipelineResult => ({ status: 'success', data: { tag: [] }, queries: [{ step: 0, description: tag, endpoint: 'federation' as never, query: tag }] });
const fail: PipelineResult = { status: 'error', failedAtStep: 0, message: 'boom', error: new Error('boom') };

// The engine answers the next run with this; tests override it per run.
let nextRun: (signal?: AbortSignal) => Promise<PipelineResult>;

beforeEach(() => {
  useQueryStore.setState(initialStore, true);
  localStorage.clear();
  engine.executePipeline.mockReset();
  engine.executePipeline.mockImplementation((_steps, _q, _progress, signal?: AbortSignal) => nextRun(signal));
  nextRun = async () => ok('first');
  vi.stubEnv('VITE_API_BASE_URL', API);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The dashboard is a stub: these tests only care that the user landed there.
// The plain MemoryRouter, like the app's BrowserRouter. A data router builds a
// fetch Request per navigation, which jsdom rejects, so every navigate() would
// silently fail and hide the bug.
function renderAt(path: string) {
  const router = { state: { location: { pathname: path } } };
  function Probe() {
    const location = useLocation();
    useEffect(() => {
      router.state.location = location;
    }, [location]);
    return null;
  }
  render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        {/* Arrive from the dashboard, as the user does. */}
        <MemoryRouter initialEntries={['/', path]} initialIndex={1}>
          <Probe />
          <Routes>
            <Route path="/" element={<div data-testid="dashboard" />} />
            <Route path="/q/:queryId" element={<EditorView />} />
            <Route path="/p/:publishId" element={<PublishedView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return router;
}

const store = () => useQueryStore.getState();
const modalOpen = () => document.querySelector('.modal-content h2')?.textContent === 'Edit Analysis Question';
const barText = () => document.querySelector('.question-bar-text')?.textContent;
const runs = () => engine.executePipeline.mock.calls.length;
const button = (name: string) => screen.getByRole('button', { name });

// Stands in for picking filters in the editor; the widgets are not under test.
const EDIT: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ['3253'] } };
const EDIT2: EntityBlock = { type: 'facilities', facilityFilters: { industryCodes: ['322'] } };
const edit = () => act(() => store().setBlockC({ ...EDIT }));

const DISMISSALS = {
  'the X': () => fireEvent.click(document.querySelector('.modal-content .modal-close')!),
  Esc: () => fireEvent.keyDown(window, { key: 'Escape' }),
  'an outside click': () => fireEvent.click(document.querySelector('.modal-overlay')!),
  'Discard Changes': () => fireEvent.click(button('Discard Changes')),
} as const;
const dismissals = Object.entries(DISMISSALS);

async function apply() {
  fireEvent.click(button('Apply'));
  await waitFor(() => expect(store().isRunning).toBe(false));
}
async function applied(tag: string) {
  nextRun = async () => ok(tag);
  await apply();
  expect(modalOpen()).toBe(false);
}
async function customize() {
  await waitFor(() => expect((button('Customize') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button('Customize'));
  expect(modalOpen()).toBe(true);
}
async function openNew() {
  const router = renderAt('/q/new');
  await waitFor(() => expect(modalOpen()).toBe(true));
  return router;
}
async function openPrebuilt() {
  const router = renderAt(`/q/${PREBUILT.id}`);
  await waitFor(() => expect(store().pipelineResult).not.toBeNull());
  return router;
}
async function save() {
  fireEvent.click(button('Save'));
  fireEvent.click(document.querySelector('form button[type="submit"]')!);
  await waitFor(() => expect(store().activeQueryId).toMatch(/^saved:/));
}
// navigate() can land after the click handler returns, so a stray one only shows
// up in the URL after pending work runs. Checking right after the click would
// pass even with the bug.
async function expectStayed(router: ReturnType<typeof renderAt>, path: string) {
  await act(() => new Promise((r) => setTimeout(r, 50)));
  expect(router.state.location.pathname).toBe(path);
  expect(modalOpen()).toBe(false);
  expect(screen.queryByTestId('dashboard')).toBeNull();
}

describe('1 new analysis, nothing applied', () => {
  it.each(dismissals)('1a no edits, dismiss with %s: closes, stays on the blank map', async (_, dismiss) => {
    const router = await openNew();
    dismiss();
    await expectStayed(router, '/q/new');
    expect(store().question).toEqual(blankAnalysisQuestion());
    expect(runs()).toBe(0);
  });

  it.each(dismissals)('1b edits, no Apply, dismiss with %s: closes, back to the blank default', async (_, dismiss) => {
    const router = await openNew();
    edit();
    dismiss();
    await expectStayed(router, '/q/new');
    expect(store().question).toEqual(blankAnalysisQuestion());
    expect(runs()).toBe(0);
  });

  it('1c Apply fails, dismiss: closes, keeps the failed question and the error', async () => {
    const router = await openNew();
    edit();
    nextRun = async () => fail;
    await apply();
    expect(modalOpen()).toBe(true);
    DISMISSALS['the X']();
    await expectStayed(router, '/q/new');
    expect(store().question.blockC).toEqual(EDIT);
    expect(store().pipelineResult?.status).toBe('error');
  });
});

describe('2 new analysis, filters applied', () => {
  async function newApplied() {
    const router = await openNew();
    edit();
    await applied('first');
    return { router, question: store().question, result: store().pipelineResult, text: barText() };
  }

  it.each(dismissals)('2a Customize, no edits, dismiss with %s: closes, results kept', async (_, dismiss) => {
    const before = await newApplied();
    await customize();
    dismiss();
    await expectStayed(before.router, '/q/new');
    expect(store().question).toEqual(before.question);
    expect(store().pipelineResult).toBe(before.result);
    expect(barText()).toBe(before.text);
  });

  it.each(dismissals)('2b Customize, edits, no Apply, dismiss with %s: back to the applied question', async (_, dismiss) => {
    const before = await newApplied();
    await customize();
    act(() => store().setBlockC({ ...EDIT2 }));
    dismiss();
    await expectStayed(before.router, '/q/new');
    expect(store().question).toEqual(before.question);
    expect(store().pipelineResult).toBe(before.result);
  });

  it('2c Customize, edits, Apply succeeds: closes with the new results', async () => {
    const before = await newApplied();
    await customize();
    act(() => store().setBlockC({ ...EDIT2 }));
    await applied('second');
    await expectStayed(before.router, '/q/new');
    expect(store().pipelineResult).not.toBe(before.result);
    expect(store().pipelineResult?.status).toBe('success');
  });

  it('2d Customize, edits, Apply fails, dismiss: closes, keeps the failed question and the error', async () => {
    const before = await newApplied();
    await customize();
    act(() => store().setBlockC({ ...EDIT2 }));
    nextRun = async () => fail;
    await apply();
    DISMISSALS['the X']();
    await expectStayed(before.router, '/q/new');
    expect(store().question.blockC).toEqual(EDIT2);
    expect(store().pipelineResult?.status).toBe('error');
  });

  it('2e Save: URL becomes /q/saved:<id>, no rerun, map kept, not based on "new"', async () => {
    const before = await newApplied();
    const runsBefore = runs();
    await save();
    await waitFor(() => expect(before.router.state.location.pathname).toBe(`/q/${store().activeQueryId}`));
    expect(runs()).toBe(runsBefore);
    expect(store().pipelineResult).toBe(before.result);
    expect(savedQuestionsRepo.list()[0].basedOnQueryId).toBeNull();
    await customize();
    DISMISSALS['the X']();
    await expectStayed(before.router, `/q/${store().activeQueryId}`);
  });
});

describe('3 prebuilt analysis', () => {
  it.each(dismissals)('3a Customize, no edits, dismiss with %s: closes, stays', async (_, dismiss) => {
    const router = await openPrebuilt();
    const result = store().pipelineResult;
    await customize();
    dismiss();
    await expectStayed(router, `/q/${PREBUILT.id}`);
    expect(store().question).toEqual(PREBUILT.question);
    expect(store().pipelineResult).toBe(result);
  });

  it.each(dismissals)('3b Customize, edits, no Apply, dismiss with %s: back to the prebuilt', async (_, dismiss) => {
    const router = await openPrebuilt();
    await customize();
    edit();
    dismiss();
    await expectStayed(router, `/q/${PREBUILT.id}`);
    expect(store().question).toEqual(PREBUILT.question);
  });

  it('3c Customize, edits, Apply fails, dismiss: closes, keeps the failed question', async () => {
    const router = await openPrebuilt();
    await customize();
    edit();
    nextRun = async () => fail;
    await apply();
    DISMISSALS['the X']();
    await expectStayed(router, `/q/${PREBUILT.id}`);
    expect(store().question.blockC).toEqual(EDIT);
    expect(store().pipelineResult?.status).toBe('error');
  });
});

describe('4 prebuilt, edited and unsaved', () => {
  async function editedPrebuilt() {
    const router = await openPrebuilt();
    await customize();
    edit();
    await applied('edited');
    return { router, question: store().question, result: store().pipelineResult };
  }

  it.each(dismissals)('4a Customize, no edits, dismiss with %s: keeps the edited version', async (_, dismiss) => {
    const before = await editedPrebuilt();
    await customize();
    dismiss();
    await expectStayed(before.router, `/q/${PREBUILT.id}`);
    expect(store().question).toEqual(before.question);
    expect(store().pipelineResult).toBe(before.result);
  });

  it.each(dismissals)('4b more edits, no Apply, dismiss with %s: back to the last applied version', async (_, dismiss) => {
    const before = await editedPrebuilt();
    await customize();
    act(() => store().setBlockC({ ...EDIT2 }));
    dismiss();
    await expectStayed(before.router, `/q/${PREBUILT.id}`);
    expect(store().question).toEqual(before.question);
    expect(store().question).not.toEqual(PREBUILT.question);
  });

  it('4c Save: URL becomes /q/saved:<id>, no rerun, map kept', async () => {
    const before = await editedPrebuilt();
    const runsBefore = runs();
    await save();
    await waitFor(() => expect(before.router.state.location.pathname).toBe(`/q/${store().activeQueryId}`));
    expect(runs()).toBe(runsBefore);
    expect(store().pipelineResult).toBe(before.result);
    expect(savedQuestionsRepo.list()[0].basedOnQueryId).toBe(PREBUILT.id);
  });
});

describe('5 saved analysis', () => {
  async function openSaved(question: AnalysisQuestion = PREBUILT.question) {
    const saved = savedQuestionsRepo.create({ name: 'Mine', question, basedOnQueryId: null });
    const path = `/q/saved:${saved.id}`;
    const router = renderAt(path);
    await waitFor(() => expect(store().pipelineResult).not.toBeNull());
    return { router, path };
  }

  it.each(dismissals)('5 Customize, edits, no Apply, dismiss with %s: closes, back to the saved question', async (_, dismiss) => {
    const { router, path } = await openSaved();
    await customize();
    edit();
    dismiss();
    await expectStayed(router, path);
    expect(store().question).toEqual(PREBUILT.question);
  });
});

describe('6 published analysis', () => {
  function stubPublished() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'abc', author: 'someone', title: 'Shared', description: null, tags: [],
      question: PREBUILT.question, created_at: '2026-01-01', view_count: 0, result_key: null,
    }))));
  }
  async function openPublished() {
    stubPublished();
    const router = renderAt('/p/abc');
    await waitFor(() => expect(store().pipelineResult).not.toBeNull());
    return router;
  }

  it.each(dismissals)('6a Customize, edits, no Apply, dismiss with %s: closes, back to the published question', async (_, dismiss) => {
    const router = await openPublished();
    await customize();
    edit();
    dismiss();
    await expectStayed(router, '/p/abc');
    expect(store().question).toEqual(PREBUILT.question);
  });

  it('6b edit, Apply, Save a copy: URL becomes /q/saved:<id>, no rerun, map kept', async () => {
    const router = await openPublished();
    await customize();
    edit();
    await applied('edited');
    const result = store().pipelineResult;
    const runsBefore = runs();
    await save();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/q/${store().activeQueryId}`));
    expect(runs()).toBe(runsBefore);
    expect(store().pipelineResult).toBe(result);
  });
});

describe('7 edit tour', () => {
  it('7 Esc partway through the tour goes back to the dashboard', async () => {
    act(() => store().setPendingTour('edit'));
    const router = renderAt('/q/new');
    await waitFor(() => expect(document.querySelector('.driver-popover')).not.toBeNull(), { timeout: 3000 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyUp(window, { key: 'Escape' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(document.querySelector('.driver-popover')).toBeNull();
  });
});

describe('8 Apply running', () => {
  // The engine holds the run open until it is cancelled.
  let signalSeen: AbortSignal | undefined;
  beforeEach(() => {
    signalSeen = undefined;
  });
  const hangUntilCancelled = (signal?: AbortSignal) => {
    signalSeen = signal;
    return new Promise<PipelineResult>((_, reject) =>
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
    );
  };

  it.each(dismissals)('8 dismiss with %s mid-run: run cancelled, modal stays with edits, map unchanged', async (_, dismiss) => {
    const router = await openPrebuilt();
    const result = store().pipelineResult;
    await customize();
    edit();
    nextRun = hangUntilCancelled;
    fireEvent.click(button('Apply'));
    await waitFor(() => expect(store().isRunning).toBe(true));
    dismiss();
    await waitFor(() => expect(store().isRunning).toBe(false));
    expect(signalSeen?.aborted).toBe(true);
    expect(router.state.location.pathname).toBe(`/q/${PREBUILT.id}`);
    expect(modalOpen()).toBe(true);
    expect(store().question.blockC).toEqual(EDIT);
    expect(store().pipelineResult).toBe(result);
    expect(store().lastApplyError).toBeNull();
    expect(document.querySelector('.apply-error-callout')).toBeNull();
  });
});
