// Every word the engine shows a user about a failed, empty or incomplete run
// comes from engine/errors.ts. These pin today's wording, so moving it into
// one file changed nothing a user reads (engine redesign, Phase 0 item 2).
import { describe, expect, it } from 'vitest';
import {
  SparqlError,
  outcomeMessage,
  partialNotice,
  stepEmptyMessage,
  stepFailedMessage,
} from '../errors';
import type { PipelineResult } from '../executor';
import type { AnalysisQuestion } from '../types/query';

const MAINE = { stateCode: '23' };

const question = (overrides: Partial<AnalysisQuestion> = {}): AnalysisQuestion => ({
  blockA: { type: 'samples', region: MAINE },
  relationship: { type: 'near', hops: 1 },
  blockC: { type: 'facilities', facilityFilters: { industryCodes: ['562212'] } },
  ...overrides,
});

const failed = (error: Error): PipelineResult => ({
  status: 'error',
  failedAtStep: 0,
  message: stepFailedMessage('Finding samples near facilities'),
  error,
});

const TOO_MUCH = 'This question covers too much data for the knowledge graph to answer at once.';

describe('the message for a run that failed', () => {
  it.each([
    ['timeout', `${TOO_MUCH} Try a smaller region, or run one county at a time.`],
    ['out-of-memory', `${TOO_MUCH} Try a smaller region, or run one county at a time.`],
    ['payload-too-large', 'This question produced too much data to send in one request. Try narrowing the area or adding a filter.'],
    ['sibling-failure', 'The knowledge graph was busy and dropped this request. Running it again usually works.'],
    ['network', 'Could not reach the knowledge graph. Check your connection and try again.'],
    ['unknown', 'Something went wrong. You can edit the question and try again.'],
  ] as const)('%s', (kind, message) => {
    expect(outcomeMessage(failed(new SparqlError(kind, 429, 'detail')), question())).toBe(message);
  });

  it('treats an error that is not a SparqlError as unknown', () => {
    expect(outcomeMessage(failed(new Error('boom')), question())).toBe(
      'Something went wrong. You can edit the question and try again.',
    );
  });
});

describe('the advice when a question is too big', () => {
  const timedOut = failed(new SparqlError('timeout', 429, 'Operation timed out'));

  it('asks for a shorter distance on a bounded trace', () => {
    const q = question({ relationship: { type: 'downstream', maxDistanceKm: 30 } });
    expect(outcomeMessage(timedOut, q)).toBe(`${TOO_MUCH} Try a shorter distance than 30 km, or run those areas one at a time.`);
  });

  it('asks for a maximum distance on an unbounded trace', () => {
    const q = question({ relationship: { type: 'upstream' } });
    expect(outcomeMessage(timedOut, q)).toBe(
      `${TOO_MUCH} Setting a maximum distance on the relationship is the most effective change. An unbounded trace follows the river network to the sea.`,
    );
  });

  it('names the second block when it has no filter or region', () => {
    const q = question({ blockC: { type: 'facilities' } });
    expect(outcomeMessage(timedOut, q)).toBe(
      `${TOO_MUCH} The second block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.`,
    );
  });

  it('names the first block when only it is open', () => {
    const q = question({ blockA: { type: 'samples' } });
    expect(outcomeMessage(timedOut, q)).toBe(
      `${TOO_MUCH} The first block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.`,
    );
  });

  it('gives general advice with no question to look at', () => {
    expect(outcomeMessage(timedOut, undefined)).toBe(`${TOO_MUCH} Try a shorter distance, a smaller region, or one county at a time.`);
  });
});

describe('the message for a run with no answer', () => {
  it('says nothing matched', () => {
    const empty: PipelineResult = { status: 'empty', failedAtStep: 0, message: stepEmptyMessage('Finding samples near facilities') };
    expect(outcomeMessage(empty, question())).toBe('No results found for this query. Try adjusting the filters.');
  });

  it('is absent for a run that answered', () => {
    expect(outcomeMessage({ status: 'success', data: {} }, question())).toBeNull();
  });
});

describe('the notice for an incomplete answer', () => {
  const partial = (failedLabels: string[], skippedLabels: string[]): PipelineResult => ({
    status: 'success',
    data: {},
    partial: [{ step: 'Finding samples near facilities', failed: failedLabels, skipped: skippedLabels }],
  });

  it('names what failed and gives the advice', () => {
    expect(partialNotice(partial(['York County, Maine'], []), question({ blockC: { type: 'facilities' } }))).toBe(
      'Showing incomplete results: York County, Maine could not be answered. The second block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.',
    );
  });

  it('names what was skipped and says a rerun continues', () => {
    expect(partialNotice(partial([], ['facilities batch 4']), question())).toBe(
      'Showing incomplete results: facilities batch 4 not attempted before the time limit. Running the question again picks up where this left off.',
    );
  });

  it('lists three names and counts the rest', () => {
    const counties = ['York', 'Cumberland', 'Oxford', 'Androscoggin', 'Kennebec'];
    expect(partialNotice(partial([], counties), question())).toBe(
      'Showing incomplete results: York, Cumberland, Oxford and 2 more not attempted before the time limit. Running the question again picks up where this left off.',
    );
  });

  it('says both when some slices failed and others were skipped', () => {
    expect(partialNotice(partial(['York'], ['Oxford']), question())).toBe(
      'Showing incomplete results: York could not be answered, Oxford not attempted before the time limit. Running the question again picks up where this left off. Try a smaller region, or run one county at a time.',
    );
  });

  it('is absent for a complete answer', () => {
    expect(partialNotice({ status: 'success', data: {} }, question())).toBeNull();
  });
});

describe('the step messages a run carries', () => {
  it('name the step', () => {
    expect(stepFailedMessage('Loading details for wells')).toBe('Error at step: Loading details for wells');
    expect(stepEmptyMessage('Finding wells near facilities')).toBe('No results at step: Finding wells near facilities');
  });
});
