// Every dropdown query in the catalog, against the live endpoints: it must
// answer, with rows, carrying the columns the hook reads. A dropdown that
// comes back empty does not error; it silently shows the hardcoded fallback,
// which is how the Substance dropdown went empty on 2026-09-08 unnoticed.
//
//   npm run test:live
//
// Skipped unless LIVE=1. Measured 2026-09-29: all ten in about 18s, slowest
// Substance in Maine at 10.8s.
import { describe, expect, test } from 'vitest';
import { lookupEntries } from './catalog';
import { executeSparql } from '../sparqlClient';
import type { EndpointKey } from '../../constants/endpoints';

// The columns each hook's row mapper reads (src/hooks/useDiscoveryQueries.ts).
const COLUMNS: Record<string, string[]> = {
  industries: ['code', 'label', 'groupCode'],
  industryCounts: ['industryCode', 'num'],
  substances: ['substance', 'num'],
  // bucketPrio is OPTIONAL in the query; rows without one land in Other.
  materialTypes: ['matType', 'num'],
  counties: ['county', 'countyName'],
  illinoisWellPurposes: ['value', 'num'],
  maineWellTypes: ['value', 'num'],
  maineWellUses: ['value', 'num'],
};

describe.skipIf(!process.env.LIVE)('dropdown queries answer live', () => {
  for (const entry of lookupEntries().filter((e) => e.name.startsWith('DROPDOWN: '))) {
    for (const step of entry.steps) {
      test(`${entry.name}${entry.steps.length > 1 ? `, ${step.type}` : ''}`, { timeout: 90_000 }, async () => {
        const rows = await executeSparql(step.endpoint as EndpointKey, step.query);
        expect(rows.length, 'no rows: the app would show the hardcoded fallback').toBeGreaterThan(0);
        for (const column of COLUMNS[step.type]) {
          expect(rows.every((r) => r[column] !== undefined), `some rows lack ?${column}`).toBe(true);
        }
      });
    }
  }
});
