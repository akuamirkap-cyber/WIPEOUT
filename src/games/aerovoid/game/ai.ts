/** Race strategy lives in track coordinates, so it also works on banked and looping sections. */
export interface AIRacer {
  p: number;
  lat: number;
  latVel: number;
  speed: number;
}
export interface AIPad { s: number; lat: number }
export interface AITrack {
  L: number;
  pads: AIPad[];
  wrap(s: number): number;
  curvatureAt(s: number): number;
}
export interface AIPlan { lane: number; safeSpeed: number; boostSafe: boolean; blockedSpeed: number }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Predict a braking envelope and score reachable passing lines, without rubber-banding or teleporting. */
export function planRace(track: AITrack, racer: AIRacer, rivals: AIRacer[], preferredLane: number, previousLane: number): AIPlan {
  const { p, lat, latVel, speed } = racer;
  let safeSpeed = 340;
  let boostSafe = true;
  for (let distance = 20; distance <= 430; distance += 30) {
    const curve = Math.abs(track.curvatureAt(p + distance));
    // Balance lateral authority against track curvature; reserve room for corrections.
    const cornerSpeed = Math.sqrt(105 / Math.max(curve * 0.17, 0.00001));
    const approachSpeed = Math.sqrt(cornerSpeed * cornerSpeed + 2 * 145 * Math.max(0, distance - 25));
    safeSpeed = Math.min(safeSpeed, approachSpeed);
    if (distance < 300 && curve > 0.008) boostSafe = false;
  }
  safeSpeed = clamp(safeSpeed, 140, 340);
  const aheadCurve = track.curvatureAt(p + Math.max(60, speed * 0.55));
  const idealLane = clamp(preferredLane * 0.16 + aheadCurve * 500, -7, 7);
  const s = track.wrap(p);
  let pad: AIPad | undefined;
  let padDistance = Infinity;
  for (const candidate of track.pads) {
    const d = (candidate.s - s + track.L) % track.L;
    if (d > 4 && d < 350 && d < padDistance) { pad = candidate; padDistance = d; }
  }
  const lanes = [-17, -12, -7, 0, 7, 12, 17, idealLane, clamp(lat, -18, 18), clamp(previousLane, -18, 18)];
  if (pad) lanes.push(clamp(pad.lat, -18, 18));
  let bestLane = idealLane, bestScore = -Infinity;
  for (const lane of lanes) {
    let score = -Math.abs(lane - idealLane) * 0.09 - Math.abs(lane - lat) * 0.11 - Math.abs(lane - previousLane) * 0.1;
    // Time to slide to the pad, allowing for current speed and a realistic lane change.
    if (pad && Math.abs(lane - pad.lat) < 5.5 && padDistance > Math.abs(lane - lat) * 4 + 25) score += 7;
    for (const other of rivals) {
      if (other === racer) continue;
      const gap = other.p - p;
      if (gap < -28 || gap > 115) continue;
      const t = clamp(Math.abs(gap) / Math.max(50, Math.abs(speed - other.speed) + 65), 0, 1.1);
      const predictedLat = other.lat + other.latVel * t * 0.5;
      const separation = Math.abs(lane - predictedLat);
      if (separation < 7.5) score -= (7.5 - separation) * (gap < 35 ? 3.5 : 1.3);
      // Avoid crossing immediately in front of a car alongside us.
      if (Math.abs(gap) < 12 && (lat - other.lat) * (lane - other.lat) < 0) score -= 18;
    }
    if (score > bestScore) { bestScore = score; bestLane = lane; }
  }
  let blockedSpeed = Infinity;
  for (const other of rivals) {
    if (other === racer) continue;
    const gap = other.p - p;
    if (gap > 0 && gap < 22 && Math.abs(other.lat - lat) < 4.5 && Math.abs(bestLane - lat) < 4)
      blockedSpeed = Math.min(blockedSpeed, other.speed + Math.max(0, gap - 7) * 3);
  }
  if (blockedSpeed < Infinity) boostSafe = false;
  return { lane: bestLane, safeSpeed, boostSafe, blockedSpeed };
}
