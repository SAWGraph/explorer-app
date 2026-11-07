// Reports in public/reports are temporary: each carries an expiry date, and
// this fails once one is past it, so an old report is deleted (or kept on
// purpose by moving its date) instead of lingering on the deployed app.
// See public/reports/README.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../public/reports');
const reports = readdirSync(DIR).filter((f) => f.endsWith('.html'));
const readme = readFileSync(join(DIR, 'README.md'), 'utf8');

function expiryOf(file: string): string | undefined {
  const html = readFileSync(join(DIR, file), 'utf8');
  return /<meta\s+name="expires"\s+content="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1];
}

describe('temporary reports', () => {
  it.each(reports)('%s has an expiry date that has not passed', (file) => {
    const expires = expiryOf(file);
    expect(expires, `${file} needs <meta name="expires" content="YYYY-MM-DD">`).toBeDefined();
    const today = new Date().toISOString().slice(0, 10);
    expect(
      expires! >= today,
      `${file} expired on ${expires}: delete it and its README row, or move the date on purpose`,
    ).toBe(true);
  });

  it.each(reports)('%s is listed in the README with the same date', (file) => {
    const row = readme.split('\n').find((line) => line.includes(`\`${file}\``));
    expect(row, `add a row for ${file} to public/reports/README.md`).toBeDefined();
    expect(row).toContain(expiryOf(file)!);
  });

  it('the README lists no report that is gone', () => {
    const listed = [...readme.matchAll(/^\| `([^`]+\.html)`/gm)].map((m) => m[1]);
    expect(listed.filter((f) => !reports.includes(f))).toEqual([]);
  });
});
