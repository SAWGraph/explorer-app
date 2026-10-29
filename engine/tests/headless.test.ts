// The engine must run without a browser or a UI, so a new UI can replace ui/
// without touching it. Today it imports no packages at all, only its own
// files. A package that is not UI code (a WKT parser, say) can be added to
// ALLOWED_PACKAGES on purpose; anything else fails here. The tests in this
// folder are held to the same boundary, plus vitest and Node builtins, so a UI
// test that lands here (a merge once put one here) fails instead of running.
import { describe, expect, it } from 'vitest';

const ALLOWED_PACKAGES: string[] = [];
const ALLOWED_IN_TESTS = ['vitest', 'node:'];

const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// import/export ... from '...', a bare import '...', and import('...').
const SPECIFIER = /^\s*(?:import|export)\s[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm;
const BROWSER = /\b(?:window|document|localStorage|sessionStorage|navigator)\s*\.|import\.meta\.env/;

// Comments are dropped so prose like "the document." is not read as code.
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('engine is headless', () => {
  it('finds the engine sources', () => {
    expect(Object.keys(SOURCES).filter((f) => f.startsWith('../')).length).toBeGreaterThan(20);
  });

  for (const [file, src] of Object.entries(SOURCES)) {
    const at = new URL(file, 'file:///engine/tests/');
    const path = at.pathname.slice('/engine/'.length);
    const isTest = path.startsWith('tests/');
    const allowed = isTest ? [...ALLOWED_PACKAGES, ...ALLOWED_IN_TESTS] : ALLOWED_PACKAGES;
    it(`${path} imports nothing outside engine/${isTest ? '' : ' and uses no browser globals'}`, () => {
      const leaks = [...code(src).matchAll(SPECIFIER)]
        .map((m) => m[1] ?? m[2] ?? m[3])
        .filter((spec) =>
          spec.startsWith('.')
            ? !new URL(spec, at).pathname.startsWith('/engine/')
            : !allowed.some((p) => spec === p || spec.startsWith(p.endsWith(':') ? p : `${p}/`)),
        );
      expect(leaks).toEqual([]);
      if (!isTest) expect(code(src)).not.toMatch(BROWSER);
    });
  }
});
