import * as THREE from "three";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function noise2(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, oct = 5) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(x: number, e0: number, e1: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));

/**
 * Build a strip (ribbon) between two polylines, for samples i0..i1 (indices wrap by `wrap`).
 * Default normal direction = (b - a) x (forward).
 */
export function buildRibbon(
  i0: number,
  i1: number,
  wrap: number,
  a: (i: number) => THREE.Vector3,
  b: (i: number) => THREE.Vector3,
  uv: (i: number, k: 0 | 1) => [number, number],
  flip = false
) {
  const count = i1 - i0 + 1;
  const pos = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const idx: number[] = [];
  for (let k = 0; k < count; k++) {
    const i = i0 + k;
    const w = ((i % wrap) + wrap) % wrap;
    const pa = a(w);
    const pb = b(w);
    pos.set([pa.x, pa.y, pa.z], k * 6);
    pos.set([pb.x, pb.y, pb.z], k * 6 + 3);
    const ua = uv(i, 0);
    const ub = uv(i, 1);
    uvs.set([ua[0], ua[1]], k * 4);
    uvs.set([ub[0], ub[1]], k * 4 + 2);
    if (k < count - 1) {
      const A = k * 2;
      const B = k * 2 + 1;
      const C = (k + 1) * 2;
      const D = (k + 1) * 2 + 1;
      if (!flip) idx.push(A, B, C, B, D, C);
      else idx.push(A, C, B, B, C, D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Quad from 4 corner points (p0,p1,p2,p3 CCW seen from the front). uv spans repeat counts. */
export function quadGeometry(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  ru = 1,
  rv = 1
) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z]),
      3
    )
  );
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, ru, 0, ru, rv, 0, rv]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function hash3(ix: number, iy: number, iz: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);
  return l(l(l(c000, c100, u), l(c010, c110, u), v), l(l(c001, c101, u), l(c011, c111, u), v), w);
}

export function fbm3(x: number, y: number, z: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f + i * 11.3, y * f + i * 5.7, z * f + i * 3.1);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
