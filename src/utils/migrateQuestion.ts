import type { AnalysisQuestion } from '../types/query';

// The August 2026 reload split the sawgraph namespaces in two directions:
// instance data moved to v2/<source>-data#, while controlled vocabulary came
// *out* of -data into the root v1/<source>#. Verified live 2026-09-11 — all 171
// material types sit in v1/me-egad# and v1/us-wqp#, and nothing is
// dual-published, so every v1 "-data#" vocabulary IRI is now dead.
//
// This matters because questions outlive the graph. A question saved to
// localStorage or published to the backend before the reload still pins the old
// IRI, and a VALUES clause listing a dead IRI is valid SPARQL: the endpoint
// answers 200 with zero rows, so the map renders empty and looks exactly like an
// honest "no data here". Rewriting on read fixes both stores without a
// migration script.
const DEAD_VOCAB_NS = /http:\/\/w3id\.org\/sawgraph\/v1\/([a-z-]+)-data#/g;

// ponytail: stringify/parse rather than walking the tree. A question only ever
// stores vocabulary IRIs — instance IRIs are discovered at query time — so a
// blanket rewrite is safe, and this way it also catches the label maps, which
// hold IRIs as object *keys*.
export function migrateQuestion(question: AnalysisQuestion): AnalysisQuestion {
  const json = JSON.stringify(question);
  if (!DEAD_VOCAB_NS.test(json)) return question;
  DEAD_VOCAB_NS.lastIndex = 0; // /g regexes carry state across .test()
  return JSON.parse(
    json.replace(DEAD_VOCAB_NS, 'http://w3id.org/sawgraph/v1/$1#'),
  ) as AnalysisQuestion;
}
