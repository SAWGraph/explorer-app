// Every word the engine shows a user about a failed, empty or incomplete run
// comes from engine/errors.ts. These pin today's wording, so moving it into
// one file changed nothing a user reads (engine redesign, Phase 0 item 2).
import { describe, expect, it } from 'vitest';
import {
  RUN_AGAIN_LABEL,
  SparqlError,
  canRunAgain,
  outcomeMessage,
  partialNotice,
  stepEmptyMessage,
  stepFailedMessage,
} from '../errors';
import type { PipelineResult } from '../executor';
import type { AnalysisQuestion } from '../types/query';

// A run that answered, with nothing in it.
const SUCCESS = { status: 'success', blockA: [], blockC: [], decoration: { boundaries: [], streamLines: [] } } as const satisfies PipelineResult;

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

  it('does not count the default non-detect tick as a filter', () => {
    const q = question({ blockA: { type: 'samples', sampleFilters: { includeNondetects: true } } });
    expect(outcomeMessage(timedOut, q)).toBe(
      `${TOO_MUCH} The first block has no filter or region set, which means "every one in the country". Adding a type, filter, or region there is the most effective change.`,
    );
  });
});

// The run counts both sides before discovery (engine/planner.ts). When both
// counts came back, the advice gives them and names the bigger side.
describe('the advice when a question is too big, with both sides counted', () => {
  const counted = (A: number, C: number): PipelineResult => ({
    ...failed(new SparqlError('timeout', 429, 'Operation timed out')),
    counts: { A, C },
  });

  it('gives both counts and names the bigger block', () => {
    expect(outcomeMessage(counted(4528, 459877), question())).toBe(
      `${TOO_MUCH} The first block matches 4,528 samples, the second 459,877 facilities. Adding a filter or region to the second block is the most effective change.`,
    );
  });

  it('names the first block when it is the bigger one', () => {
    expect(outcomeMessage(counted(8738, 12), question())).toBe(
      `${TOO_MUCH} The first block matches 8,738 samples, the second 12 facilities. Adding a filter or region to the first block is the most effective change.`,
    );
  });

  it('gives the counts before the distance advice on a trace', () => {
    const q = question({ relationship: { type: 'downstream', maxDistanceKm: 30 } });
    expect(outcomeMessage(counted(70, 676), q)).toBe(
      `${TOO_MUCH} The first block matches 70 samples, the second 676 facilities. Try a shorter distance than 30 km, or run those areas one at a time.`,
    );
  });

  it('falls back to the advice without counts when one count is missing', () => {
    const one: PipelineResult = { ...failed(new SparqlError('timeout', 429, 'Operation timed out')), counts: { C: 459877 } };
    expect(outcomeMessage(one, question())).toBe(`${TOO_MUCH} Try a smaller region, or run one county at a time.`);
  });

  it('gives the counts in the notice for an incomplete answer too', () => {
    const result: PipelineResult = {
      ...SUCCESS,
      partial: [{ step: 'Finding samples near facilities', failed: ['York County, Maine'], skipped: [] }],
      counts: { A: 4528, C: 459877 },
    };
    expect(partialNotice(result, question())).toBe(
      'Showing incomplete results: York County, Maine could not be answered. The first block matches 4,528 samples, the second 459,877 facilities. Adding a filter or region to the second block is the most effective change.',
    );
  });
});

describe('the message for a run with no answer', () => {
  it('says nothing matched', () => {
    const empty: PipelineResult = { status: 'empty', failedAtStep: 0, message: stepEmptyMessage('Finding samples near facilities') };
    expect(outcomeMessage(empty, question())).toBe('No results found for this query. Try adjusting the filters.');
  });

  it('names the block that matched nothing, when a count found it empty', () => {
    const empty = (block: 'A' | 'C'): PipelineResult => ({ status: 'empty', failedAtStep: 0, message: stepEmptyMessage('Counting facilities in the second block'), emptyBlock: block });
    expect(outcomeMessage(empty('C'), question())).toBe(
      'No facilities match the second block, so the question has no answer. Try a wider region or fewer filters.',
    );
    expect(outcomeMessage(empty('A'), question())).toBe(
      'No samples match the first block, so the question has no answer. Try a wider region or fewer filters.',
    );
  });

  it('is absent for a run that answered', () => {
    expect(outcomeMessage(SUCCESS, question())).toBeNull();
  });
});

describe('the notice for an incomplete answer', () => {
  const partial = (failedLabels: string[], skippedLabels: string[]): PipelineResult => ({
    ...SUCCESS,
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
    expect(partialNotice(SUCCESS, question())).toBeNull();
  });
});

describe('the step messages a run carries', () => {
  it('name the step', () => {
    expect(stepFailedMessage('Loading details for wells')).toBe('Error at step: Loading details for wells');
    expect(stepEmptyMessage('Finding wells near facilities')).toBe('No results at step: Finding wells near facilities');
  });
});

describe('the message when chunking on refusal is off', () => {
  const off = (error: Error): PipelineResult => ({ status: 'error', failedAtStep: 0, message: stepFailedMessage('Finding samples near facilities'), error, chunkingOff: true });
  const NOT_RETRIED = 'Chunking is turned off for this run, so the question was not retried or split into smaller queries. Use Run again to try it once more.';

  it('says the question was not retried or split, after a timeout', () => {
    expect(outcomeMessage(off(new SparqlError('timeout', 429, 'Operation timed out')), question())).toBe(
      `${TOO_MUCH} Try a smaller region, or run one county at a time. ${NOT_RETRIED}`,
    );
  });

  it('says so after a busy error, which chunking on would have retried', () => {
    expect(outcomeMessage(off(new SparqlError('sibling-failure', 500, 'Waited for a result from another thread')), question())).toBe(
      `The knowledge graph was busy and dropped this request. Running it again usually works. ${NOT_RETRIED}`,
    );
  });

  it('adds nothing after a network error, which chunking never retried or split', () => {
    expect(outcomeMessage(off(new SparqlError('network', 0, 'fetch failed')), question())).toBe(
      'Could not reach the knowledge graph. Check your connection and try again.',
    );
  });
});

describe('running a question again', () => {
  it('is offered after a failure, labelled Run again', () => {
    expect(canRunAgain(failed(new SparqlError('sibling-failure', 500, 'busy')))).toBe(true);
    expect(RUN_AGAIN_LABEL).toBe('Run again');
  });

  it('is not offered after an empty or a complete run', () => {
    expect(canRunAgain({ status: 'empty', failedAtStep: 0, message: stepEmptyMessage('x') })).toBe(false);
    expect(canRunAgain(SUCCESS)).toBe(false);
    expect(canRunAgain(null)).toBe(false);
  });
});
