// Self-check for the substance naming rule and for the popup's per-substance
// grouping (src/constants/substances.ts, src/engine/resultTransformer.ts).
//
//   npx tsx scripts/check-substance-labels.mts
//
// Both are silent when wrong. A drifting naming rule shows the same substance
// as "10-H-Perfluorodecanoic acid" in the filter dropdown and as a bare
// "DTXSID10630918" in the map popup, which reads as a broken query. Grouping
// that keys on the label instead of the URI merges two substances that happen
// to share a name; grouping that forgets to append merges away real results.
import assert from 'node:assert/strict';
import { substanceLabel, resolveRetired } from '../src/constants/substances';
import { buildSamplePointDetail } from '../src/engine/resultTransformer';
import type { SparqlRow } from '../src/types/sparql';

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks++;
  void name;
}

const PFDA = 'http://w3id.org/DSSTox/v1/DTXSID10630918';

// The naming rule, in priority order.
check('short form wins', () =>
  assert.equal(
    substanceLabel({ uri: PFDA, shortLabel: 'PFDA', label: 'Perfluorodecanoic acid', paramLabel: 'x' }),
    'PFDA',
  ),
);
check('full name when there is no short form', () =>
  assert.equal(substanceLabel({ uri: PFDA, label: 'Perfluorodecanoic acid' }), 'Perfluorodecanoic acid'),
);
// 33 of the 172 DSSTox substances in the graph carry no label of their own;
// every one of them is named by its source parameter.
check('source parameter names the unlabelled substances', () =>
  assert.equal(
    substanceLabel({ uri: PFDA, paramLabel: '10-H-Perfluorodecanoic acid' }),
    '10-H-Perfluorodecanoic acid',
  ),
);
check('DTXSID is the last resort', () => assert.equal(substanceLabel({ uri: PFDA }), 'DTXSID10630918'));

// Retired source parameters name their own replacement.
check('retired parameter resolves to its replacement', () =>
  assert.equal(resolveRetired('PFOS***retired***use Perfluorooctanesulfonate'), 'Perfluorooctanesulfonate'),
);
check('retired parameter with no replacement keeps its name', () =>
  assert.equal(resolveRetired('PFOS ***retired***'), 'PFOS'),
);

// The popup's grouping. These rows mirror sample
// d.wqp.sample.INSTOR_WQX-AB35759FISHPREP at sample point INSTOR_WQX-8112:
// two observations of one substance, same date, same unit, differing only in
// value, which is what looked like a duplicated row.
const row = (over: Partial<SparqlRow>): SparqlRow =>
  ({
    sp: 'https://geoconnex.us/iow/wqp/INSTOR_WQX-8112',
    spWKT: 'POINT(-86.9 39.7)',
    samplePointName: 'UMK030-0023',
    sample: 'sample.AB35759FISHPREP',
    sampleIdentifier: 'INSTOR_WQX-AB35759.FISHPREP',
    date: '2020-01-17',
    unit_sym: 'μg/kg',
    ...over,
  }) as SparqlRow;

const detail = buildSamplePointDetail([
  row({ observation: 'o1', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.249' }),
  row({ observation: 'o2', substanceUri: PFDA, substanceParamLabel: '10-H-Perfluorodecanoic acid', result_value: '0.285' }),
  row({ observation: 'o3', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3031864', substanceShortLabel: 'PFOS', result_value: '3.16' }),
  // A non-detect: no numeric value, so it is not a result to list.
  row({ observation: 'o4', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID3040148', substanceShortLabel: 'PFDS', result_value: 'non-detect' }),
]);

assert.ok(detail, 'expected a detail object');
check('one sample section', () => assert.equal(detail.samples.length, 1));
const obs = detail.samples[0].observations;
check('repeat observations collapse to one row per substance', () => assert.equal(obs.length, 2));
check('both values are kept', () =>
  assert.deepEqual(obs[0], {
    substance: '10-H-Perfluorodecanoic acid',
    substanceUri: PFDA,
    results: [0.249, 0.285],
    unit: 'μg/kg',
  }),
);
check('grouping keys on the URI, not the label', () => assert.equal(obs[1].substance, 'PFOS'));
check('max is reported with the shared label', () =>
  assert.equal(detail.maxResult?.substance, 'PFOS'),
);
check('max is the largest value', () => assert.equal(detail.maxResult?.value, 3.16));

// Two substances sharing a display name must stay on separate rows.
const shared = buildSamplePointDetail([
  row({ observation: 'o1', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID1', substanceShortLabel: 'PFOS', result_value: '1' }),
  row({ observation: 'o2', substanceUri: 'http://w3id.org/DSSTox/v1/DTXSID2', substanceShortLabel: 'PFOS', result_value: '2' }),
]);
check('same name, different URI, two rows', () =>
  assert.equal(shared?.samples[0].observations.length, 2),
);

console.log(`substance labels: ${checks} checks passed`);
