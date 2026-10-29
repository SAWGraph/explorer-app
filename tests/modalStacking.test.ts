// The Save and Publish dialogs opened under the map's zoom buttons and panels:
// both sat at z-index 1000, and on a tie the element later in the page wins,
// which was the map (#88). jsdom can't compute stacking, so compare the rules.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const zIndex = (file: string, selector: string) => {
  const rule = readFileSync(file, 'utf8').match(new RegExp(`${selector}\\s*\\{[^}]*?z-index:\\s*(\\d+)`));
  return Number(rule![1]);
};

it('puts dialogs above the map controls', () => {
  const dialog = zIndex('src/App.css', '\\.modal-overlay');
  const mapControls = zIndex('node_modules/leaflet/dist/leaflet.css', '\\.leaflet-top,\\s*\\.leaflet-bottom');
  expect(dialog).toBeGreaterThan(mapControls);
});
