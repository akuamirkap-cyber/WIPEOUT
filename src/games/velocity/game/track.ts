import * as THREE from "three";

// ---------- Track definition (world units) ----------
// Surface start/finish arena  ->  portal  ->  tunnel  ->  HOLLOW EARTH cavern (wide loop)
// -> exit tunnel -> surface return -> start
const RAW_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, -120],
  [0, 0, -240],
  [-30, 1, -340],
  [-110, 3, -400],
  [-200, 0, -400],
  [-268, -6, -350], // portal
  [-340, -25, -300], // tunnel into the dome
  [-450, -45, -240],
  [-560, -70, -200],
  [-660, -100, -100],
  [-690, -125, 20],
  [-640, -145, 140],
  [-520, -158, 160],
  [-400, -153, 120],
  [-310, -128, 40],
  [-275, -98, -45],
  [-235, -76, -140], // exit tunnel
  [-185, -52, -200],
  [-110, -30, -215],
  [-55, -12, -150],
  [-60, -4, -40],
  [-80, 0, 90],
  [-45, 0, 210],
  [-5, 0, 170],
  [0, 0, 110],
];

export const TRACK_HALF_WIDTH = 13;
export const CAVE_HALF_WIDTH = 24;
export const WALL_HEIGHT = 2.2;
export const SAMPLE_COUNT = 1400;
export const GROUND_Y = -32;

// ---------- Hollow-earth dome ----------
export const DOME = {
  c: new THREE.Vector3(-540, -120, -120),
  r: new THREE.Vector3(340, 260, 340),
};
export const LAKE_Y = DOME.c.y - DOME.r.y * 0.75;
export const INNER_SUN = new THREE.Vector3(-540, 10, -120);

/** <1 inside the dome, 1 on the shell, >1 outside */
export function domeValue(p: THREE.Vector3) {
  const dx = (p.x - DOME.c.x) / DOME.r.x;
  const dy = (p.y - DOME.c.y) / DOME.r.y;
  const dz = (p.z - DOME.c.z) / DOME.r.z;
  return dx * dx + dy * dy + dz * dz;
}

export interface TrackSample {
  p: THREE.Vector3; // center
  t: THREE.Vector3; // tangent (forward)
  r: THREE.Vector3; // right (with banking)
  u: THREE.Vector3; // up
  dist: number; // cumulative distance
  bank: number;
  w: number; // half width
  cave: number; // 0 = surface, 1 = inside the hollow earth
}

export const curve = new THREE.CatmullRomCurve3(
  RAW_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
  "centripetal",
  0.5
);

const UP = new THREE.Vector3(0, 1, 0);

export interface Tunnel {
  cross: number; // sample index where the track crosses the dome shell
  start: number; // lower index of the tube
  end: number; // upper index of the tube
  entering: boolean;
  crossPos: THREE.Vector3;
}
export const TUNNELS: Tunnel[] = [];

function buildSamples(): TrackSample[] {
  const N = SAMPLE_COUNT;
  const pts = curve.getSpacedPoints(N);
  pts.pop();
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    tangents.push(b.clone().sub(a).normalize());
  }
  const curv: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = tangents[(i - 1 + N) % N];
    const t1 = tangents[(i + 1) % N];
    curv.push(new THREE.Vector3().crossVectors(t0, t1).y);
  }
  const bank: number[] = new Array(N).fill(0);
  const K = 40;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -K; k <= K; k++) s += curv[(i + k + N) % N];
    bank[i] = THREE.MathUtils.clamp((s / (2 * K + 1)) * 120, -0.32, 0.32);
  }
  // cave factor: inside dome -> 1, smoothed so width ramps through the tunnels
  const inside = pts.map((p) => (domeValue(p) < 1 ? 1 : 0));
  const caveArr: number[] = new Array(N).fill(0);
  const KC = 30;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -KC; k <= KC; k++) s += inside[(i + k + N) % N];
    const x = s / (2 * KC + 1);
    caveArr[i] = x * x * (3 - 2 * x);
  }
  // tunnels at shell crossings
  for (let i = 0; i < N; i++) {
    const a = inside[i];
    const b = inside[(i + 1) % N];
    if (a !== b) {
      const entering = b === 1;
      TUNNELS.push({
        cross: i,
        start: entering ? i - 34 : i - 40,
        end: entering ? i + 40 : i + 34,
        entering,
        crossPos: pts[i].clone(),
      });
    }
  }
  let dist = 0;
  const samples: TrackSample[] = [];
  for (let i = 0; i < N; i++) {
    const t = tangents[i];
    const r = new THREE.Vector3().crossVectors(t, UP).normalize();
    r.applyAxisAngle(t, bank[i]);
    const u = new THREE.Vector3().crossVectors(r, t).normalize();
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    samples.push({
      p: pts[i],
      t,
      r,
      u,
      dist,
      bank: bank[i],
      w: TRACK_HALF_WIDTH + (CAVE_HALF_WIDTH - TRACK_HALF_WIDTH) * caveArr[i],
      cave: caveArr[i],
    });
  }
  return samples;
}

export const samples = buildSamples();
export const TRACK_LENGTH =
  samples[SAMPLE_COUNT - 1].dist + samples[SAMPLE_COUNT - 1].p.distanceTo(samples[0].p);
