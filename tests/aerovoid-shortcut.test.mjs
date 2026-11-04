import test from 'node:test';
import assert from 'node:assert/strict';
import { entersShortcut, shortcutLateral, mainLateral, shortcutProgress, followsForward } from '../src/games/aerovoid/game/shortcut.ts';
test('shortcut selection is directional and only the selected lane enters', () => {
  assert.equal(entersShortcut(10, 1), true);
  assert.equal(entersShortcut(-10, 1), false);
  assert.equal(entersShortcut(-10, -1), true);
});
test('entry and exit preserve position on either side', () => {
  for (const side of [-1, 1]) for (const x of [9, 12, 17]) {
    const lat = x * side;
    assert.equal(mainLateral(shortcutLateral(lat, side), side), lat);
  }
});
test('shorter physical route advances equivalent main-track race distance', () => {
  assert.equal(shortcutProgress(200, 500, 400), 250);
  assert.equal(shortcutProgress(400, 500, 400), 500);
});

test('shortcut geometry must travel with the circuit, never backwards', () => {
  const forward = { x: 0, y: 0, z: 1 };
  assert.equal(followsForward(forward, forward), true);
  assert.equal(followsForward(forward, { x: 0, y: 0, z: -1 }), false);
  assert.equal(followsForward(forward, { x: 1, y: 0, z: 0 }), false);
});
