import * as THREE from 'three';
import { TrackDef, loopList, makeCurve } from './trackDefs';
import { RAMP_APPROACH, LANDING_RETURN, JUMP_GAP_LENGTH, jumpTrackHeight } from './jump';
import { SHORTCUT_OFFSET, SHORTCUT_HALF_WIDTH, followsForward } from './shortcut';

export const TRACK_WIDTH = 46;
export const HW = TRACK_WIDTH / 2;

export interface Frame {
  pos: THREE.Vector3;
  t: THREE.Vector3; // forward
  u: THREE.Vector3; // up
  r: THREE.Vector3; // track-right (t cross u); positive lateral position goes right
}

export const makeFrame = (): Frame => ({
  pos: new THREE.Vector3(),
  t: new THREE.Vector3(),
  u: new THREE.Vector3(),
  r: new THREE.Vector3(),
});

const _m = new THREE.Matrix4();
const _l = new THREE.Vector3();

/** Position + orient an object (+Z forward, +X left); positive lat moves to track-right. */
export function orientToFrame(obj: THREE.Object3D, f: Frame, lat = 0, up = 0, fwd = 0) {
  obj.position.copy(f.pos).addScaledVector(f.r, lat).addScaledVector(f.u, up).addScaledVector(f.t, fwd);
  _l.copy(f.r).negate();
  _m.makeBasis(_l, f.u, f.t);
  obj.quaternion.setFromRotationMatrix(_m);
}

export const PAD_HALF_LEN = 10;
export const PAD_HALF_WID = 7;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(arr: number[], radius: number, passes: number) {
  const n = arr.length;
  let a = arr.slice();
  for (let p = 0; p < passes; p++) {
    const b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += a[(i + k + n * 4) % n];
      b[i] = s / (2 * radius + 1);
    }
    a = b;
  }
  return a;
}

