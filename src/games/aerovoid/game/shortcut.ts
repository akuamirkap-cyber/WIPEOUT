/** Shortcut center starts and rejoins at this lateral offset on the main road. */
export const SHORTCUT_OFFSET = 12;
export const SHORTCUT_ENTRY = 6;
export const SHORTCUT_HALF_WIDTH = 8;

export function entersShortcut(lateral: number, side: number) {
  return lateral * side >= SHORTCUT_ENTRY;
}
export function shortcutLateral(lateral: number, side: number) {
  return Math.max(-SHORTCUT_HALF_WIDTH, Math.min(SHORTCUT_HALF_WIDTH, lateral - side * SHORTCUT_OFFSET));
}
export function mainLateral(lateral: number, side: number) {
  return lateral + side * SHORTCUT_OFFSET;
}
/** Convert real travel distance to equivalent progress on the longer main circuit. */
export function shortcutProgress(distance: number, mainLength: number, shortcutLength: number) {
  return distance * mainLength / Math.max(1, shortcutLength);
}

/** Reject paths travelling against the racing direction. */
export function followsForward(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const length = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return length > 0 && dot / length > 0.5;
}
