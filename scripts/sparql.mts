// Print the SPARQL the app sends for any catalog entry.
//
//   npm run sparql                                       # list every entry
//   npm run sparql -- "samples upstream facilities [ME on C]"
//   npm run sparql -- "dropdown: substance"              # case-insensitive substring
import { catalog, pretty } from '../src/engine/queries/catalog';

const entries = catalog();
const arg = process.argv.slice(2).join(' ').trim();
if (!arg) {
  for (const e of entries) console.log(e.name);
  process.exit(0);
}

const exact = entries.filter((e) => e.name === arg);
const matches = exact.length ? exact : entries.filter((e) => e.name.toLowerCase().includes(arg.toLowerCase()));
if (!matches.length) {
  console.error(`No catalog entry matches "${arg}". Run with no argument to list them.`);
  process.exit(1);
}
if (matches.length > 5) {
  console.error(`${matches.length} entries match "${arg}". Be more specific, for example:`);
  for (const e of matches.slice(0, 10)) console.error(`  ${e.name}`);
  process.exit(1);
}
for (const e of matches) {
  console.log(`## ${e.name}${e.usedBy ? `\n# sent from ${e.usedBy}` : ''}`);
  e.steps.forEach((s, i) => {
    console.log(`\n# Step ${i + 1}: ${s.type} on ${s.endpoint}${s.description ? `, "${s.description}"` : ''}\n${pretty(s.query)}`);
  });
  console.log();
}
