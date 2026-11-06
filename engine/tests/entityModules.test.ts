// What a type of entity knows lives in its module, engine/entities/<type>.ts:
// its IRI variable, how it binds inside a cell, its filter SPARQL, its region
// check, how its details load, and whether it is a flowline. The stages ask the
// module instead of switching on the type.
//
// A switch on the type somewhere else is where the next type gets forgotten:
// adding aquifers once meant edits in about 8 files. This fails when a new one
// appears outside engine/entities/. The few left are named below, each with the
// reason it stays.
import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES, entityFor } from '../entities';

const SOURCES = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// The forms a switch on the type takes: `case 'wells'`, a comparison either way
// round with == or ===, a list check (`['wells', ...].includes(...)`) and a map
// keyed by every type.
const TYPE = `['"](?:samples|facilities|waterBodies|wells|aquifers|streams)['"]`;
const SWITCH_ON_TYPE = new RegExp(
  [`case ${TYPE}`, `[!=]==?\\s*${TYPE}`, `${TYPE}\\s*[!=]==?`, `\\[[^\\]]*${TYPE}[^\\]]*\\]\\s*\\.includes\\(`, `Record<EntityType\\b`].join('|'),
  'g',
);
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Files allowed to name entity types, and why.
const STAYS: Record<string, string> = {
  // The question as a sentence. Its per-type wording moves to the modules in
  // the next Phase 0 item (P0.4b).
  '../questionGenerator.ts': 'sentence wording, moves in P0.4b',
  // A warning measured for one samples and facilities combination; kept as is
  // until live counts can replace it (redesign decision 22).
  '../queryBreadth.ts': 'measured samples x facilities warning, decision 22',
};

describe('entity types are only switched on in their modules', () => {
  const engineFiles = Object.keys(SOURCES).filter(
    (f) => f.startsWith('../') && !f.startsWith('../entities/') && !f.startsWith('../tests/') && !f.startsWith('../scripts/'),
  );

  it('finds the engine sources', () => {
    expect(engineFiles.length).toBeGreaterThan(20);
  });

  it('no file outside engine/entities/ switches on an entity type, except the named ones', () => {
    const switching = engineFiles.filter((f) => (code(SOURCES[f]).match(SWITCH_ON_TYPE) ?? []).length > 0);
    expect(switching.sort()).toEqual(Object.keys(STAYS).sort());
  });
});

describe('every entity type has a module', () => {
  it.each(ENTITY_TYPES)('%s', (type) => {
    const entity = entityFor(type);
    expect(entity.type).toBe(type);
    expect(entity.label.length).toBeGreaterThan(0);
  });

  it('covers all six types', () => {
    expect([...ENTITY_TYPES].sort()).toEqual(['aquifers', 'facilities', 'samples', 'streams', 'waterBodies', 'wells']);
  });
});
