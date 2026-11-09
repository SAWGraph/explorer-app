import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// public/reports holds temporary reports for the team (public/reports/README.md).
// They belong on the development deployment only, so a build pointed at the
// production API leaves them out. VITE_API_BASE_URL is already baked in per
// environment (.env.example), so this needs no new setting.
export const PRODUCTION_API = 'https://sawgraph-explorer-api.up.railway.app';

export function isProductionApi(apiBaseUrl: string | undefined): boolean {
  if (!apiBaseUrl) return false;
  try {
    return new URL(apiBaseUrl).host === new URL(PRODUCTION_API).host;
  } catch {
    return false;
  }
}

export function reportsDevOnly(apiBaseUrl: string | undefined): Plugin {
  let outDir = 'dist';
  return {
    name: 'reports-dev-only',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (isProductionApi(apiBaseUrl)) rmSync(resolve(outDir, 'reports'), { recursive: true, force: true });
    },
  };
}
