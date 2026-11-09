// Temporary reports (public/reports) ship to the development deployment only:
// a build pointed at the production API drops them (vite.reports.ts). If this
// broke, a report would quietly appear on explorer.sawgraph.com.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { isProductionApi, reportsDevOnly } from '../../vite.reports';

describe('isProductionApi', () => {
  it.each([
    ['https://sawgraph-explorer-api.up.railway.app', true],
    ['https://sawgraph-explorer-api.up.railway.app/', true],
    ['https://sawgraph-explorer-api-development.up.railway.app', false],
    ['http://localhost:3001', false],
    ['', false],
    [undefined, false],
    ['not a url', false],
  ])('%s is production: %s', (url, expected) => {
    expect(isProductionApi(url)).toBe(expected);
  });
});

describe('reportsDevOnly', () => {
  function buildWith(apiBaseUrl: string): string {
    const root = mkdtempSync(join(tmpdir(), 'reports-'));
    mkdirSync(join(root, 'dist/reports'), { recursive: true });
    writeFileSync(join(root, 'dist/reports/r.html'), '<!doctype html>');
    const plugin = reportsDevOnly(apiBaseUrl);
    (plugin.configResolved as (c: ResolvedConfig) => void)({ root, build: { outDir: 'dist' } } as ResolvedConfig);
    (plugin.closeBundle as () => void)();
    return root;
  }

  it('drops the reports from a production build', () => {
    const root = buildWith('https://sawgraph-explorer-api.up.railway.app');
    expect(existsSync(join(root, 'dist/reports'))).toBe(false);
  });

  it('keeps them in a development build', () => {
    const root = buildWith('https://sawgraph-explorer-api-development.up.railway.app');
    expect(existsSync(join(root, 'dist/reports/r.html'))).toBe(true);
  });
});
