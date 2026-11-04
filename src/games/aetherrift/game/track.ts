import * as THREE from "three";
import { buildRibbon, clamp, mulberry32 } from "./utils";
import {
  adTexture,
  boostTexture,
  roadTexture,
  wallTexture,
} from "./textures";

export const TRACK_HALF = 18;
const SLAB = 2.6;

const CONTROL: [number, number, number][] = [
  [0, 0, 400],
  [0, 0, 200],
  [0, 0, 0],
  [0, 0, -200],
  [0, 0, -400],
  [15, 2, -620],
  [40, 4, -800],
  [104, 0, -1040],
  [280, -18, -1216],
  [520, -36, -1280],
  [760, -28, -1216],
  [936, -6, -1040],
  [1000, 10, -800],
  [955, 12, -597],
  [888, 8, -452],
  [850, 6, -300],
  [815, 0, -150],
  [720, 0, 30],
  [760, 8, 240],
  [670, 24, 440],
  [730, 38, 640],
  [580, 28, 830],
  [320, 12, 920],
  [60, 0, 930],
  [-190, -6, 870],
  [-350, -4, 710],
  [-300, 0, 540],
  [-150, 0, 450],
];

export interface Frame {
  pos: THREE.Vector3;
  T: THREE.Vector3;
  N: THREE.Vector3;
  R: THREE.Vector3;
  kappa: number;
  half: number;
}
export const newFrame = (): Frame => ({
  pos: new THREE.Vector3(),
  T: new THREE.Vector3(),
  N: new THREE.Vector3(),
  R: new THREE.Vector3(),
  kappa: 0,
  half: 18,
});

export interface BoostPad {
  s: number;
  d: number;
}

export class Track {
  n: number;
  length: number;
  ds: number;
  pos: THREE.Vector3[] = [];
  T: THREE.Vector3[] = [];
  N: THREE.Vector3[] = [];
  R: THREE.Vector3[] = [];
  kappa: Float32Array;
  bank: Float32Array;
  startS = 0;
  caveS0 = 0;
  caveS1 = 0;
  half: Float32Array;
  wallH: Float32Array;
  pads: BoostPad[] = [];
  curve: THREE.CatmullRomCurve3;

