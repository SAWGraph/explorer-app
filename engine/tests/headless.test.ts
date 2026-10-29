// The engine must run without a browser or a UI, so a new UI can replace ui/
// without touching it. Today it imports no packages at all, only its own
// files. A package that is not UI code (a WKT parser, say) can be added to
// ALLOWED_PACKAGES on purpose; anything else fails here.
import { describe, expect, it } from 'vitest';

const ALLOWED_PACKAGES: string[] = [];

const SOURCES = import.meta.glob(['../**/*.ts', '!../tests/**'], {
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
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  for (const [file, src] of Object.entries(SOURCES)) {
    it(`${file.slice(3)} imports nothing outside engine/ and uses no browser globals`, () => {
      const at = new URL(file, 'file:///engine/tests/');
      const leaks = [...code(src).matchAll(SPECIFIER)]
        .map((m) => m[1] ?? m[2] ?? m[3])
        .filter((spec) =>
          spec.startsWith('.')
            ? !new URL(spec, at).pathname.startsWith('/engine/')
            : !ALLOWED_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`)),
        );
      expect(leaks).toEqual([]);
      expect(code(src)).not.toMatch(BROWSER);
    });
  }
});
