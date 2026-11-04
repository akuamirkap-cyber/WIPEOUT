import test from 'node:test';
import assert from 'node:assert/strict';
import { planRace } from '../src/games/aerovoid/game/ai.ts';
const racer = { p: 0, lat: 0, latVel: 0, speed: 200 };
const track = (curve = () => 0, pads = []) => ({ L: 1000, pads, wrap: s => ((s % 1000) + 1000) % 1000, curvatureAt: curve });
test('straight enables boost; sharp bend triggers early braking envelope', () => {
  const straight = planRace(track(), racer, [racer], 0, 0);
  assert.equal(straight.boostSafe, true);
  assert.equal(straight.safeSpeed, 340);
  const corner = planRace(track(s => s >= 50 && s < 120 ? 0.03 : 0), racer, [racer], 0, 0);
  assert.equal(corner.boostSafe, false);
  assert.ok(corner.safeSpeed < 200);
});
test('avoids a slower rival and takes reachable boost pads', () => {
  const rival = { p: 18, lat: 0, latVel: 0, speed: 120 };
  const passing = planRace(track(), racer, [racer, rival], 0, 0);
  assert.ok(Math.abs(passing.lane) >= 7);
  const pad = planRace(track(() => 0, [{ s: 170, lat: 12 }]), racer, [racer], 0, 0);
  assert.ok(Math.abs(pad.lane - 12) < 5.5);
});
test('finds a pad across the start line', () => {
  const nearFinish = { ...racer, p: 970 };
  const plan = planRace(track(() => 0, [{ s: 100, lat: -12 }]), nearFinish, [nearFinish], 0, 0);
  assert.ok(Math.abs(plan.lane + 12) < 5.5);
});