  constructor() {
    const pts = CONTROL.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    this.curve.arcLengthDivisions = 8000;
    const total0 = this.curve.getLength();
    const n = Math.round(total0 / 3.0);
    const raw = this.curve.getSpacedPoints(n);
    raw.pop();
    this.n = raw.length;
    this.pos = raw;
    let len = 0;
    for (let i = 0; i < this.n; i++) len += raw[i].distanceTo(raw[(i + 1) % this.n]);
    this.length = len;
    this.ds = len / this.n;
    const n2 = this.n;

    for (let i = 0; i < n2; i++) {
      const a = raw[(i - 1 + n2) % n2];
      const b = raw[(i + 1) % n2];
      this.T.push(b.clone().sub(a).normalize());
    }
    // heading + curvature
    const psi: number[] = [];
    for (let i = 0; i < n2; i++) psi.push(Math.atan2(this.T[i].x, -this.T[i].z));
    const wrapA = (x: number) => {
      while (x > Math.PI) x -= Math.PI * 2;
      while (x < -Math.PI) x += Math.PI * 2;
      return x;
    };
    let kap: Float32Array = new Float32Array(n2);
    for (let i = 0; i < n2; i++) {
      kap[i] = wrapA(psi[(i + 1) % n2] - psi[(i - 1 + n2) % n2]) / (2 * this.ds);
    }
    const smooth = (arr: Float32Array, rad: number, passes: number) => {
      let cur = arr;
      for (let p = 0; p < passes; p++) {
        const out = new Float32Array(n2);
        for (let i = 0; i < n2; i++) {
          let s = 0;
          for (let k = -rad; k <= rad; k++) s += cur[(i + k + n2 * 4) % n2];
          out[i] = s / (rad * 2 + 1);
        }
        cur = out;
      }
      return cur;
    };
    kap = smooth(kap, 6, 2);
    this.kappa = kap;
    // ---- hollow-earth cave range (anchored by world position)
    const nearestS = (x: number, z: number) => {
      let bi = 0;
      let bd = 1e18;
      for (let i = 0; i < n2; i++) {
        const dx = raw[i].x - x;
        const dz = raw[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi * this.ds;
    };
    this.caveS0 = nearestS(24, -718);
    this.caveS1 = nearestS(925, -545);
    this.half = new Float32Array(n2);
    this.wallH = new Float32Array(n2);
    const blendArr = new Float32Array(n2);
    for (let i = 0; i < n2; i++) {
      const b = this.caveBlend(i * this.ds);
      blendArr[i] = b;
      this.half[i] = 18 + 17 * b;
      this.wallH[i] = 6.5 - 2.8 * b;
    }
    const bankRaw = new Float32Array(n2);
    for (let i = 0; i < n2; i++) bankRaw[i] = clamp(kap[i] * 80 * (1 + 1.4 * blendArr[i]), -0.5, 0.5);
    this.bank = smooth(bankRaw, 22, 2);

    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n2; i++) {
      const T = this.T[i];
      const N0 = up.clone().sub(T.clone().multiplyScalar(up.dot(T))).normalize();
      const R0 = new THREE.Vector3().crossVectors(T, N0).normalize();
      const phi = this.bank[i];
      const N = N0.clone().multiplyScalar(Math.cos(phi)).add(R0.clone().multiplyScalar(Math.sin(phi))).normalize();
      const R = new THREE.Vector3().crossVectors(T, N).normalize();
      this.N.push(N);
      this.R.push(R);
    }

    // start line: z ~ 0 on the straight
    let best = 1e9;
    for (let i = 0; i < n2; i++) {
      const p = this.pos[i];
      const score = Math.abs(p.z) + (Math.abs(p.x) > 5 ? 5000 : 0);
      if (score < best) {
        best = score;
        this.startS = i * this.ds;
      }
    }

    // boost pads on calm sections
    const fr = [0.1, 0.22, 0.34, 0.47, 0.6, 0.72, 0.85];
    const rnd = mulberry32(4);
    fr.forEach((f, idx) => {
      const target = f * this.length;
      let bestS = target;
      let bestK = 1e9;
      for (let off = -140; off <= 140; off += this.ds) {
        const s = target + off;
        // keep away from the start straight decorations
        const rel = this.wrapS(s - this.startS);
        if (rel > this.length - 130 || rel < 300) continue;
        const k = Math.abs(this.kappaAt(s)) + Math.abs(this.kappaAt(s + 40)) + Math.abs(this.kappaAt(s - 40));
        if (k < bestK) {
          bestK = k;
          bestS = s;
        }
      }
      // pads that would land in the cave get replaced by dedicated ones below
      if (bestS > this.caveS0 - 200 && bestS < this.caveS1 + 200) return;
      this.pads.push({ s: this.wrapS(bestS), d: idx % 2 === 0 ? (rnd() > 0.5 ? 6 : -6) : 0 });
    });
    const cl = this.caveS1 - this.caveS0;
    this.pads.push({ s: this.caveS0 + cl * 0.2, d: -10 });
    this.pads.push({ s: this.caveS0 + cl * 0.42, d: 11 });
    this.pads.push({ s: this.caveS0 + cl * 0.64, d: -4 });
    this.pads.push({ s: this.caveS0 + cl * 0.84, d: 9 });
  }

  /** 0 outside the cave, 1 deep inside (used for road widening / banking) */
  caveBlend(s: number) {
    const a = this.caveS0;
    const b = this.caveS1;
    const sm = (x: number, e0: number, e1: number) => {
      const t = clamp((x - e0) / (e1 - e0), 0, 1);
      return t * t * (3 - 2 * t);
    };
    return sm(s, a - 120, a + 260) * (1 - sm(s, b - 260, b + 120));
  }

  inCave(s: number, pad = 0) {
    return s > this.caveS0 - pad && s < this.caveS1 + pad;
  }

  halfAt(s: number) {
    const f = (this.wrapS(s) / this.length) * this.n;
    const i0 = Math.floor(f) % this.n;
    const i1 = (i0 + 1) % this.n;
    const t = f - Math.floor(f);
    return this.half[i0] * (1 - t) + this.half[i1] * t;
  }

  wrapS(s: number) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  kappaAt(s: number) {
    const f = (this.wrapS(s) / this.length) * this.n;
    const i0 = Math.floor(f) % this.n;
    const i1 = (i0 + 1) % this.n;
    const t = f - Math.floor(f);
    return this.kappa[i0] * (1 - t) + this.kappa[i1] * t;
  }

  sample(s: number, out: Frame) {
    const f = (this.wrapS(s) / this.length) * this.n;
    const i0 = Math.floor(f) % this.n;
    const i1 = (i0 + 1) % this.n;
    const t = f - Math.floor(f);
    out.pos.lerpVectors(this.pos[i0], this.pos[i1], t);
    out.T.lerpVectors(this.T[i0], this.T[i1], t).normalize();
    out.N.lerpVectors(this.N[i0], this.N[i1], t).normalize();
    out.R.crossVectors(out.T, out.N).normalize();
    out.kappa = this.kappa[i0] * (1 - t) + this.kappa[i1] * t;
    out.half = this.half[i0] * (1 - t) + this.half[i1] * t;
    return out;
  }

  /** Place a world point at lateral d and up h relative to track at s */
  worldPoint(s: number, d: number, h: number, tmp: Frame, out = new THREE.Vector3()) {
    this.sample(s, tmp);
    return out.copy(tmp.pos).addScaledVector(tmp.R, d).addScaledVector(tmp.N, h);
  }
}

function addRibbonChunks(
  group: THREE.Group,
  track: Track,
  mat: THREE.Material,
  a: (i: number) => THREE.Vector3,
  b: (i: number) => THREE.Vector3,
  uv: (i: number, k: 0 | 1) => [number, number],
  flip: boolean,
  cast: boolean,
  receive: boolean,
  chunk = 40
) {
  for (let i0 = 0; i0 < track.n; i0 += chunk) {
    const i1 = Math.min(i0 + chunk, track.n);
    const g = buildRibbon(i0, i1, track.n, a, b, uv, flip);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
  }
}

export interface TrackBuild {
  group: THREE.Group;
  roadMat: THREE.MeshPhysicalMaterial;
  wallMat: THREE.MeshStandardMaterial;
  boostMaterials: THREE.MeshBasicMaterial[];
  update(dt: number): void;
}

export function buildTrack(track: Track, groundAt: (x: number, z: number) => number): TrackBuild {
  const group = new THREE.Group();
  const n = track.n;
  const ds = track.ds;
  const P = (i: number, lat: number, up: number) =>
    track.pos[i].clone().addScaledVector(track.R[i], lat).addScaledVector(track.N[i], up);
  const H = (i: number) => track.half[i];
  const WH = (i: number) => track.wallH[i];
  const EDGE = 5.76; // fixed width of the steel lattice edge strips

  // ---- Materials
  const roadTex = roadTexture();
  const roadTile = track.length / Math.round(track.length / 36);
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: roadTex,
    roughness: 0.78,
    metalness: 0.05,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.5,
    emissive: new THREE.Color(0, 0, 0),
    emissiveMap: roadTex,
  });
  const wallTex = wallTexture();
  const wallTile = track.length / Math.round(track.length / 14);
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.8,
    metalness: 0.05,
    envMapIntensity: 0.55,
    emissive: new THREE.Color(0, 0, 0),
    emissiveMap: wallTex,
  });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8d8675, roughness: 0.8, metalness: 0.1 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2b3345, roughness: 0.55, metalness: 0.6 });

  // ---- Road surface (3 strips: fixed-width lattice edges + stretchable centre)
  addRibbonChunks(group, track, roadMat, (i) => P(i, -H(i), 0), (i) => P(i, -H(i) + EDGE, 0), (i, k) => [k * 0.16, (i * ds) / roadTile], false, true, true);
  addRibbonChunks(group, track, roadMat, (i) => P(i, -H(i) + EDGE, 0), (i) => P(i, H(i) - EDGE, 0), (i, k) => [0.16 + k * 0.68, (i * ds) / roadTile], false, true, true);
  addRibbonChunks(group, track, roadMat, (i) => P(i, H(i) - EDGE, 0), (i) => P(i, H(i), 0), (i, k) => [0.84 + k * 0.16, (i * ds) / roadTile], false, true, true);
  // underside
  addRibbonChunks(
    group,
    track,
    skirtMat,
    (i) => P(i, -H(i) - 1.9, -SLAB),
    (i) => P(i, H(i) + 1.9, -SLAB),
    (i, k) => [k, i * ds * 0.05],
    true,
    true,
    false
  );

  const neonL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  neonL.color.setRGB(0.1, 1.2, 2.0);
  const neonR = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  neonR.color.setRGB(2.2, 0.8, 0.1);

  for (const side of [-1, 1] as const) {
    const flip = side === -1;
    // inner face
    addRibbonChunks(
      group,
      track,
      wallMat,
      (i) => P(i, side * H(i), 0),
      (i) => P(i, side * H(i), WH(i)),
      (i, k) => [(i * ds) / wallTile, k],
      flip,
      true,
      true
    );
    // cap
    addRibbonChunks(
      group,
      track,
      capMat,
      (i) => P(i, side * H(i), WH(i)),
      (i) => P(i, side * (H(i) + 1.9), WH(i)),
      (i, k) => [k, i * ds * 0.1],
      flip,
      true,
      true
    );
    // outer face
    addRibbonChunks(
      group,
      track,
      skirtMat,
      (i) => P(i, side * (H(i) + 1.9), WH(i)),
      (i) => P(i, side * (H(i) + 1.9), -SLAB),
      (i, k) => [k, i * ds * 0.1],
      flip,
      true,
      false
    );
    // neon strips
    addRibbonChunks(
      group,
      track,
      side === -1 ? neonL : neonR,
      (i) => P(i, side * (H(i) - 0.04), 1.05),
      (i) => P(i, side * (H(i) - 0.04), 1.3),
      () => [0, 0],
      false,
      false,
      false,
      60
    );
    // cap light strip
    addRibbonChunks(
      group,
      track,
      side === -1 ? neonL : neonR,
      (i) => P(i, side * (H(i) + 0.35), WH(i) + 0.03),
      (i) => P(i, side * (H(i) + 0.6), WH(i) + 0.03),
      () => [0, 0],
      false,
      false,
      false,
      60
    );
  }

  // ---- Boost pads
  const boostTex = boostTexture();
  const boostMaterials: THREE.MeshBasicMaterial[] = [];
  const padLen = 26;
  track.pads.forEach((pad) => {
    const mat = new THREE.MeshBasicMaterial({
      map: boostTex.clone(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.map!.needsUpdate = true;
    mat.color.setRGB(1.1, 1.1, 1.1);
    boostMaterials.push(mat);
    const i0 = Math.floor(track.wrapS(pad.s - padLen / 2) / ds);
    const cnt = Math.ceil(padLen / ds);
    const g = buildRibbon(
      i0,
      i0 + cnt,
      n,
      (i) => P(i, pad.d - 5, 0.06),
      (i) => P(i, pad.d + 5, 0.06),
      (i, k) => [k, ((i - i0) * ds) / 13],
      false
    );
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    group.add(m);
  });

  // ---- Props: pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6f7a8f, roughness: 0.6, metalness: 0.5 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const pillarList: { s: number }[] = [];
  for (let s = 10; s < track.length; s += 34) pillarList.push({ s });
  const tmp = newFrame();
  const mats: { col: THREE.Matrix4[]; beam: THREE.Matrix4[]; foot: THREE.Matrix4[] } = { col: [], beam: [], foot: [] };
  const qy = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const basisM = new THREE.Matrix4();
  pillarList.forEach(({ s }) => {
    if (track.inCave(s, 40)) return;
    track.sample(s, tmp);
    const g0 = groundAt(tmp.pos.x, tmp.pos.z);
    const top = tmp.pos.y - SLAB;
    const h = top - g0;
    if (h < 3.5) return;
    const yaw = Math.atan2(-tmp.T.x, -tmp.T.z);
    qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m4.compose(new THREE.Vector3(tmp.pos.x, g0 + h / 2, tmp.pos.z), qy, new THREE.Vector3(3.4, h, 3.4));
    mats.col.push(m4.clone());
    m4.compose(new THREE.Vector3(tmp.pos.x, g0 + 0.8, tmp.pos.z), qy, new THREE.Vector3(8, 1.6, 8));
    mats.foot.push(m4.clone());
    basisM.makeBasis(tmp.R, tmp.N, tmp.T);
    const q = new THREE.Quaternion().setFromRotationMatrix(basisM);
    const bp = tmp.pos.clone().addScaledVector(tmp.N, -SLAB - 0.9);
    m4.compose(bp, q, new THREE.Vector3(30, 1.8, 3.6));
    mats.beam.push(m4.clone());
  });
  const mkInst = (list: THREE.Matrix4[], mat: THREE.Material, cast = true) => {
    const im = new THREE.InstancedMesh(unitBox, mat, Math.max(1, list.length));
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.count = list.length;
    im.castShadow = cast;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };
  mkInst(mats.col, pillarMat);
  mkInst(mats.foot, pillarMat);
  mkInst(mats.beam, skirtMat);

  // ---- Light poles
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b8, roughness: 0.4, metalness: 0.8 });
  const lampMat = new THREE.MeshBasicMaterial();
  lampMat.color.setRGB(2.0, 1.9, 1.7);
  const poleM: THREE.Matrix4[] = [];
  const armM: THREE.Matrix4[] = [];
  const lampM: THREE.Matrix4[] = [];
  let side = 1;
  for (let s = 40; s < track.length; s += 95) {
    track.sample(s, tmp);
    const rel = track.wrapS(s - track.startS);
    // start straight has its own dressing
    if (rel > track.length - 260 || rel < 330) continue;
    if (track.inCave(s, 120)) continue;
    side = -side;
    basisM.makeBasis(tmp.R, tmp.N, tmp.T);
    const q = new THREE.Quaternion().setFromRotationMatrix(basisM);
    const base = tmp.pos.clone().addScaledVector(tmp.R, side * 22.6).addScaledVector(tmp.N, 3);
    const pc = base.clone().addScaledVector(tmp.N, 7.5);
    m4.compose(pc, q, new THREE.Vector3(0.7, 17, 0.7));
    poleM.push(m4.clone());
    const ac = base.clone().addScaledVector(tmp.N, 15.5).addScaledVector(tmp.R, -side * 2.2);
    m4.compose(ac, q, new THREE.Vector3(5, 0.5, 0.5));
    armM.push(m4.clone());
    const lc = base.clone().addScaledVector(tmp.N, 15.2).addScaledVector(tmp.R, -side * 4.4);
    m4.compose(lc, q, new THREE.Vector3(2.4, 0.3, 1.2));
    lampM.push(m4.clone());
  }
  mkInst(poleM, poleMat);
  mkInst(armM, poleMat);
  mkInst(lampM, lampMat, false);

  // ---- Gates
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.35, metalness: 0.8 });
  const gateGlowC = new THREE.MeshBasicMaterial();
  gateGlowC.color.setRGB(0.15, 1.1, 2.0);
  const gateGlowO = new THREE.MeshBasicMaterial();
  gateGlowO.color.setRGB(2.2, 0.8, 0.12);
  const postM: THREE.Matrix4[] = [];
  const beamM: THREE.Matrix4[] = [];
  const glowA: THREE.Matrix4[] = [];
  const glowB: THREE.Matrix4[] = [];
  for (let s = 260; s < track.length; s += 410) {
    const rel = track.wrapS(s - track.startS);
    if (rel > track.length - 300 || rel < 340) continue;
    if (track.inCave(s, 160)) continue;
    track.sample(s, tmp);
    basisM.makeBasis(tmp.R, tmp.N, tmp.T);
    const q = new THREE.Quaternion().setFromRotationMatrix(basisM);
    for (const sd of [-1, 1]) {
      const pp = tmp.pos.clone().addScaledVector(tmp.R, sd * 22).addScaledVector(tmp.N, 10);
      m4.compose(pp, q, new THREE.Vector3(2.2, 24, 2.2));
      postM.push(m4.clone());
      const gl = tmp.pos.clone().addScaledVector(tmp.R, sd * 20.8).addScaledVector(tmp.N, 10);
      m4.compose(gl, q, new THREE.Vector3(0.3, 22, 0.5));
      (sd === -1 ? glowA : glowB).push(m4.clone());
    }
    const bp = tmp.pos.clone().addScaledVector(tmp.N, 22);
    m4.compose(bp, q, new THREE.Vector3(48, 2.6, 3));
    beamM.push(m4.clone());
    const gb = tmp.pos.clone().addScaledVector(tmp.N, 20.55);
    m4.compose(gb, q, new THREE.Vector3(42, 0.35, 0.6));
    glowA.push(m4.clone());
  }
  mkInst(postM, gateMat);
  mkInst(beamM, gateMat);
  mkInst(glowA, gateGlowC, false);
  mkInst(glowB, gateGlowO, false);

  // ---- Billboards
  const bbTex = [0, 1, 2, 3, 4].map((k) => adTexture(k));
  const bbGeo = new THREE.PlaneGeometry(26, 6.5);
  let bi = 0;
  for (let s = 120; s < track.length; s += 175) {
    const rel = track.wrapS(s - track.startS);
    if (rel > track.length - 340 || rel < 340) continue;
    if (track.inCave(s, 160)) continue;
    track.sample(s, tmp);
    const sd = bi % 2 === 0 ? 1 : -1;
    const t = bbTex[bi % bbTex.length];
    bi++;
    const mat = new THREE.MeshStandardMaterial({
      map: t,
      emissiveMap: t,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 0.4,
      roughness: 0.5,
      metalness: 0.2,
    });
    const z = tmp.R.clone().multiplyScalar(-sd);
    const y = tmp.N.clone();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    basisM.makeBasis(x, y, z);
    const mesh = new THREE.Mesh(bbGeo, mat);
    mesh.quaternion.setFromRotationMatrix(basisM);
    mesh.position.copy(tmp.pos).addScaledVector(tmp.R, sd * 28).addScaledVector(tmp.N, 11);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // frame + posts
    for (const off of [-9, 9]) {
      const post = new THREE.Mesh(unitBox, poleMat);
      post.scale.set(0.8, 12, 0.8);
      post.quaternion.copy(mesh.quaternion);
      post.position
        .copy(mesh.position)
        .addScaledVector(x, off)
        .addScaledVector(y, -3.5 - 2.5)
        .addScaledVector(z, -0.8);
      post.castShadow = true;
      group.add(post);
    }
    const back = new THREE.Mesh(unitBox, skirtMat);
    back.scale.set(26.6, 7.1, 0.5);
    back.quaternion.copy(mesh.quaternion);
    back.position.copy(mesh.position).addScaledVector(z, -0.35);
    back.castShadow = true;
    group.add(back);
  }

  const update = (dt: number) => {
    for (const m of boostMaterials) {
      m.map!.offset.y -= dt * 1.4;
    }
  };

  return { group, roadMat, wallMat, boostMaterials, update };
}
