// @vitest-environment jsdom
//
// The edit modal's step timeline. Decoration (the region boundaries) now
// starts with the run, so the last step of the plan can report before the
// first: each step must keep its number in the plan, not take the number of
// the order it reported in.
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StepProgress } from '../../engine/executor';
import { PipelineTimeline } from '../components/Pipeline/PipelineTimeline';

afterEach(cleanup);

it('numbers each step by its place in the plan, whichever reported first', () => {
  const steps: StepProgress[] = [];
  steps[0] = { stepIndex: 0, totalSteps: 5, description: 'Finding samples near facilities', status: 'running' };
  steps[4] = { stepIndex: 4, totalSteps: 5, description: 'Loading region boundaries', status: 'done', resultCount: 16 };

  render(<PipelineTimeline steps={steps} isRunning />);

  expect(screen.getByText('Step 1/5: Finding samples near facilities')).toBeTruthy();
  expect(screen.getByText('Step 5/5: Loading region boundaries')).toBeTruthy();
});
