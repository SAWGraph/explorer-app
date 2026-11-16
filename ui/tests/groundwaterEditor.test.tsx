// @vitest-environment jsdom
//
// Groundwater-connected links samples, facilities and wells only (#121, plan
// decision 2): the planner refuses any other type. So the editor keeps the
// relationship and the block types in step, the way it does for wells and the
// state: with a surface water or aquifer block the relationship is greyed out,
// and with the relationship chosen those types are, each with an info icon
// that says why.
//
//   npm test
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

import { QueryEditorContent } from '../components/QueryEditor/QueryEditorContent';
import { useQueryStore } from '../store/queryStore';
import type { AnalysisQuestion } from '../../engine/types/query';

const NOTE = 'Groundwater-connected links samples, facilities and wells only.';
const initialStore = useQueryStore.getState();

beforeEach(() => useQueryStore.setState(initialStore, true));
afterEach(cleanup);

function renderEditor(question: AnalysisQuestion) {
  useQueryStore.setState({ question });
  const { container } = render(<QueryEditorContent />);
  const open = (selector: string) => fireEvent.click(container.querySelector(`${selector} .hs-control`)!);
  const option = (label: string) => screen.getByText(label).closest('.hs-flat-option')!;
  const types = () => container.querySelectorAll('.entity-type-selector');
  return { container, open, option, types };
}

const near = (a: AnalysisQuestion['blockA']['type'], c: AnalysisQuestion['blockC']['type']): AnalysisQuestion => ({
  blockA: { type: a },
  relationship: { type: 'near', hops: 1 },
  blockC: { type: c },
});

describe('groundwater-connected in the editor', () => {
  it('offers the relationship between point types', () => {
    const { open, option } = renderEditor(near('wells', 'samples'));
    open('.relationship-selector');
    const gw = option('Groundwater-connected to');
    expect(gw.classList).not.toContain('hs-flat-option--disabled');
    fireEvent.click(gw);
    expect(useQueryStore.getState().question.relationship.type).toBe('groundwaterConnected');
  });

  it.each([
    ['waterBodies', 'samples'],
    ['wells', 'aquifers'],
    ['streams', 'facilities'],
  ] as const)('greys it out with a %s block and a %s block, and says why', (a, c) => {
    const { open, option } = renderEditor(near(a, c));
    open('.relationship-selector');
    const gw = option('Groundwater-connected to');
    expect(gw.classList).toContain('hs-flat-option--disabled');
    fireEvent.click(gw);
    expect(useQueryStore.getState().question.relationship.type).toBe('near');
    fireEvent.pointerEnter(gw.querySelector('.defined-term')!);
    expect(screen.getByRole('tooltip').textContent).toBe(NOTE);
  });

  it('greys out surface water and aquifers on both blocks once it is chosen', () => {
    const { types } = renderEditor({ ...near('wells', 'samples'), relationship: { type: 'groundwaterConnected' } });
    for (const block of types()) {
      fireEvent.click(block.querySelector('.hs-control')!);
      const offered = (label: string) =>
        [...document.querySelectorAll('.hs-flat-option')].find((o) => o.textContent?.startsWith(label))!;
      expect(offered('Surface Water').classList).toContain('hs-flat-option--disabled');
      expect(offered('Ground Water (Aquifers)').classList).toContain('hs-flat-option--disabled');
      for (const label of ['Sample Results', 'Facilities', 'Wells']) {
        expect(offered(label).classList, label).not.toContain('hs-flat-option--disabled');
      }
      fireEvent.click(block.querySelector('.hs-control')!);
    }
  });

  it('describes the relationship with its hedge', () => {
    renderEditor({ ...near('wells', 'samples'), relationship: { type: 'groundwaterConnected' } });
    expect(screen.getByText('on the same aquifer as the feature(s) below, so they may share groundwater')).toBeTruthy();
  });
});