function roadTexture(maxAniso: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const rand = rng(11);
  g.fillStyle = '#2c3239';
  g.fillRect(0, 0, 512, 1024);
  // panel tone variation
  for (let py = 0; py < 1024; py += 256) {
    for (const [x0, x1] of [
      [56, 256],
      [256, 456],
    ]) {
      const v = Math.floor(rand() * 10);
      g.fillStyle = `rgba(${200 + v},${215 + v},${230},${0.025 + rand() * 0.05})`;
      g.fillRect(x0, py, x1 - x0, 256);
    }
  }
  for (let i = 0; i < 14000; i++) {
    const v = Math.floor(rand() * 255);
    g.fillStyle = `rgba(${v},${v},${v},0.06)`;
    g.fillRect(rand() * 512, rand() * 1024, 1 + rand() * 3, 1 + rand() * 3);
  }
  // Brushed alloy wear and fine directional scratches, kept subtle at racing speed.
  for (let i = 0; i < 1700; i++) {
    const x = 60 + rand() * 392, y = rand() * 1024;
    g.fillStyle = rand() > 0.5 ? 'rgba(193,215,225,0.07)' : 'rgba(4,10,18,0.12)';
    g.fillRect(x, y, 0.6 + rand() * 1.5, 4 + rand() * 35);
  }
  // hazard bands on the edges
  for (const [x0, x1] of [
    [0, 44],
    [468, 512],
  ]) {
    g.save();
    g.beginPath();
    g.rect(x0, 0, x1 - x0, 1024);
    g.clip();
    g.fillStyle = '#1b1e23';
    g.fillRect(x0, 0, x1 - x0, 1024);
    g.fillStyle = '#526e7a';
    for (let y = -128; y < 1152; y += 128) {
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y - 44);
      g.lineTo(x1, y - 44 + 22);
      g.lineTo(x0, y + 22);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // seams
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 0; y < 1024; y += 256) g.fillRect(44, y - 2, 424, 4);
  for (const x of [44, 254, 466]) g.fillRect(x - 2, 0, 4, 1024);
  g.fillStyle = 'rgba(180,200,220,0.18)';
  for (let y = 0; y < 1024; y += 256) g.fillRect(44, y + 2, 424, 1);
  // Recessed fasteners and bevels make the modular track read as engineered metal.
  for (let y = 0; y < 1024; y += 256) for (const x of [65, 245, 267, 447]) {
    for (const dy of [12, 244]) {
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(x, y + dy, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(205,225,235,.35)'; g.fillRect(x - 1, y + dy - 1, 2, 1);
    }
  }
  // edge lines
  g.fillStyle = 'rgba(225,235,245,0.95)';
  g.fillRect(52, 0, 7, 1024);
  g.fillRect(453, 0, 7, 1024);
  // dashed center
  g.fillStyle = 'rgba(150,175,195,0.9)';
  for (let y = 0; y < 1024; y += 256) g.fillRect(252, y + 30, 8, 150);
  // Minimal directional arrows, kept quiet so lane markings remain readable.
  g.fillStyle = 'rgba(150,185,210,0.09)';
  for (const x of [156, 356]) {
    for (let y = 0; y < 1024; y += 512) {
      g.beginPath();
      g.moveTo(x, y + 120);
      g.lineTo(x + 34, y + 200);
      g.lineTo(x + 12, y + 200);
      g.lineTo(x + 12, y + 280);
      g.lineTo(x - 12, y + 280);
      g.lineTo(x - 12, y + 200);
      g.lineTo(x - 34, y + 200);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

// Linear data map shared by bump and roughness: fine grain, shallow panel seams
// and directional wear give wet reflections a broken, believable surface.
function roadSurfaceTexture(maxAniso: number) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d')!; const rand = rng(784);
  g.fillStyle = '#a8a8a8'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 24000; i++) {
    const v = Math.floor(110 + rand() * 90);
    g.fillStyle = `rgba(${v},${v},${v},0.3)`;
    g.fillRect(rand() * 512, rand() * 1024, 1 + rand() * 2, 1 + rand() * 4);
  }
  g.fillStyle = '#555';
  for (let y = 0; y < 1024; y += 256) g.fillRect(0, y, 512, 2);
  for (const x of [44, 254, 466]) g.fillRect(x, 0, 2, 1024);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = 'rgba(65,65,65,.18)';
    g.fillRect(rand() * 512, rand() * 1024, 1, 5 + rand() * 25);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  return t;
}

function wallTexture(maxAniso: number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c2cdd5';
  g.fillRect(0, 0, 128, 256);
  const rand = rng(98);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = rand() > .5 ? 'rgba(255,255,255,.09)' : 'rgba(10,20,30,.08)';
    g.fillRect(rand() * 128, rand() * 200, 1, 1 + rand() * 7);
  }
  g.fillStyle = 'rgba(255,255,255,.2)';
  for (let x = 0; x < 128; x += 32) g.fillRect(x + 3, 5, 1, 188);
  g.fillStyle = '#20252b';
  g.fillRect(0, 200, 128, 56);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 128, 4);
  g.fillRect(0, 196, 128, 4);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 2, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

function padTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(255,170,0,0.10)';
  g.fillRect(0, 0, 256, 512);
  g.shadowColor = '#ff9a00';
  g.shadowBlur = 18;
  g.strokeStyle = '#ffe34d';
  g.lineWidth = 28;
  g.lineJoin = 'miter';
  for (let k = 0; k < 3; k++) {
    const y = 90 + k * 160;
    g.beginPath();
    g.moveTo(36, y + 56);
    g.lineTo(128, y);
    g.lineTo(220, y + 56);
    g.stroke();
  }
  g.fillStyle = '#ffd400';
  g.fillRect(0, 0, 8, 512);
  g.fillRect(248, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 32; x++) {
      g.fillStyle = (x + y) % 2 ? '#f4f6f8' : '#111418';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Track {
  N = 0;
  L = 0;
  ds = 0;
  P: THREE.Vector3[] = [];
  T: THREE.Vector3[] = [];
  U: THREE.Vector3[] = [];
  R: THREE.Vector3[] = [];
  K: number[] = [];
  KV: number[] = [];
  bad: boolean[] = [];
  loops: { s0: number; s1: number }[] = [];
  group = new THREE.Group();
  pads: { s: number; lat: number }[] = [];
  rampS = 0;
  rampGap = 0;
  private rampReady = false;
  shortcut: { start: number; span: number; side: number; curve: THREE.CubicBezierCurve3; length: number; up0: THREE.Vector3; up1: THREE.Vector3 } | null = null;
  padTex: THREE.Texture;
  roadMaterial!: THREE.MeshPhysicalMaterial;
  minimap: { x: number; y: number }[] = [];
  minY = 0;
  maxY = 0;
  cx = 0;
  cz = 0;
  ext = 0;
  def: TrackDef;
  private _f = makeFrame();

  constructor(maxAniso: number, def: TrackDef) {
    this.def = def;
    this.buildCurve();
    this.chooseRamp();
    this.buildJumpProfile();
    // Never leave a boost pad floating in the gap or under the ramp.
    for (const pad of this.pads) {
      const d = this.rampOffset(pad.s);
      if (d > -RAMP_APPROACH - 15 && d < this.rampGap + 30) {
        pad.s = this.wrap(this.rampS - RAMP_APPROACH - 40);
      }
    }
    this.chooseShortcut();
    this.padTex = padTexture();
    this.buildMesh(maxAniso);
  }

  setWetness(level: number) {
    this.roadMaterial.roughness = THREE.MathUtils.lerp(0.82, 0.52, level);
    this.roadMaterial.metalness = THREE.MathUtils.lerp(0.3, 0.42, level);
    this.roadMaterial.envMapIntensity = THREE.MathUtils.lerp(0.8, 1.0, level);
    this.roadMaterial.clearcoat = THREE.MathUtils.lerp(0.12, 0.45, level);
    this.roadMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.45, 0.26, level);
  }

  private buildCurve() {
    const curve = makeCurve(this.def);
    this.L = curve.getLength();
    const N = Math.round(this.L / 2.2);
    this.N = N;
    const sp = curve.getSpacedPoints(N);
    this.P = sp.slice(0, N);
    this.ds = this.L / N;
    const ds = this.ds;

    for (let i = 0; i < N; i++) {
      this.T.push(this.P[(i + 1) % N].clone().sub(this.P[(i - 1 + N) % N]).normalize());
    }

    // ---- loop zones: found from the loop specs (entry / exit sample indices) ----
    const zones: { a: number; b: number }[] = [];
    const nearest = (v: THREE.Vector3) => {
      let bi = 0,
        bd = Infinity;
      for (let i = 0; i < N; i++) {
        const d = this.P[i].distanceToSquared(v);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi;
    };
    for (const lp of loopList(this.def)) {
      const e = lp.o.clone().addScaledVector(lp.r, lp.side * lp.shift);
      const ia = nearest(lp.o);
      let ib = nearest(e);
      if (ib < ia) ib += N;
      zones.push({ a: ia, b: ib });
    }
    const inZone = new Array(N).fill(false);
    for (const z of zones) for (let i = z.a; i <= z.b; i++) inZone[i % N] = true;

    // ---- frames: horizon-up on the flat, Frenet (curvature vector) inside loops ----
    const Y = new THREE.Vector3(0, 1, 0);
    let U0: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const T = this.T[i];
      if (inZone[i]) {
        const c = this.T[(i + 1) % N].clone().sub(this.T[(i - 1 + N) % N]);
        c.addScaledVector(T, -c.dot(T));
        if (c.lengthSq() < 1e-12) c.copy(Y);
        U0.push(c.normalize());
      } else {
        const u = Y.clone().addScaledVector(T, -Y.dot(T));
        U0.push(u.normalize());
      }
    }
    // light smoothing of the up vectors (removes spline noise, blends loop <-> flat)
    {
      const rad = 4;
      const sm: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) {
        const v = new THREE.Vector3();
        for (let k = -rad; k <= rad; k++) v.add(U0[(i + k + N) % N]);
        v.addScaledVector(this.T[i], -v.dot(this.T[i]));
        sm.push(v.normalize());
      }
      U0 = sm;
    }
    const Ur = U0;
    const Rr = Ur.map((u, i) => new THREE.Vector3().crossVectors(this.T[i], u).normalize());

    // curvature in the lateral (K) and vertical (KV) planes of the frame
    let K: number[] = [];
    let KV: number[] = [];
    for (let i = 0; i < N; i++) {
      const dT = this.T[(i + 1) % N].clone().sub(this.T[(i - 1 + N) % N]);
      K.push(inZone[i] ? 0 : dT.dot(Rr[i]) / (2 * ds));
      KV.push(dT.dot(Ur[i]) / (2 * ds));
    }
    K = smooth(K, Math.max(2, Math.round(30 / ds)), 3);
    KV = smooth(KV, Math.max(2, Math.round(10 / ds)), 2);
    this.K = K;
    this.KV = KV;
    const bank = smooth(
      K.map((k) => THREE.MathUtils.clamp(k * 150, -0.52, 0.52)),
      Math.round(44 / ds),
      2
    );
    for (let i = 0; i < N; i++) {
      const b = inZone[i] ? 0 : bank[i];
      const U = Ur[i].clone().multiplyScalar(Math.cos(b)).addScaledVector(Rr[i], Math.sin(b)).normalize();
      const R = new THREE.Vector3().crossVectors(this.T[i], U).normalize();
      this.U.push(U);
      this.R.push(R);
    }

    // ---- loop / inverted zones (for placing props & pads) ----
    const dil = Math.round(80 / ds);
    this.bad = new Array(N).fill(false);
    for (let i = 0; i < N; i++) {
      if (!inZone[i]) continue;
      for (let k = -dil; k <= dil; k++) this.bad[(i + k + N * 4) % N] = true;
    }
    for (const z of zones) this.loops.push({ s0: (z.a % N) * ds, s1: (z.b % N) * ds });

    // ---- bounds / minimap ----
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    this.minY = Infinity;
    this.maxY = -Infinity;
    for (const p of this.P) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      this.minY = Math.min(this.minY, p.y);
      this.maxY = Math.max(this.maxY, p.y);
    }
    this.cx = (minX + maxX) / 2;
    this.cz = (minZ + maxZ) / 2;
    for (const p of this.P) this.ext = Math.max(this.ext, Math.hypot(p.x - this.cx, p.z - this.cz));
    const sc = Math.max(maxX - minX, maxZ - minZ);
    for (const p of this.P) this.minimap.push({ x: (p.x - this.cx) / sc, y: (p.z - this.cz) / sc });

    // ---- boost pads (kept away from loops) ----
    for (const pd of this.def.pads) {
      const s0 = pd.f * this.L;
      let found = s0;
      outer: for (let k = 0; k < 500; k++) {
        for (const sg of [1, -1]) {
          const c = s0 + sg * k * 8;
          if (this.flat(c, 16)) {
            found = c;
            break outer;
          }
        }
      }
      this.pads.push({ s: this.wrap(found), lat: pd.lat });
    }
  }

  /** Choose a clear, gently curved section with enough space to land before a loop. */
  private chooseRamp() {
    let best = Infinity;
    for (let i = 0; i < 160; i++) {
      const s = this.L * (0.12 + 0.76 * i / 159);
      if (!this.flat(s + JUMP_GAP_LENGTH * 0.5, JUMP_GAP_LENGTH * 0.5 + RAMP_APPROACH + 30)) continue;
      let bend = 0, grade = 0;
      for (let d = -RAMP_APPROACH; d <= JUMP_GAP_LENGTH + LANDING_RETURN; d += 30) {
        bend = Math.max(bend, Math.abs(this.curvatureAt(s + d)));
        grade = Math.max(grade, Math.abs(this.slopeAt(s + d)));
      }
      let padPenalty = 0;
      for (const pad of this.pads) {
        const distance = Math.abs(((pad.s - s + this.L * 1.5) % this.L) - this.L / 2);
        if (distance < JUMP_GAP_LENGTH + 50) padPenalty += (JUMP_GAP_LENGTH + 50 - distance) * 0.001;
      }
      const score = bend * 20 + grade * 0.1 + padPenalty + Math.abs(s / this.L - 0.3) * 0.025;
      if (score < best) { best = score; this.rampS = s; }
    }
    // A non-zero fallback is retained even on unusually constrained layouts.
    if (!Number.isFinite(best)) this.rampS = this.L * 0.3;
    // Align both ends with mesh stations, avoiding half-polygons across the gap.
    this.rampS = Math.round(this.rampS / this.ds) * this.ds;
    this.rampGap = Math.round(JUMP_GAP_LENGTH / this.ds) * this.ds;
  }

  private buildJumpProfile() {
    const affected: number[] = [];
    for (let i = 0; i < this.N; i++) {
      const d = this.rampOffset(i * this.ds);
      const h = jumpTrackHeight(d, this.rampGap);
      if (h !== 0) this.P[i].addScaledVector(this.U[i], h);
      if (d >= -RAMP_APPROACH - this.ds * 2 && d <= this.rampGap + LANDING_RETURN + this.ds * 2) affected.push(i);
    }
    for (const i of affected) {
      const tangent = this.P[(i + 1) % this.N].clone().sub(this.P[(i - 1 + this.N) % this.N]).normalize();
      const up = this.U[i].clone().addScaledVector(tangent, -this.U[i].dot(tangent)).normalize();
      this.T[i].copy(tangent); this.U[i].copy(up);
      this.R[i].crossVectors(tangent, up).normalize();
    }
    this.rampReady = true;
  }

  /** A physically shorter inner line that rejoins the normal circuit. */
  private chooseShortcut() {
    const span = Math.min(520, this.L * 0.13);
    let bestSaving = 0;
    const f0 = makeFrame(), f1 = makeFrame();
    for (let i = 0; i < 100; i++) {
      const start = this.L * (0.07 + i * 0.008);
      if (start + span > this.L - 60 || !this.flat(start + span / 2, span / 2 + 35)) continue;
      this.frameAt(start, f0); this.frameAt(start + span, f1);
      for (const side of [-1, 1]) {
        const a = f0.pos.clone().addScaledVector(f0.r, side * SHORTCUT_OFFSET);
        const b = f1.pos.clone().addScaledVector(f1.r, side * SHORTCUT_OFFSET);
        const curve = new THREE.CubicBezierCurve3(a, a.clone().addScaledVector(f0.t, span * 0.25), b.clone().addScaledVector(f1.t, -span * 0.25), b);
        // Reject cuts that turn against the racing direction at any point.
        let forward = true;
        const check = makeFrame();
        for (let sample = 0; sample <= 20; sample++) {
          const u = sample / 20;
          this.frameAt(start + span * u, check);
          if (!followsForward(curve.getTangentAt(u), check.t)) { forward = false; break; }
        }
        if (!forward) continue;
        const len = curve.getLength();
        const saving = span - len;
        if (saving > bestSaving && len > span * 0.4) {
          bestSaving = saving;
          this.shortcut = { start, span, side, curve, length: len, up0: f0.u.clone(), up1: f1.u.clone() };
        }
      }
      // Prefer the first substantial shortcut, so the fork is encountered early in the lap.
      if (bestSaving >= 20) break;
    }
    // Do not grant artificial progress on a shortcut that isn't actually shorter.
    if (bestSaving < 8) this.shortcut = null;
  }

  shortcutFrameAt(progress: number, out: Frame) {
    const shortcut = this.shortcut!;
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    shortcut.curve.getPointAt(t, out.pos);
    shortcut.curve.getTangentAt(t, out.t).normalize();
    out.u.lerpVectors(shortcut.up0, shortcut.up1, t).normalize();
    out.r.crossVectors(out.t, out.u).normalize();
    out.u.crossVectors(out.r, out.t).normalize();
    return out;
  }

  private buildShortcut() {
    const sc = this.shortcut;
    if (!sc) return;
    const n = 100, pos: number[] = [], uv: number[] = [], indices: number[] = [];
    const frame = makeFrame();
    for (let i = 0; i <= n; i++) {
      this.shortcutFrameAt(i / n, frame);
      for (const side of [-1, 1]) {
        const p = frame.pos.clone().addScaledVector(frame.r, side * SHORTCUT_HALF_WIDTH).addScaledVector(frame.u, 0.12);
        pos.push(p.x, p.y, p.z); uv.push(side < 0 ? 0 : 1, i / n * 5);
      }
      if (i < n) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color: 0x23556a, metalness: 0.32, roughness: 0.48, clearcoat: 0.35, side: THREE.DoubleSide }));
    road.receiveShadow = true; this.group.add(road);
    // Thin luminous edge strips keep the risky alternate route readable from a distance.
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        this.shortcutFrameAt(i / n, frame);
        points.push(frame.pos.clone().addScaledVector(frame.r, side * (SHORTCUT_HALF_WIDTH - 0.3)).addScaledVector(frame.u, 0.2));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x58e2ff }));
      this.group.add(line);
    }
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#102d42'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#7af3ff'; g.lineWidth = 8; g.strokeRect(5, 5, 502, 246);
    g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = 'bold 66px Arial'; g.fillText('SHORTCUT', 256, 105);
    g.fillStyle = '#69e9ff'; g.font = 'bold 84px Arial'; g.fillText(sc.side > 0 ? '>>>' : '<<<', 256, 205);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const markerMaterial = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    // Road markings precede the actual split, rather than flashing past at the lip.
    for (const distance of [120, 45]) {
      const marker = new THREE.Mesh(this.patch(sc.start - distance, 20, sc.side * SHORTCUT_OFFSET, 7, 0.11), markerMaterial);
      this.group.add(marker);
    }
    // A readable overhead fork sign makes both choices visible before committing.
    const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 256;
    const sg = signCanvas.getContext('2d')!;
    sg.fillStyle = '#102234'; sg.fillRect(0, 0, 1024, 256);
    sg.fillStyle = '#3dd7e8'; sg.fillRect(0, 0, 1024, 9); sg.fillRect(0, 247, 1024, 9);
    sg.textAlign = 'center'; sg.fillStyle = '#eaf8ff'; sg.font = 'bold 52px Arial';
    const fastX = sc.side > 0 ? 770 : 254, normalX = sc.side > 0 ? 254 : 770;
    sg.fillText('JALUR BIASA', normalX, 97);
    sg.fillStyle = '#6df0ff'; sg.fillText('SHORTCUT', fastX, 97);
    sg.font = 'bold 70px Arial'; sg.fillText(sc.side > 0 ? '>>>' : '<<<', fastX, 193);
    sg.fillStyle = '#c1d5e4'; sg.fillText('^', normalX, 193);
    const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x263746, metalness: 0.45, roughness: 0.48 });
    const gantry = new THREE.Group();
    for (const x of [-HW - 2, HW + 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), gantryMat);
      post.position.set(x, 6, 0); gantry.add(post);
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(43, 5), new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide }));
    board.rotation.y = Math.PI;
    board.position.set(0, 10.5, 0); gantry.add(board);
    this.frameAt(sc.start - 80, frame);
    orientToFrame(gantry, frame);
    this.group.add(gantry);
  }

  rampOffset(s: number) {
    return ((this.wrap(s) - this.rampS + this.L * 1.5) % this.L) - this.L / 2;
  }

  private rampMesh() {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const segments = 44;
    for (let i = 0; i <= segments; i++) {
      const d = -RAMP_APPROACH + RAMP_APPROACH * i / segments;
      this.frameAt(this.rampS + d, this._f);
      for (const side of [-1, 1]) {
        const v = this._f.pos.clone().addScaledVector(this._f.r, side * (HW - 2)).addScaledVector(this._f.u, 0.08);
        positions.push(v.x, v.y, v.z); uvs.push(side < 0 ? 0 : 1, i / segments);
      }
      if (i < segments) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#24384b'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#51d3eb'; g.fillRect(5, 0, 8, 512); g.fillRect(499, 0, 8, 512);
    g.strokeStyle = '#90ecff'; g.lineWidth = 12; g.lineJoin = 'round';
    for (const y of [120, 250, 380]) {
      g.beginPath(); g.moveTo(165, y + 38); g.lineTo(256, y - 25); g.lineTo(347, y + 38); g.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshPhysicalMaterial({ map: texture, metalness: 0.35, roughness: 0.42, clearcoat: 0.35, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true; return mesh;
  }

  /** true when [s-half, s+half] is clear of loop / inverted sections */
  flat(s: number, half: number) {
    for (let d = -half; d <= half; d += this.ds * 2) {
      const i = Math.floor(this.wrap(s + d) / this.ds) % this.N;
      if (this.bad[i] || (this.rampReady && this.rampOffset(s + d) > -12 && this.rampOffset(s + d) < this.rampGap + 12)) return false;
    }
    return true;
  }

  wrap(s: number) {
    return ((s % this.L) + this.L) % this.L;
  }

  frameAt(s: number, out: Frame) {
    const f = this.wrap(s) / this.ds;
    const fl = Math.floor(f);
    const i0 = fl % this.N;
    const i1 = (i0 + 1) % this.N;
    const a = f - fl;
    out.pos.lerpVectors(this.P[i0], this.P[i1], a);
    out.t.lerpVectors(this.T[i0], this.T[i1], a).normalize();
    out.u.lerpVectors(this.U[i0], this.U[i1], a);
    out.r.crossVectors(out.t, out.u).normalize();
    out.u.crossVectors(out.r, out.t).normalize();
    return out;
  }

  private lerpArr(arr: number[], s: number) {
    const f = this.wrap(s) / this.ds;
    const fl = Math.floor(f);
    const i0 = fl % this.N;
    const a = f - fl;
    return arr[i0] * (1 - a) + arr[(i0 + 1) % this.N] * a;
  }

  curvatureAt(s: number) {
    return this.lerpArr(this.K, s);
  }

  kvAt(s: number) {
    return this.lerpArr(this.KV, s);
  }

  slopeAt(s: number) {
    const f = this.wrap(s) / this.ds;
    return this.T[Math.floor(f) % this.N].y;
  }

  /** build a swept mesh along the whole track */
  private sweep(
    profile: number[][],
    vScale: number,
    color?: (station: number, seg: number) => THREE.Color
  ) {
    const N = this.N;
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const vs = this.L / Math.max(1, Math.round(this.L / vScale));
    let total = 0;
    for (let j = 0; j < profile.length - 1; j++)
      total += Math.hypot(profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]);
    let acc = 0;
    for (let j = 0; j < profile.length - 1; j++) {
      const [x0, y0] = profile[j];
      const [x1, y1] = profile[j + 1];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      const u0 = acc / total;
      const u1 = (acc + segLen) / total;
      acc += segLen;
      const base = positions.length / 3;
      for (let i = 0; i <= N; i++) {
        const ii = i % N;
        const p = this.P[ii],
          r = this.R[ii],
          u = this.U[ii];
        positions.push(
          p.x + r.x * x0 + u.x * y0,
          p.y + r.y * x0 + u.y * y0,
          p.z + r.z * x0 + u.z * y0,
          p.x + r.x * x1 + u.x * y1,
          p.y + r.y * x1 + u.y * y1,
          p.z + r.z * x1 + u.z * y1
        );
        const v = (i * this.ds) / vs;
        uvs.push(u0, v, u1, v);
        if (color) {
          const c = color(i, j);
          colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < N; i++) {
        const offset = this.rampOffset((i + 0.5) * this.ds);
        if (offset > 0 && offset < this.rampGap) continue;
        // Leave an opening in the outer rail at the branch and rejoin.
        const sc = this.shortcut;
        const lateralMid = (x0 + x1) * 0.5;
        const ss = (i + 0.5) * this.ds;
        if (sc && lateralMid * sc.side > HW - 2.8 && (Math.abs(ss - sc.start) < 100 || Math.abs(ss - (sc.start + sc.span)) < 100)) continue;
        const a = base + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (color) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  private patch(sc: number, halfLen: number, latC: number, halfW: number, y: number, segs = 12) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k <= segs; k++) {
      const s = sc - halfLen + (2 * halfLen * k) / segs;
      this.frameAt(s, this._f);
      for (const side of [-1, 1]) {
        const lat = latC + side * halfW;
        const p = this._f.pos
          .clone()
          .addScaledVector(this._f.r, lat)
          .addScaledVector(this._f.u, y);
        positions.push(p.x, p.y, p.z);
        uvs.push(side < 0 ? 0 : 1, k / segs);
      }
    }
    for (let k = 0; k < segs; k++) {
      const a = k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  private buildMesh(aniso: number) {
    const roadTex = roadTexture(aniso);
    const wallTex = wallTexture(aniso);
    const surfaceTex = roadSurfaceTexture(aniso);

    const roadMat = new THREE.MeshPhysicalMaterial({
      map: roadTex,
      bumpMap: surfaceTex,
      bumpScale: 0.065,
      roughnessMap: surfaceTex,
      roughness: 0.62,
      metalness: 0.3,
      envMapIntensity: 0.85,
      clearcoat: 0.12,
      clearcoatRoughness: 0.45,
      side: THREE.DoubleSide,
    });
    this.roadMaterial = roadMat;
    const road = new THREE.Mesh(this.sweep([[-HW, 0], [HW, 0]], 92), roadMat);
    road.receiveShadow = true;
    this.group.add(road);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x4a525b,
      roughness: 0.4,
      metalness: 0.85,
      side: THREE.DoubleSide,
    });
    const hull = new THREE.Mesh(
      this.sweep(
        [
          [-HW, 0],
          [-HW, -1.4],
          [-HW + 5, -4.5],
          [-9, -10],
          [9, -10],
          [HW - 5, -4.5],
          [HW, -1.4],
          [HW, 0],
        ],
        30
      ),
      hullMat
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0xaab2ba,
      roughness: 0.38,
      metalness: 0.45,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    });
    const wallProfile = [
      [0.2, 0],
      [-0.5, 2.8],
      [-0.5, 4.3],
      [-2.6, 4.3],
      [-2.6, 0],
    ];
    const left = wallProfile.map(([x, y]) => [-HW + x, y]);
    const right = wallProfile.map(([x, y]) => [HW - x, y]);
    for (const prof of [left, right]) {
      const w = new THREE.Mesh(this.sweep(prof, 24), wallMat);
      w.castShadow = true;
      w.receiveShadow = true;
      this.group.add(w);
    }

    // emissive light strips
    const stripMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const cyan = new THREE.Color(0.12, 0.65, 1.3);
    const cyanDim = new THREE.Color(0.08, 0.32, 0.8);
    const amber = new THREE.Color(1.3, 0.55, 0.1);
    const amberDim = new THREE.Color(0.8, 0.28, 0.06);
    const mk = (a: THREE.Color, b: THREE.Color) => (i: number) => (Math.floor(i / 10) % 3 === 0 ? b : a);
    const wallStripL = new THREE.Mesh(
      this.sweep([[-HW + 0.1, 1.2], [-HW + 0.1, 1.8]], 24, mk(cyan, cyanDim)),
      stripMat
    );
    const wallStripR = new THREE.Mesh(
      this.sweep([[HW - 0.1, 1.2], [HW - 0.1, 1.8]], 24, mk(amber, amberDim)),
      stripMat
    );
    const edgeL = new THREE.Mesh(
      this.sweep([[-HW + 3.4, 0.05], [-HW + 4.2, 0.05]], 24, mk(cyan, cyanDim)),
      stripMat
    );
    const edgeR = new THREE.Mesh(
      this.sweep([[HW - 4.2, 0.05], [HW - 3.4, 0.05]], 24, mk(amber, amberDim)),
      stripMat
    );
    // underside glow strips
    const under = new THREE.Mesh(
      this.sweep([[-6, -9.95], [6, -9.95]], 24, mk(cyan, cyanDim)),
      stripMat
    );
    this.group.add(wallStripL, wallStripR, edgeL, edgeR, under);

    // wall-top glow
    const topL = new THREE.Mesh(
      this.sweep([[-HW - 0.9, 4.32], [-HW - 1.4, 4.32]], 24, () => new THREE.Color(0.9, 1.0, 1.15)),
      stripMat
    );
    const topR = new THREE.Mesh(
      this.sweep([[HW + 0.9, 4.32], [HW + 1.4, 4.32]], 24, () => new THREE.Color(0.9, 1.0, 1.15)),
      stripMat
    );
    this.group.add(topL, topR);

    // boost pads
    const padMat = new THREE.MeshBasicMaterial({
      map: this.padTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    padMat.color.setRGB(1.5, 1.3, 0.8);
    for (const pd of this.pads) {
      const m = new THREE.Mesh(this.patch(pd.s, PAD_HALF_LEN, pd.lat, PAD_HALF_WID, 0.08), padMat);
      m.renderOrder = 2;
      this.group.add(m);
    }

    // Full-width air ramp, built into a safe section of each circuit.
    this.group.add(this.rampMesh());
    this.buildShortcut();

    // start line
    const lineMat = new THREE.MeshBasicMaterial({ map: checkerTexture(), side: THREE.DoubleSide });
    const line = new THREE.Mesh(this.patch(0, 2, 0, HW - 3.5, 0.06, 2), lineMat);
    this.group.add(line);
  }
}
