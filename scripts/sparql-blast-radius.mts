// Which catalog entries generate different SPARQL than a base snapshot, as
// Markdown. CI writes this to the pull request's job summary.
//
//   npx tsx scripts/sparql-blast-radius.mts <base snapshot file>
//
// Compares against the committed snapshot rather than regenerating it: npm
// test has already failed the build if the committed one is stale.
import { existsSync, readFileSync } from 'node:fs';
import { blastRadius, formatBlastRadius } from '../src/engine/queries/snapshot';

const HEAD = new URL('../src/engine/queries/__snapshots__/query-shapes.txt', import.meta.url);
const base = process.argv[2];

console.log('### SPARQL blast radius\n');
if (!base || !existsSync(base) || !readFileSync(base, 'utf8').trim()) {
  console.log('No snapshot on the base branch to compare against.');
} else {
  console.log(formatBlastRadius(blastRadius(readFileSync(base, 'utf8'), readFileSync(HEAD, 'utf8')), 100));
  console.log('\nPrint any entry\'s SPARQL with `npm run sparql -- "<name>"`.');
}