export const SEG_LEN = TRACK_LENGTH / SAMPLE_COUNT;

export function wrapIndex(i: number) {
  return ((Math.round(i) % SAMPLE_COUNT) + SAMPLE_COUNT) % SAMPLE_COUNT;
}

export function inTunnel(i: number, margin = 0) {
  return TUNNELS.some((t) => i >= t.start - margin && i <= t.end + margin);
}

/** Find nearest sample index around a previous guess */
export function nearestIndex(pos: THREE.Vector3, guess: number, range = 60): number {
  let best = guess;
  let bestD = Infinity;
  for (let k = -range; k <= range; k++) {
    const i = wrapIndex(guess + k);
    const p = samples[i].p;
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface TrackInfo {
  index: number;
  lateral: number;
  along: number;
  height: number;
  progress: number;
  sample: TrackSample;
}

const _d = new THREE.Vector3();
export function getTrackInfo(pos: THREE.Vector3, guess: number): TrackInfo {
  const index = nearestIndex(pos, guess);
  const s = samples[index];
  _d.subVectors(pos, s.p);
  const lateral = _d.x * s.r.x + _d.z * s.r.z;
  const along = _d.x * s.t.x + _d.z * s.t.z;
  const height = s.p.y + lateral * s.r.y + along * s.t.y;
  return { index, lateral, along, height, progress: index + along / SEG_LEN, sample: s };
}

/** Height of the tangent plane of `s` at an xz position */
export function planeHeight(s: TrackSample, x: number, z: number) {
  const dx = x - s.p.x;
  const dz = z - s.p.z;
  const lateral = dx * s.r.x + dz * s.r.z;
  const along = dx * s.t.x + dz * s.t.z;
  return s.p.y + lateral * s.r.y + along * s.t.y;
}

export interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
  w: number;
}

/** Interpolated frame at fractional index */
export function frameAt(f: number, out: Frame) {
  const i0 = wrapIndex(Math.floor(f));
  const i1 = wrapIndex(i0 + 1);
  const a = f - Math.floor(f);
  const s0 = samples[i0];
  const s1 = samples[i1];
  out.p.lerpVectors(s0.p, s1.p, a);
  out.t.lerpVectors(s0.t, s1.t, a).normalize();
  out.r.lerpVectors(s0.r, s1.r, a).normalize();
  out.u.lerpVectors(s0.u, s1.u, a).normalize();
  out.w = s0.w + (s1.w - s0.w) * a;
  return out;
}

/** Nearest track distance helper for scenery placement (brute force, load time only) */
const coarse = samples.filter((_, i) => i % 3 === 0);
export function distToTrack(p: THREE.Vector3): { d: number; w: number } {
  let best = Infinity;
  let w = TRACK_HALF_WIDTH;
  for (const s of coarse) {
    const d = s.p.distanceToSquared(p);
    if (d < best) {
      best = d;
      w = s.w;
    }
  }
  return { d: Math.sqrt(best), w };
}

// ---------- Pads ----------
export interface Pad {
  index: number;
  lateral: number;
  type: "speed" | "energy";
}

export const PADS: Pad[] = [
  { index: 80, lateral: -5, type: "speed" },
  { index: 80, lateral: 5, type: "speed" },
  { index: 200, lateral: 0, type: "energy" },
  { index: 290, lateral: -5, type: "speed" },
  { index: 400, lateral: 0, type: "speed" },
  { index: 470, lateral: -8, type: "speed" },
  { index: 470, lateral: 8, type: "speed" },
  { index: 560, lateral: 0, type: "energy" },
  { index: 640, lateral: -9, type: "speed" },
  { index: 720, lateral: 9, type: "speed" },
  { index: 790, lateral: -6, type: "energy" },
  { index: 860, lateral: 0, type: "speed" },
  { index: 920, lateral: -8, type: "speed" },
  { index: 920, lateral: 8, type: "speed" },
  { index: 1000, lateral: 0, type: "speed" },
  { index: 1090, lateral: 0, type: "energy" },
  { index: 1180, lateral: -5, type: "speed" },
  { index: 1250, lateral: 5, type: "speed" },
];

export const PAD_DECK_HEIGHT = 0.56;
export function padHeightAt(x: number, z: number): number {
  if (z < 10 || z > 118 || Math.abs(x) > 8) return 0;
  for (const g of START_GRID) {
    const dx = Math.abs(x - g.x);
    const dz = Math.abs(z - g.z);
    if (dx < 3.3 && dz < 6.4) {
      const ex = Math.min(1, (3.3 - dx) / 0.6);
      const ez = Math.min(1, (6.4 - dz) / 1.2);
      return PAD_DECK_HEIGHT * Math.min(ex, ez);
    }
  }
  return 0;
}

// Start grid positions (z positive = behind the start line at z=0)
export const START_GRID: { x: number; z: number }[] = [
  { x: -4.6, z: 22 },
  { x: 4.6, z: 34 },
  { x: -4.6, z: 46 },
  { x: 4.6, z: 58 },
  { x: -4.6, z: 70 },
  { x: 4.6, z: 82 },
  { x: -4.6, z: 94 },
  { x: 4.6, z: 106 },
];
