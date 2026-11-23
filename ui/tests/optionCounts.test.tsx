// @vitest-environment jsdom
//
// Each filter dropdown shows how many entities every option would find, in the
// block's region or nationwide with none (#165). The counts come from one live
// query per type and region (buildOptionCountQuery), faked here.
//
//   npm test
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SparqlRow } from '../../engine/types/sparql';

const executeSparql = vi.fn<(endpoint: string, query: string) => Promise<SparqlRow[]>>();
vi.mock('../../engine/endpoint', () => ({
  executeSparql: (endpoint: string, query: string) => executeSparql(endpoint, query),
}));

import { EntityBlock } from '../components/QueryEditor/EntityBlock';
import { encodeWellToken } from '../../engine/constants/wellClassifications';
import type { EntityBlock as EntityBlockType } from '../../engine/types/query';

const isOptionCount = (query: string) => query.includes('GROUP BY ?option');
const optionCountCalls = () => executeSparql.mock.calls.filter(([, q]) => isOptionCount(q));

// Answers every option count query with `counts`, the option list queries that
// mention `listFor` with `listRows`, and everything else empty.
function answer(counts: Record<string, number>, listRows: SparqlRow[] = [], listFor = '') {
  executeSparql.mockImplementation(async (_endpoint, query) => {
    if (isOptionCount(query)) return Object.entries(counts).map(([option, count]) => ({ option, count: String(count) }));
    return query.includes(listFor) ? listRows : [];
  });
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderBlock(block: EntityBlockType, client = newClient()) {
  const { container, unmount } = render(
    <QueryClientProvider client={client}>
      <EntityBlock label="A" value={block} onChange={() => undefined} />
    </QueryClientProvider>,
  );
  const open = (selector: string) => fireEvent.click(container.querySelector(`${selector} .hs-control`)!);
  return { open, unmount };
}

beforeEach(() => {
  executeSparql.mockReset();
});
afterEach(cleanup);

describe('aquifer type counts', () => {
  it('sums the raw types each option covers, in the region', async () => {
    answer({ 'coarse-grain_materials': 96, sand_gravel: 2, bedrock: 1 });
    const { open } = renderBlock({ type: 'aquifers', region: { stateCode: '17', countyCodes: ['17031'] }, aquiferFilters: { aquiferTypes: ['bedrock'] } });
    open('.aquifer-filters');
    expect(await screen.findByText('Sand & gravel (surficial) (98)')).toBeTruthy();
    // The picked option's chip carries the count too.
    expect(screen.getAllByText('Bedrock (1)').length).toBe(2);
    const [[endpoint, query]] = optionCountCalls();
    expect(endpoint).toBe('federation');
    expect(query).toContain('administrativeRegion.USA.17031');
  });
});

describe('feature type counts', () => {
  it('counts each child and rolls the parents up, nationwide with no region', async () => {
    answer({ LakePond: 60083, SwampMarsh: 12015, Reservoir: 886, StreamRiver: 353003 });
    const { open } = renderBlock({ type: 'waterBodies' });
    open('.surface-water-filters');
    expect(await screen.findByText('Lake / Pond (60,083)')).toBeTruthy();
    expect(screen.getByText('Surface Water Bodies (72,984)')).toBeTruthy();
    expect(screen.getByText('Stream / River (353,003)')).toBeTruthy();
    const queries = optionCountCalls().map(([, q]) => q);
    expect(queries.some((q) => q.includes('hyf:HY_WaterBody'))).toBe(true);
    expect(queries.some((q) => q.includes('hyf:HY_FlowPath'))).toBe(true);
    expect(queries.every((q) => !q.includes('administrativeRegion'))).toBe(true);
  });
});

describe('industry counts', () => {
  it('shows nationwide counts with no region picked', async () => {
    answer({ 'http://w3id.org/fio/v1/naics#NAICS-11': 2094 }, [
      { code: '11', label: 'Agriculture', groupCode: '11', groupLabel: 'Agriculture' },
    ]);
    const { open } = renderBlock({ type: 'facilities', facilityFilters: { industryCodes: ['11'] } });
    open('.facility-filters');
    expect(await screen.findByText('11 - Agriculture (2,094)')).toBeTruthy();
    expect(optionCountCalls()[0][1]).not.toContain('administrativeRegion');
  });
});

describe('well classification counts', () => {
  const bedrock = 'http://sawgraph.spatialai.org/v1/me-mgs-data#d.wellType.Bedrock';

  it('counts the wells in the county, not the whole state', async () => {
    answer({ [bedrock]: 7236 }, [{ value: bedrock, num: '79336' }], 'me_mgs:ofWellType');
    const { open } = renderBlock({
      type: 'wells',
      region: { stateCode: '23', countyCodes: ['23009'] },
      wellFilters: { wellCategories: [encodeWellToken('meType', [bedrock])] },
    });
    open('.well-filters');
    expect((await screen.findAllByText('Bedrock (7,236)')).length).toBe(2);
    expect(screen.queryByText('Bedrock (79,336)')).toBeNull();
    expect(optionCountCalls()[0][1]).toContain('administrativeRegion.USA.23009');
  });
});

describe('a failed count', () => {
  it('leaves the dropdown usable with no numbers', async () => {
    executeSparql.mockImplementation(async (_e, query) => {
      if (isOptionCount(query)) throw new Error('429 Too Many Requests');
      return [];
    });
    const { open } = renderBlock({ type: 'aquifers', aquiferFilters: { aquiferTypes: ['bedrock'] } });
    open('.aquifer-filters');
    await vi.waitFor(() => expect(optionCountCalls().length).toBe(1));
    expect(screen.getAllByText('Bedrock').length).toBe(2);
  });
});

describe('count caching', () => {
  it('fetches a type and region once a session, and again for a new region', async () => {
    answer({ bedrock: 14 });
    const client = newClient();
    const block = (countyCodes: string[]): EntityBlockType => ({
      type: 'aquifers',
      region: { stateCode: '17', countyCodes },
      aquiferFilters: { aquiferTypes: ['bedrock'] },
    });
    renderBlock(block(['17031', '17043']), client).unmount();
    await vi.waitFor(() => expect(optionCountCalls().length).toBe(1));
    // The same counties in another order reuse the cached counts.
    renderBlock(block(['17043', '17031']), client).unmount();
    renderBlock(block(['17031']), client);
    await vi.waitFor(() => expect(optionCountCalls().length).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(optionCountCalls().length).toBe(2);
    expect(optionCountCalls()[1][1]).not.toContain('17043');
  });
});
