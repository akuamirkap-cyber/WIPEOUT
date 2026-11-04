/** Track-space dimensions for the raised takeoff, gap and lower landing. */
export const RAMP_APPROACH = 95;
export const RAMP_HEIGHT = 20;
export const LANDING_DROP = 8;
export const LANDING_RETURN = 130;
export const JUMP_ASSIST_SPEED = 150;
export const JUMP_GAP_LENGTH = 400;

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Height of the road and its invisible reference path over the gap. */
export function jumpTrackHeight(offset: number, gap: number): number {
  if (offset < -RAMP_APPROACH) return 0;
  if (offset < 0) return RAMP_HEIGHT * smooth((offset + RAMP_APPROACH) / RAMP_APPROACH);
  if (offset < gap) return RAMP_HEIGHT + (-LANDING_DROP - RAMP_HEIGHT) * smooth(offset / gap);
  if (offset < gap + LANDING_RETURN) return -LANDING_DROP * (1 - smooth((offset - gap) / LANDING_RETURN));
  return 0;
}

/** Find the absolute position of the first ramp lip crossed in this movement step. */
export function crossedRamp(from: number, to: number, ramp: number, length: number): number | null {
  if (to <= from || length <= 0) return null;
  const lip = ramp + (Math.floor((from - ramp) / length) + 1) * length;
  return lip <= to ? lip : null;
}

/** Arcade trajectory relative to the invisible reference path, aligned at both ends. */
export function jumpPose(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const roll = smooth((t - 0.06) / 0.88);
  const float = t === 0 || t === 1 ? 0 : Math.sin(Math.PI * t ** 1.35) ** 2;
  return {
    height: 28 * float,
    roll: Math.PI * 2 * roll,
    pitch: 0.10 * Math.sin(Math.PI * 2 * t) * float,
  };
}
