// @vitest-environment jsdom
//
// Well data only exists for Illinois and Maine, so the query editor keeps
// Wells and the state in step: each dropdown greys out what the other rules
// out, the reason is visible without waiting on a hover, and a state switch
// drops well classifications from the other state.
//
//   npm test
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../src/hooks/useDiscoveryQueries', () => {
  const none = () => ({ data: [], isLoading: false, isError: false, error: null });
  return { useCounties: none, useWellClassifications: none };
});

import { EntityBlock } from '../src/components/QueryEditor/EntityBlock';
import {
  WELLS_UNAVAILABLE_HINT,
  WELL_STATE_FIPS,
  encodeWellToken,
} from '../src/constants/wellClassifications';
import type { EntityBlock as EntityBlockType } from '../src/types/query';

const VT = '50';
const IL_WATER = encodeWellToken('ilPurpose', ['il#water']);
const ME_BEDROCK = encodeWellToken('meType', ['me#bedrock']);

afterEach(cleanup);

function renderBlock(block: EntityBlockType) {
  const onChange = vi.fn();
  const { container } = render(<EntityBlock label="A" value={block} onChange={onChange} />);
  const open = (selector: string) => fireEvent.click(container.querySelector(`${selector} .hs-control`)!);
  const option = (label: string) => screen.getByText(label).closest('.hs-flat-option')!;
  return { onChange, open, option, container };
}

describe('wells and state gating', () => {
  it('greys out Wells in the type dropdown for a state without well data', () => {
    const { open, option } = renderBlock({ type: 'samples', region: { stateCode: VT } });
    open('.entity-type-selector');
    expect(option('Wells').classList).toContain('hs-flat-option--disabled');
    expect(option('Wells').textContent).toBe(`Wells${WELLS_UNAVAILABLE_HINT}`);
  });

  it('shows the wells coverage note from an icon next to Type', () => {
    const { container } = renderBlock({ type: 'wells' });
    fireEvent.pointerEnter(container.querySelector('.entity-type-selector .defined-term')!);
    expect(screen.getByRole('tooltip').textContent).toContain('only for Illinois and Maine');
  });

  it('shows no coverage icon for other types', () => {
    const { container } = renderBlock({ type: 'samples' });
    expect(container.querySelector('.entity-type-selector .defined-term')).toBeNull();
  });

  it('greys out states without well data when Wells is the type', () => {
    const { open, option } = renderBlock({ type: 'wells', region: { stateCode: WELL_STATE_FIPS.ME } });
    open('.region-field');
    expect(option('Vermont (VT)').classList).toContain('hs-flat-option--disabled');
    expect(option('Illinois (IL)').classList).not.toContain('hs-flat-option--disabled');
  });

  it('drops classifications from the old state on a state switch', () => {
    const { open, option, onChange } = renderBlock({
      type: 'wells',
      region: { stateCode: WELL_STATE_FIPS.ME },
      wellFilters: {
        wellCategories: [IL_WATER, ME_BEDROCK],
        wellCategoryLabels: { [IL_WATER]: 'Water Well', [ME_BEDROCK]: 'Bedrock' },
      },
    });
    open('.region-field');
    fireEvent.click(option('Illinois (IL)'));
    expect(onChange.mock.calls[0][0].wellFilters).toEqual({
      wellCategories: [IL_WATER],
      wellCategoryLabels: { [IL_WATER]: 'Water Well' },
    });
  });
});
