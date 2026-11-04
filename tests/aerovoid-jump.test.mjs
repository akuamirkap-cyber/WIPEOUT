import test from 'node:test';
import assert from 'node:assert/strict';
import { crossedRamp, jumpPose, jumpTrackHeight, RAMP_APPROACH, RAMP_HEIGHT, LANDING_DROP, LANDING_RETURN, JUMP_GAP_LENGTH } from '../src/games/aerovoid/game/jump.ts';
test('raised ramp and lower landing connect smoothly to the track', () => {
  const gap = JUMP_GAP_LENGTH;
  assert.equal(jumpTrackHeight(-RAMP_APPROACH, gap), 0);
  assert.equal(jumpTrackHeight(0, gap), RAMP_HEIGHT);
  assert.equal(jumpTrackHeight(gap, gap), -LANDING_DROP);
  assert.equal(jumpTrackHeight(gap + LANDING_RETURN, gap), 0);
  assert.ok(jumpTrackHeight(0, gap) > jumpTrackHeight(gap, gap));
});
test('ramp crossings work each lap, including start-line wrap', () => {
  assert.equal(crossedRamp(99, 102, 100, 1000), 100);
  assert.equal(crossedRamp(1099, 1102, 100, 1000), 1100);
  assert.equal(crossedRamp(-1, 1, 0, 1000), 0);
  assert.equal(crossedRamp(100, 101, 100, 1000), null);
});
test('jump rises over gap, rolls once and lands exactly aligned', () => {
  assert.equal(jumpPose(0).height, 0);
  assert.ok(jumpPose(0.5).height > 0);
  const landing = jumpPose(1);
  assert.equal(landing.height, 0);
  assert.equal(landing.roll, Math.PI * 2);
  assert.ok(Math.abs(landing.pitch) < 1e-10);
  // Minimum duration at full 340-unit boost is over a second, rather than a flash.
  assert.ok(JUMP_GAP_LENGTH / 340 > 1.1);
  assert.ok(jumpPose(0.01).height < 0.02);
  assert.ok(jumpPose(0.99).height < 0.06);
});
