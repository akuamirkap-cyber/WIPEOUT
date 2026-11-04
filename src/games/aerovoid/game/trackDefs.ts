import * as THREE from 'three';

/** [x, z, y(height)] */
export type Pt = [number, number, number];

export interface LoopSpec {
  at: Pt;
  dir: [number, number];
  /** +1 = exit drifts to the right, -1 = to the left */
  side: 1 | -1;
  R: number;
  shift: number;
}
export type Item = Pt | { loop: LoopSpec };

export interface TrackDef {
  id: number;
  name: string;
  tag: string;
  desc: string;
  range: string;
  loops: number;
  items: Item[];
  pads: { f: number; lat: number }[];
}

const omega: Item[] = [
  [0, 0, 70],
  [130, 0, 70],
  { loop: { at: [270, 0, 70], dir: [1, 0], side: 1, R: 52, shift: 66 } },
  [430, 70, 72],
  [530, 100, 78],
  [640, 190, 92],
  [720, 330, 110],
  [730, 490, 126],
  [670, 630, 140],
  [540, 725, 148],
  [380, 765, 152],
  [210, 770, 156],
  [40, 755, 154],
  [-130, 780, 146],
  [-300, 800, 136],
  [-440, 735, 124],
  [-520, 600, 112],
  [-500, 440, 100],
  [-440, 320, 92],
  [-470, 200, 84],
  [-400, 90, 76],
  [-320, 20, 72],
  [-230, 0, 70],
  [-120, 0, 70],
];

const sky: Item[] = [
  [0, 0, 90],
  [120, 0, 90],
  { loop: { at: [250, 0, 90], dir: [1, 0], side: -1, R: 62, shift: 74 } },
  [420, -74, 92],
  [560, -105, 108],
  [690, -200, 150],
  [775, -340, 205],
  [800, -500, 265],
  [765, -660, 325],
  [680, -790, 370],
  [560, -870, 382],
  [420, -915, 360],
  [290, -945, 300],
  [170, -955, 210],
  [60, -955, 140],
  { loop: { at: [-170, -955, 96], dir: [-1, 0], side: -1, R: 62, shift: 74 } },
  [-400, -872, 92],
  [-520, -800, 91],
  [-590, -680, 90],
  [-600, -540, 90],
  [-560, -400, 90],
  [-500, -270, 90],
  [-420, -150, 90],
  [-330, -50, 90],
  [-240, -5, 90],
  [-120, 0, 90],
];

export const TRACKS: TrackDef[] = [
  {
    id: 0,
    name: 'OMEGA LOOP',
    tag: 'TECHNICAL · 1 LOOP',
    desc: 'Lurus pendek, loop vertikal, tikungan lebar ke kanan, kelokan panjang di sisi kiri.',
    range: '70–170 m',
    loops: 1,
    items: omega,
    pads: [
      { f: 0.035, lat: 0 },
      { f: 0.21, lat: -9 },
      { f: 0.21, lat: 9 },
      { f: 0.36, lat: 0 },
      { f: 0.52, lat: 8 },
      { f: 0.7, lat: -8 },
      { f: 0.86, lat: 0 },
    ],
  },
  {
    id: 1,
    name: 'SKY REACTOR',
    tag: 'EXTREME · 2 LOOPS',
    desc: 'Dua loop vertikal, pendakian ke 380 m, terjun bebas, lalu kembali lewat jalur rendah.',
    range: '90–380 m',
    loops: 2,
    items: sky,
    pads: [
      { f: 0.03, lat: 0 },
      { f: 0.17, lat: 0 },
      { f: 0.31, lat: -8 },
      { f: 0.31, lat: 8 },
      { f: 0.46, lat: 0 },
      { f: 0.6, lat: 0 },
      { f: 0.74, lat: 8 },
      { f: 0.89, lat: -8 },
    ],
  },
];

export interface LoopInfo {
  o: THREE.Vector3;
  d: THREE.Vector3;
  r: THREE.Vector3;
  side: number;
  shift: number;
  R: number;
}

export function loopList(def: TrackDef): LoopInfo[] {
  const out: LoopInfo[] = [];
  for (const it of def.items) {
    if (Array.isArray(it)) continue;
    const { at, dir, side, R, shift } = it.loop;
    const d = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
    out.push({
      o: new THREE.Vector3(at[0], at[2], at[1]),
      d,
      r: new THREE.Vector3(-d.z, 0, d.x),
      side,
      shift,
      R,
    });
  }
  return out;
}

export function expandItems(items: Item[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const it of items) {
    if (Array.isArray(it)) {
      out.push(new THREE.Vector3(it[0], it[2], it[1]));
      continue;
    }
    const { at, dir, side, R, shift } = it.loop;
    const d = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
    const r = new THREE.Vector3(-d.z, 0, d.x);
    const o = new THREE.Vector3(at[0], at[2], at[1]);
    const lat = r.clone().multiplyScalar(side * shift);
    out.push(o.clone().addScaledVector(d, -90), o.clone().addScaledVector(d, -45));
    const n = 44;
    for (let k = 0; k <= n; k++) {
      const th = (k / n) * Math.PI * 2;
      const p = o.clone().addScaledVector(d, R * Math.sin(th));
      p.y += R * (1 - Math.cos(th));
      p.addScaledVector(lat, (th - Math.sin(th)) / (Math.PI * 2));
      out.push(p);
    }
    const e = o.clone().add(lat);
    out.push(e.clone().addScaledVector(d, 45), e.clone().addScaledVector(d, 90));
  }
  return out;
}

export function makeCurve(def: TrackDef) {
  const c = new THREE.CatmullRomCurve3(expandItems(def.items), true, 'centripetal');
  c.arcLengthDivisions = 6000;
  return c;
}

export interface TrackPreview {
  plan: [number, number][];
  marks: [number, number][];
  elev: number[];
  length: number;
}

/** Cheap top-down + elevation preview for the menu (viewBox 100 x 64). */
export function trackPreview(def: TrackDef): TrackPreview {
  const curve = makeCurve(def);
  const length = curve.getLength();
  const n = 260;
  const pts = curve.getSpacedPoints(n).slice(0, n);
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const sc = Math.min(88 / (maxX - minX), 52 / (maxZ - minZ));
  const ox = 50 - ((minX + maxX) / 2) * sc;
  const oy = 32 - ((minZ + maxZ) / 2) * sc;
  const tf = (x: number, z: number): [number, number] => [x * sc + ox, z * sc + oy];
  return {
    plan: pts.map((p) => tf(p.x, p.z)),
    marks: loopList(def).map((l) => tf(l.o.x, l.o.z)),
    elev: pts.map((p) => p.y),
    length,
  };
}
