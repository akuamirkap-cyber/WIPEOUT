import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Track, newFrame } from "./track";
import { clamp, fbm3, lerp, mulberry32, noise3, smoothstep } from "./utils";
import { glowTexture, portalSignTexture } from "./textures";

const STEP = 9; // ring spacing along the track
const SEG = 144; // vertices per ring
const PW = 2.6; // super-ellipse exponent (boxy, cathedral-like)

/** HDR palette: cyan, magenta, amber, emerald */
export const CAVE_PAL: [number, number, number][] = [
  [0.02, 0.72, 1.75],
  [1.6, 0.08, 1.4],
  [1.75, 0.5, 0.02],
  [0.05, 1.35, 0.38],
];

interface Ring {
  s: number;
  C: THREE.Vector3;
  R: THREE.Vector3;
  U: THREE.Vector3;
  T: THREE.Vector3;
  Rh: number;
  Ru: number;
  Rd: number;
  env: number;
  amp: number;
}

export interface CaveBuild {
  group: THREE.Group;
  contains(x: number, y: number, z: number, margin?: number): boolean;
  update(time: number, cf: number): void;
}

function noiseFactor(x: number, y: number, z: number, amp: number) {
  const a = fbm3(x * 0.0042, y * 0.0042, z * 0.0042, 3) - 0.47;
  const r = 1 - Math.abs(noise3(x * 0.014 + 5, y * 0.014, z * 0.014 + 9) * 2 - 1);
  return 1 + amp * a * 2.4 + amp * 0.5 * (r - 0.5);
}

/* ------------------------------------------------------------------ */
/* Rock material: procedural strata, bump, glowing veins (interior)    */
/* ------------------------------------------------------------------ */
function makeRockMaterial(uTime: { value: number }) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.04,
    side: THREE.DoubleSide,
    envMapIntensity: 1.0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uC0 = { value: new THREE.Vector3(...CAVE_PAL[0]) };
    shader.uniforms.uC1 = { value: new THREE.Vector3(...CAVE_PAL[1]) };
    shader.uniforms.uC2 = { value: new THREE.Vector3(...CAVE_PAL[2]) };
    shader.uniforms.uC3 = { value: new THREE.Vector3(...CAVE_PAL[3]) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aGlow;
varying vec3 vGlow;
varying vec3 vWPos;
varying vec3 vWNrm;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vGlow = aGlow;
vec4 cwp = vec4(transformed, 1.0);
vec3 cwn = objectNormal;
#ifdef USE_INSTANCING
cwp = instanceMatrix * cwp;
cwn = mat3(instanceMatrix) * cwn;
#endif
vWPos = (modelMatrix * cwp).xyz;
vWNrm = normalize(mat3(modelMatrix) * cwn);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
varying vec3 vGlow;
varying vec3 vWPos;
varying vec3 vWNrm;
float ch31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float cvn(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(ch31(i), ch31(i+vec3(1,0,0)), f.x), mix(ch31(i+vec3(0,1,0)), ch31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(ch31(i+vec3(0,0,1)), ch31(i+vec3(1,0,1)), f.x), mix(ch31(i+vec3(0,1,1)), ch31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 cavePal(float z){
  return z < 0.33 ? mix(uC0, uC1, z/0.33) : (z < 0.66 ? mix(uC1, uC2, (z-0.33)/0.33) : mix(uC2, uC3, (z-0.66)/0.34));
}
vec3 caveBump(vec3 sp, vec3 sn, float h, float fd){
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sX = dFdx(sp); vec3 sY = dFdy(sp);
  vec3 R1 = cross(sY, sn); vec3 R2 = cross(sn, sX);
  float det = dot(sX, R1) * fd;
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * sn - grad);
}
float cN1; float cN2; float cStrata;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  cN1 = cvn(vWPos*0.09) * 0.6 + cvn(vWPos*0.18) * 0.28 + cvn(vWPos*0.36) * 0.12;
  cN2 = cvn(vWPos*0.9);
  cStrata = cvn(vec3(vWPos.x*0.012, vWPos.y*0.045, vWPos.z*0.012));
  vec3 wnv = vWNrm * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 rockIn = diffuseColor.rgb * (0.3 + 0.7*cStrata) * (0.5 + 0.6*cN1) * 0.95;
  rockIn = mix(rockIn, rockIn * vec3(1.25, 1.0, 0.8), smoothstep(0.55, 0.8, cStrata));
  float snowAmt = smoothstep(0.3, 0.75, wnv.y + (cN1-0.5)*0.7) * smoothstep(-20.0, 140.0, vWPos.y);
  vec3 rockOut = vec3(0.17, 0.155, 0.15) * (0.55 + 0.9*cN1);
  vec3 outside = mix(rockOut, vec3(0.88, 0.92, 1.0), snowAmt);
  diffuseColor.rgb = gl_FrontFacing ? rockIn : outside;
}`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  float bh = (cN1 - 0.5) * 6.0 + (cN2 - 0.5) * 0.45;
  normal = caveBump(-vViewPosition, normal, bh, faceDirection);
}`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
if (gl_FrontFacing) {
  float f1 = cvn(vWPos*0.021) * 0.65 + cvn(vWPos*0.042) * 0.35;
  float vmask = smoothstep(0.4, 0.58, cvn(vWPos*0.0085 + 3.0));
  float vein = (1.0 - smoothstep(0.0, 0.0065, abs(f1 - 0.5))) * vmask;
  float f2 = cvn(vWPos*0.05 + 7.0);
  float vein2 = (1.0 - smoothstep(0.0, 0.0038, abs(f2 - 0.5))) * vmask;
  vec3 pal = cavePal(vGlow.x);
  float pulse = 0.72 + 0.28 * sin(uTime*1.2 + vWPos.x*0.009 + vWPos.z*0.012 + vWPos.y*0.006);
  totalEmissiveRadiance += pal * (vein * 2.4 + vein2 * 1.7) * pulse * (0.25 + 0.75*vGlow.z);
  float mossy = smoothstep(0.62, 0.8, cN1) * smoothstep(0.1, -0.9, vWNrm.y);
  totalEmissiveRadiance += pal.gbr * mossy * 0.12 * vGlow.z;
  float ab = vGlow.y * (0.45 + 0.55 * cvn(vWPos*0.012 + vec3(0.0, uTime*0.06, 0.0)));
  totalEmissiveRadiance += pal.brg * ab * 1.1;
  // faint ambient tint so far cavern walls never go fully black
  totalEmissiveRadiance += pal * (0.012 + 0.012 * cN1) * (0.4 + 0.6 * vGlow.z);
}`
      );
  };
  m.customProgramCacheKey = () => "cave-rock-v1";
  return m;
}

/* ------------------------------------------------------------------ */
function crystalGeometry() {
  const body = new THREE.CylinderGeometry(0.85, 1, 2, 6, 1);
  body.translate(0, 1, 0);
  const tip = new THREE.ConeGeometry(0.85, 1.5, 6, 1);
  tip.translate(0, 2.75, 0);
  return mergeGeometries([body, tip])!;
}

function mushroomGeometry() {
  const stalk = new THREE.CylinderGeometry(0.13, 0.2, 1, 8, 1, true);
  stalk.translate(0, 0.5, 0);
  const cap = new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.6, 1);
  cap.translate(0, 1.0, 0);
  const paint = (g: THREE.BufferGeometry, v: number) => {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3).fill(v);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  };
  paint(stalk, 0.28);
  paint(cap, 1.0);
  return mergeGeometries([stalk, cap])!;
}

function islandGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const n = fbm3(x * 1.6 + 3, y * 1.6, z * 1.6 + 8, 3);
    if (y > 0) {
      y *= 0.2 + 0.05 * n;
      x *= 1 + 0.12 * (n - 0.5);
      z *= 1 + 0.12 * (n - 0.5);
    } else {
      const d = -y;
      y = -Math.pow(d, 0.85) * 1.7 * (0.8 + 0.5 * n);
      const k = 1 - 0.62 * d + 0.25 * (n - 0.5);
      x *= k;
      z *= k;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const top = smoothstep(nrm.getY(i), 0.55, 0.85) * (p.getY(i) > -0.02 ? 1 : 0);
    const nn = 0.7 + 0.6 * fbm3(p.getX(i) * 3, p.getY(i) * 3, p.getZ(i) * 3, 2);
    col[i * 3] = lerp(0.26, 0.07, top) * nn;
    col[i * 3 + 1] = lerp(0.23, 0.3, top) * nn;
    col[i * 3 + 2] = lerp(0.3, 0.2, top) * nn;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(p.count * 3).map((_, i) => (i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0 : 0.7)), 3));
  return g;
}

function pillarGeometry(seed: number) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 18, 44, true);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const gl = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const t = y + 0.5;
    const a = Math.atan2(z, x);
    const n = noise3(Math.cos(a) * 1.8 + seed, t * 6, Math.sin(a) * 1.8) - 0.5;
    const m =
      0.6 + 1.9 * Math.pow(1 - t, 5) + 1.9 * Math.pow(t, 5) + 0.28 * n + 0.14 * Math.sin(t * 16 + seed * 3);
    p.setXYZ(i, x * m, y, z * m);
    const v = 0.75 + 0.7 * noise3(x * 4 + seed, y * 9, z * 4);
    col[i * 3] = 0.3 * v;
    col[i * 3 + 1] = 0.27 * v;
    col[i * 3 + 2] = 0.34 * v;
    gl[i * 3] = (seed * 0.37) % 1;
    gl[i * 3 + 1] = 0;
    gl[i * 3 + 2] = 0.8;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aGlow", new THREE.BufferAttribute(gl, 3));
  g.computeVertexNormals();
  return g;
}

function stalactiteGeometry() {
  const g = new THREE.ConeGeometry(1, 1, 7, 4, true);
  g.rotateX(Math.PI);
  g.translate(0, -0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.35 * (noise3(x * 3 + 1, y * 5, z * 3) - 0.5);
    p.setXYZ(i, x * k, y, z * k);
    const v = 0.8 + 0.5 * noise3(x * 6, y * 8, z * 6);
    col[i * 3] = 0.3 * v;
    col[i * 3 + 1] = 0.27 * v;
    col[i * 3 + 2] = 0.34 * v;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(p.count * 3).map((_, i) => (i % 3 === 2 ? 0.6 : i % 3 === 0 ? 0.3 : 0)), 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
export function buildCave(track: Track, groundAt: (x: number, z: number) => number): CaveBuild {
  const group = new THREE.Group();
  const rnd = mulberry32(20250);
  const s0 = track.caveS0;
  const s1 = track.caveS1;
  const L = s1 - s0;
  const K = Math.floor(L / STEP) + 1;
  const up = new THREE.Vector3(0, 1, 0);
  const fr = newFrame();
  const uTime = { value: 0 };
  const rockMat = makeRockMaterial(uTime);

  /* ---------------- rings ---------------- */
  const rings: Ring[] = [];
  const rhArr = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const s = s0 + k * STEP;
    const u = k * STEP;
    const env = smoothstep(u, 0, 430) * (1 - smoothstep(u, L - 430, L));
    let kmax = 0;
    for (let o = -90; o <= 90; o += 30) kmax = Math.max(kmax, Math.abs(track.kappaAt(s + o)));
    const lim = kmax > 1e-5 ? 0.76 / kmax : 1e9;
    const nz = fbm3(s * 0.0035, 1.7, 4.2, 3) - 0.47;
    rhArr[k] = Math.max(82, Math.min(lerp(88, 300, env) * (1 + 0.9 * nz * env), lim));
  }
  for (let pass = 0; pass < 4; pass++) {
    const c = rhArr.slice();
    for (let k = 0; k < K; k++) {
      let sum = 0;
      let n = 0;
      for (let o = -6; o <= 6; o++) {
        const kk = clamp(k + o, 0, K - 1);
        sum += c[kk];
        n++;
      }
      rhArr[k] = sum / n;
    }
  }
  for (let k = 0; k < K; k++) {
    const s = s0 + k * STEP;
    const u = k * STEP;
    track.sample(s, fr);
    const T = fr.T.clone();
    const R = new THREE.Vector3().crossVectors(T, up).normalize();
    const U = new THREE.Vector3().crossVectors(R, T).normalize();
    const env = smoothstep(u, 0, 430) * (1 - smoothstep(u, L - 430, L));
    const nz = fbm3(s * 0.0031 + 9, 3.3, 1.1, 3) - 0.47;
    rings.push({
      s,
      C: fr.pos.clone(),
      R,
      U,
      T,
      Rh: rhArr[k],
      Ru: lerp(76, 335, env) * (1 + 0.5 * nz * env),
      Rd: lerp(44, 395, env) * (1 + 0.4 * nz * env),
      env,
      amp: 0.03 + 0.17 * env,
    });
  }

  const sectionLocal = (r: Ring, th: number, out: [number, number]) => {
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / PW) * r.Rh;
    const y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / PW) * (sn > 0 ? r.Ru : r.Rd);
    const bx = r.C.x + r.R.x * x + r.U.x * y;
    const by = r.C.y + r.R.y * x + r.U.y * y;
    const bz = r.C.z + r.R.z * x + r.U.z * y;
    const n = clamp(noiseFactor(bx, by, bz, r.amp), 0.55, 1.5);
    out[0] = x * n;
    out[1] = y * n;
  };

  /* ---------------- shell mesh ---------------- */
  const pos = new Float32Array(K * SEG * 3);
  const nrm = new Float32Array(K * SEG * 3);
  const colr = new Float32Array(K * SEG * 3);
  const glow = new Float32Array(K * SEG * 3);
  const tmp2: [number, number] = [0, 0];
  for (let k = 0; k < K; k++) {
    const r = rings[k];
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      sectionLocal(r, th, tmp2);
      const i3 = (k * SEG + j) * 3;
      pos[i3] = r.C.x + r.R.x * tmp2[0] + r.U.x * tmp2[1];
      pos[i3 + 1] = r.C.y + r.R.y * tmp2[0] + r.U.y * tmp2[1];
      pos[i3 + 2] = r.C.z + r.R.z * tmp2[0] + r.U.z * tmp2[1];
      const nv = fbm3(pos[i3] * 0.006, pos[i3 + 1] * 0.006, pos[i3 + 2] * 0.006, 3);
      const warm = smoothstep(nv, 0.42, 0.62);
      const v = 0.62 + 1.0 * nv;
      colr[i3] = lerp(0.3, 0.42, warm) * v;
      colr[i3 + 1] = lerp(0.27, 0.3, warm) * v;
      colr[i3 + 2] = lerp(0.4, 0.3, warm) * v;
      const yRel = tmp2[1];
      glow[i3] = k / (K - 1);
      glow[i3 + 1] = smoothstep(-yRel, r.Rd * 0.5, r.Rd * 0.95) * (0.3 + 0.7 * r.env);
      glow[i3 + 2] = 0.3 + 0.7 * r.env;
    }
  }
  // normals (pointing into the cave)
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  const n3 = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  const pAt = (k: number, j: number, out: THREE.Vector3) => {
    const kk = clamp(k, 0, K - 1);
    const jj = ((j % SEG) + SEG) % SEG;
    const i3 = (kk * SEG + jj) * 3;
    return out.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
  };
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < SEG; j++) {
      pAt(k, j + 1, a3).sub(pAt(k, j - 1, b3));
      pAt(k + 1, j, c3).sub(pAt(k - 1, j, b3));
      n3.crossVectors(a3, c3).normalize();
      const i3 = (k * SEG + j) * 3;
      const inx = rings[k].C.x - pos[i3];
      const iny = rings[k].C.y - pos[i3 + 1];
      const inz = rings[k].C.z - pos[i3 + 2];
      if (n3.x * inx + n3.y * iny + n3.z * inz < 0) n3.negate();
      nrm[i3] = n3.x;
      nrm[i3 + 1] = n3.y;
      nrm[i3 + 2] = n3.z;
    }
  }
  // winding so that the inside is the front face
  let flipWinding = false;
  {
    const k = Math.floor(K / 2);
    pAt(k, 0, a3);
    pAt(k, 1, b3);
    pAt(k + 1, 0, c3);
    const e1 = b3.clone().sub(a3);
    const e2 = c3.clone().sub(a3);
    const gn = new THREE.Vector3().crossVectors(e1, e2);
    const inward = rings[k].C.clone().sub(a3);
    flipWinding = gn.dot(inward) < 0;
  }
  const CH = 16;
  for (let k0 = 0; k0 < K - 1; k0 += CH) {
    const k1 = Math.min(K - 1, k0 + CH);
    const rc = k1 - k0 + 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos.slice(k0 * SEG * 3, (k1 + 1) * SEG * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm.slice(k0 * SEG * 3, (k1 + 1) * SEG * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(colr.slice(k0 * SEG * 3, (k1 + 1) * SEG * 3), 3));
    g.setAttribute("aGlow", new THREE.BufferAttribute(glow.slice(k0 * SEG * 3, (k1 + 1) * SEG * 3), 3));
    const idx: number[] = [];
    for (let k = 0; k < rc - 1; k++) {
      for (let j = 0; j < SEG; j++) {
        const a = k * SEG + j;
        const b = k * SEG + ((j + 1) % SEG);
        const c = (k + 1) * SEG + j;
        const d = (k + 1) * SEG + ((j + 1) % SEG);
        if (!flipWinding) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, rockMat);
    group.add(mesh);
  }

  /* ---------------- containment test (for carving the terrain) ---------------- */
  let bx0 = 1e9;
  let bx1 = -1e9;
  let bz0 = 1e9;
  let bz1 = -1e9;
  let rmax = 0;
  for (const r of rings) {
    bx0 = Math.min(bx0, r.C.x);
    bx1 = Math.max(bx1, r.C.x);
    bz0 = Math.min(bz0, r.C.z);
    bz1 = Math.max(bz1, r.C.z);
    rmax = Math.max(rmax, r.Rh, r.Ru, r.Rd);
  }
  const bpad = rmax * 1.25;
  const contains = (x: number, y: number, z: number, margin = 0) => {
    if (x < bx0 - bpad || x > bx1 + bpad || z < bz0 - bpad || z > bz1 + bpad) return false;
    let bi = 0;
    let bd = 1e18;
    for (let k = 0; k < K; k++) {
      const c = rings[k].C;
      const dx = c.x - x;
      const dy = c.y - y;
      const dz = c.z - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    const r = rings[bi];
    const dx = x - r.C.x;
    const dy = y - r.C.y;
    const dz = z - r.C.z;
    const lx = dx * r.R.x + dy * r.R.y + dz * r.R.z;
    const ly = dx * r.U.x + dy * r.U.y + dz * r.U.z;
    const lz = dx * r.T.x + dy * r.T.y + dz * r.T.z;
    if ((bi === 0 && lz < -STEP) || (bi === K - 1 && lz > STEP)) return false;
    const Ry = ly > 0 ? r.Ru : r.Rd;
    const rho = Math.pow(Math.pow(Math.abs(lx) / r.Rh, PW) + Math.pow(Math.abs(ly) / Ry, PW), 1 / PW);
    const n = clamp(noiseFactor(x, y, z, r.amp), 0.55, 1.5);
    return rho < n - margin / Math.min(r.Rh, Ry);
  };

  /* ---------------- helpers ---------------- */
  const m4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const shellVertex = (k: number, j: number) => {
    const i3 = (k * SEG + j) * 3;
    return {
      p: new THREE.Vector3(pos[i3], pos[i3 + 1], pos[i3 + 2]),
      n: new THREE.Vector3(nrm[i3], nrm[i3 + 1], nrm[i3 + 2]),
    };
  };
  const palIdx = (t: number) => clamp(Math.floor(t * 4 + (rnd() - 0.5) * 1.1), 0, 3);

  /* ---------------- stalactites ---------------- */
  {
    const geo = stalactiteGeometry();
    const N = 380;
    const im = new THREE.InstancedMesh(geo, rockMat, N);
    let placed = 0;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let tries = 0; tries < N * 4 && placed < N; tries++) {
      const k = 8 + Math.floor(rnd() * (K - 16));
      if (rings[k].env < 0.3) continue;
      const j = Math.floor((0.14 + rnd() * 0.72) * (SEG / 2));
      const { p } = shellVertex(k, j);
      const len = (22 + 150 * Math.pow(rnd(), 2.2)) * (0.4 + 0.6 * rings[k].env);
      const rad = len * (0.1 + 0.1 * rnd());
      e.set((rnd() - 0.5) * 0.18, rnd() * 6.28, (rnd() - 0.5) * 0.18);
      q.setFromEuler(e);
      m4.compose(p.clone().add(new THREE.Vector3(0, 4, 0)), q, new THREE.Vector3(rad, len, rad));
      im.setMatrixAt(placed++, m4);
    }
    im.count = placed;
    im.frustumCulled = false;
    group.add(im);
  }

  /* ---------------- crystals ---------------- */
  const crystalItems: { p: THREE.Vector3; d: THREE.Vector3; len: number; rad: number }[][] = [[], [], [], []];
  const pushCluster = (p: THREE.Vector3, n: THREE.Vector3, ci: number, scale: number, count: number) => {
    for (let c = 0; c < count; c++) {
      const d = n
        .clone()
        .add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9))
        .normalize();
      const len = (14 + 60 * Math.pow(rnd(), 1.5)) * scale;
      crystalItems[ci].push({
        p: p.clone().addScaledVector(n, -3).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(14 * scale)),
        d,
        len,
        rad: clamp(len * (0.1 + rnd() * 0.07), 1.8, 4 + 6 * scale),
      });
    }
  };
  for (let c = 0; c < 85; c++) {
    const k = 6 + Math.floor(rnd() * (K - 12));
    const r = rings[k];
    if (r.env < 0.3) continue;
    const j = Math.floor(rnd() * SEG);
    const th = (j / SEG) * Math.PI * 2;
    if (Math.sin(th) < -0.82) continue;
    const { p, n } = shellVertex(k, j);
    pushCluster(p, n, palIdx(k / (K - 1)), 0.6 + 0.8 * r.env, 3 + Math.floor(rnd() * 4));
  }

  /* ---------------- floating islands ---------------- */
  const islandGeo = islandGeometry();
  const mushGeo = mushroomGeometry();
  const mushItems: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const islandM: THREE.Matrix4[] = [];
  {
    const q = new THREE.Quaternion();
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 18; tries++) {
      const k = 30 + Math.floor(rnd() * (K - 60));
      const r = rings[k];
      if (r.env < 0.75) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const lx = side * (85 + rnd() * 160);
      const ly = -170 + rnd() * 320;
      const S = 26 + rnd() * 40;
      const c = r.C.clone().addScaledVector(r.R, lx).addScaledVector(r.U, ly);
      if (!contains(c.x, c.y, c.z, S * 1.6 + 40)) continue;
      // avoid overlap with other islands
      let ok = true;
      for (const mm of islandM) {
        const op = new THREE.Vector3().setFromMatrixPosition(mm);
        const sc = new THREE.Vector3().setFromMatrixScale(mm).x;
        if (op.distanceTo(c) < (sc + S) * 1.8) ok = false;
      }
      if (!ok) continue;
      q.setFromAxisAngle(Y, rnd() * 6.28);
      const mm = new THREE.Matrix4().compose(c, q, new THREE.Vector3(S, S * (0.9 + rnd() * 0.5), S));
      islandM.push(mm);
      placed++;
      const zt = k / (K - 1);
      const ci = palIdx(zt);
      // mushrooms on top
      const mc = 4 + Math.floor(rnd() * 6);
      for (let i = 0; i < mc; i++) {
        const a = rnd() * 6.28;
        const rr = Math.sqrt(rnd()) * 0.72 * S;
        const px = Math.cos(a) * rr;
        const pz = Math.sin(a) * rr;
        const topY = 0.2 * S * Math.sqrt(Math.max(0, 1 - (rr / S) * (rr / S)));
        const ms = (5 + rnd() * 14) * (S / 45 + 0.5);
        const col = new THREE.Color(CAVE_PAL[(ci + (rnd() < 0.3 ? 1 : 0)) % 4][0], CAVE_PAL[(ci + (rnd() < 0.3 ? 1 : 0)) % 4][1], CAVE_PAL[(ci + (rnd() < 0.3 ? 1 : 0)) % 4][2]).multiplyScalar(0.45 + rnd() * 0.45);
        const mq = new THREE.Quaternion().setFromAxisAngle(Y, rnd() * 6.28);
        const wp = c.clone().add(new THREE.Vector3(px, topY - 0.02 * S, pz));
        mushItems.push({ m: new THREE.Matrix4().compose(wp, mq, new THREE.Vector3(ms, ms * (0.8 + rnd() * 1.2), ms)), c: col });
      }
      // crystal cluster on top
      const tp = c.clone().add(new THREE.Vector3((rnd() - 0.5) * S * 0.6, 0.18 * S, (rnd() - 0.5) * S * 0.6));
      pushCluster(tp, new THREE.Vector3(0, 1, 0), (ci + 2) % 4, 0.55, 3 + Math.floor(rnd() * 3));
    }
    const im = new THREE.InstancedMesh(islandGeo, rockMat, Math.max(1, islandM.length));
    islandM.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.count = islandM.length;
    im.frustumCulled = false;
    group.add(im);

    const mm = new THREE.InstancedMesh(mushGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), Math.max(1, mushItems.length));
    mushItems.forEach((it, i) => {
      mm.setMatrixAt(i, it.m);
      mm.setColorAt(i, it.c);
    });
    mm.count = mushItems.length;
    mm.frustumCulled = false;
    group.add(mm);
  }

  // build crystal instanced meshes (one per palette colour)
  {
    const geo = crystalGeometry();
    const q = new THREE.Quaternion();
    for (let ci = 0; ci < 4; ci++) {
      const items = crystalItems[ci];
      if (!items.length) continue;
      const c = new THREE.Color(CAVE_PAL[ci][0], CAVE_PAL[ci][1], CAVE_PAL[ci][2]);
      const mat = new THREE.MeshStandardMaterial({
        color: c.clone().multiplyScalar(0.2),
        emissive: c,
        emissiveIntensity: 1.25,
        roughness: 0.18,
        metalness: 0.15,
        flatShading: true,
      });
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        q.setFromUnitVectors(Y, it.d);
        m4.compose(it.p, q, new THREE.Vector3(it.rad, it.len / 3.5, it.rad));
        im.setMatrixAt(i, m4);
      });
      im.frustumCulled = false;
      group.add(im);
    }
  }

  /* ---------------- rock pillars floor→ceiling ---------------- */
  {
    const used: number[] = [];
    let made = 0;
    for (let tries = 0; tries < 200 && made < 8; tries++) {
      const k = 40 + Math.floor(rnd() * (K - 80));
      const r = rings[k];
      if (r.env < 0.8) continue;
      if (used.some((u) => Math.abs(u - k) < 14)) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const xt = side * (95 + rnd() * 0.45 * r.Rh);
      // bisect for the surface heights at lateral position xt
      const find = (upper: boolean) => {
        let lo = upper ? 0 : -Math.PI;
        let hi = upper ? Math.PI : 0;
        const o: [number, number] = [0, 0];
        for (let it = 0; it < 22; it++) {
          const mid = (lo + hi) / 2;
          sectionLocal(r, mid, o);
          // x decreases with theta across the upper half, increases across the lower half
          const tooRight = o[0] > xt;
          if (upper ? tooRight : !tooRight) lo = mid;
          else hi = mid;
        }
        sectionLocal(r, (lo + hi) / 2, o);
        return o[1];
      };
      const yTop = find(true);
      const yBot = find(false);
      if (yTop - yBot < 300) continue;
      used.push(k);
      made++;
      const H = yTop - yBot + 10;
      const axisC = r.C.clone().addScaledVector(r.R, xt).addScaledVector(r.U, (yTop + yBot) / 2 + 3);
      const basis = new THREE.Matrix4().makeBasis(r.R, r.U, new THREE.Vector3().crossVectors(r.R, r.U));
      const q = new THREE.Quaternion().setFromRotationMatrix(basis);
      const geo = pillarGeometry(made * 3.7);
      const mesh = new THREE.Mesh(geo, rockMat);
      const rad = 18 + rnd() * 16;
      mesh.position.copy(axisC);
      mesh.quaternion.copy(q);
      mesh.scale.set(rad, H, rad);
      group.add(mesh);
    }
  }

  /* ---------------- waterfalls ---------------- */
  const wfUniforms = { uTime };
  const wfMat = new THREE.ShaderMaterial({
    uniforms: wfUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float v = 1.0 - vUv.y;
        float st = n(vec2(vUv.x*18.0, v*5.0 - uTime*2.2)) * 0.6 + n(vec2(vUv.x*40.0, v*11.0 - uTime*3.4)) * 0.4;
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float fade = smoothstep(0.0, 0.04, v) * smoothstep(1.0, 0.9, v);
        float a = edge * fade * (0.18 + 0.82 * smoothstep(0.25, 0.85, st));
        vec3 col = mix(vec3(0.15, 0.6, 1.0), vec3(1.1, 1.5, 1.7), st);
        gl_FragColor = vec4(col * a * 1.25, a);
      }`,
    fog: false,
  });
  wfMat.toneMapped = true;
  {
    const plane = new THREE.PlaneGeometry(1, 1);
    const mist = glowTexture("140,210,255", 1.4);
    let made = 0;
    const usedK: number[] = [];
    for (let tries = 0; tries < 200 && made < 7; tries++) {
      const k = 30 + Math.floor(rnd() * (K - 60));
      const r = rings[k];
      if (r.env < 0.85 || usedK.some((u) => Math.abs(u - k) < 18)) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const xt = side * (r.Rh * (0.62 + rnd() * 0.16));
      const find = (upper: boolean) => {
        let lo = upper ? 0 : -Math.PI;
        let hi = upper ? Math.PI : 0;
        const o: [number, number] = [0, 0];
        for (let it = 0; it < 22; it++) {
          const mid = (lo + hi) / 2;
          sectionLocal(r, mid, o);
          const tooRight = o[0] > xt;
          if (upper ? tooRight : !tooRight) lo = mid;
          else hi = mid;
        }
        sectionLocal(r, (lo + hi) / 2, o);
        return o[1];
      };
      const yTop = find(true);
      const yBot = find(false);
      if (yTop - yBot < 250) continue;
      usedK.push(k);
      made++;
      const H = yTop - yBot - 30;
      const w = 20 + rnd() * 16;
      const center = r.C.clone().addScaledVector(r.R, xt - side * 6).addScaledVector(r.U, (yTop + yBot) / 2 - 2);
      const bas = new THREE.Matrix4().makeBasis(r.R, r.U, new THREE.Vector3().crossVectors(r.R, r.U));
      const qq = new THREE.Quaternion().setFromRotationMatrix(bas);
      for (let c = 0; c < 2; c++) {
        const m = new THREE.Mesh(plane, wfMat);
        m.position.copy(center);
        m.quaternion.copy(qq);
        if (c === 1) m.rotateY(Math.PI / 2);
        m.scale.set(w, H, 1);
        m.renderOrder = 3;
        m.frustumCulled = false;
        group.add(m);
      }
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: mist, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false })
      );
      sp.position.copy(r.C).addScaledVector(r.R, xt - side * 6).addScaledVector(r.U, yBot + 18);
      sp.scale.set(150, 80, 1);
      group.add(sp);
    }
  }

  /* ---------------- volumetric light shafts ---------------- */
  const shaftMats: THREE.ShaderMaterial[] = [];
  {
    for (let i = 0; i < 9; i++) {
      const k = 20 + Math.floor(rnd() * (K - 40));
      const r = rings[k];
      if (r.env < 0.7) continue;
      const j = Math.floor((0.18 + rnd() * 0.64) * (SEG / 2));
      const { p } = shellVertex(k, j);
      const warm = rnd() < 0.45;
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: { uCol: { value: warm ? new THREE.Color(0.9, 0.75, 0.5) : new THREE.Color(0.35, 0.8, 1.0) }, uPulse: { value: 1 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uPulse; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.7); float g = pow(vUv.y, 1.3);
            float a = f * g * 0.1 * uPulse; gl_FragColor = vec4(uCol * a, a); }`,
      });
      shaftMats.push(mat);
      const len = 280 + rnd() * 120;
      const geo = new THREE.CylinderGeometry(24 + rnd() * 18, 70 + rnd() * 40, len, 28, 1, true);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p).add(new THREE.Vector3(0, -len / 2 + 6, 0));
      m.renderOrder = 2;
      m.frustumCulled = false;
      group.add(m);
    }
  }

  /* ---------------- inner suns ---------------- */
  const orbLights: THREE.PointLight[] = [];
  const sunPositions: THREE.Vector3[] = [];
  const sunColors: THREE.Color[] = [];
  {
    const glowTex = glowTexture("255,255,255", 1.4);
    const cfgs = [
      { u: 0.13, col: [0.45, 0.9, 1.0], i: 95000, h: 0.5 },
      { u: 0.31, col: [1.0, 0.5, 0.95], i: 110000, h: 0.62 },
      { u: 0.5, col: [1.0, 0.85, 0.55], i: 150000, h: 0.7 },
      { u: 0.69, col: [0.5, 1.0, 0.7], i: 110000, h: 0.6 },
      { u: 0.87, col: [0.5, 0.75, 1.0], i: 95000, h: 0.5 },
    ];
    for (const c of cfgs) {
      const k = Math.floor(c.u * (K - 1));
      const r = rings[k];
      const pos3 = r.C.clone().addScaledVector(r.U, r.Ru * c.h);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(26, 28, 18),
        (() => {
          const mm = new THREE.MeshBasicMaterial({ fog: false });
          mm.color.setRGB(c.col[0] * 3.2, c.col[1] * 3.2, c.col[2] * 3.2);
          return mm;
        })()
      );
      core.position.copy(pos3);
      group.add(core);
      for (const [sz, op] of [
        [760, 0.14],
        [300, 0.4],
        [130, 0.9],
      ] as [number, number][]) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: op })
        );
        sp.material.color.setRGB(c.col[0] * 1.1, c.col[1] * 1.1, c.col[2] * 1.1);
        sp.position.copy(pos3);
        sp.scale.set(sz, sz, 1);
        group.add(sp);
      }
      const light = new THREE.PointLight(new THREE.Color(c.col[0], c.col[1], c.col[2]), 0, 1700, 2);
      light.position.copy(pos3);
      light.userData.base = c.i;
      group.add(light);
      orbLights.push(light);
      sunPositions.push(pos3.clone());
      sunColors.push(new THREE.Color(c.col[0], c.col[1], c.col[2]));
    }
  }

  /* ---------------- mega crystal spires on the lower walls ---------------- */
  {
    for (let c = 0; c < 22; c++) {
      const k = 14 + Math.floor(rnd() * (K - 28));
      const r = rings[k];
      if (r.env < 0.6) continue;
      const th = -Math.PI * (0.12 + 0.76 * rnd());
      const j = Math.floor(((th + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEG);
      const { p, n } = shellVertex(k, j);
      pushCluster(p, n, palIdx(k / (K - 1)), 2.6 + 1.6 * rnd(), 3 + Math.floor(rnd() * 3));
    }
  }

  /* ---------------- luminous lake far below ---------------- */
  const lakeUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime,
      uSunPos: { value: sunPositions },
      uSunCol: { value: sunColors },
      uVis: { value: 1 },
    },
  ]);
  {
    let sumY = 0;
    let cnt = 0;
    for (const r of rings) {
      if (r.env > 0.9) {
        sumY += r.C.y - r.Rd * 0.96;
        cnt++;
      }
    }
    const W = cnt ? sumY / cnt + 70 : -300;
    const rows: ({ a: THREE.Vector3; b: THREE.Vector3 } | null)[] = [];
    const o: [number, number] = [0, 0];
    for (const r of rings) {
      const yl = (W - r.C.y) / Math.max(0.5, r.U.y);
      sectionLocal(r, -Math.PI / 2, o);
      if (o[1] > yl - 6) {
        rows.push(null);
        continue;
      }
      let lo = -Math.PI;
      let hi = -Math.PI / 2;
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        sectionLocal(r, mid, o);
        if (o[1] > yl) lo = mid;
        else hi = mid;
      }
      sectionLocal(r, (lo + hi) / 2, o);
      const xl = o[0];
      lo = -Math.PI / 2;
      hi = 0;
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        sectionLocal(r, mid, o);
        if (o[1] < yl) lo = mid;
        else hi = mid;
      }
      sectionLocal(r, (lo + hi) / 2, o);
      const xr = o[0];
      const pa = r.C.clone().addScaledVector(r.R, xl - 4);
      const pb = r.C.clone().addScaledVector(r.R, xr + 4);
      pa.y = W;
      pb.y = W;
      rows.push({ a: pa, b: pb });
    }
    const lpos: number[] = [];
    const lidx: number[] = [];
    const vi: number[] = [];
    rows.forEach((row) => {
      if (!row) {
        vi.push(-1);
        return;
      }
      vi.push(lpos.length / 3);
      lpos.push(row.a.x, row.a.y, row.a.z, row.b.x, row.b.y, row.b.z);
    });
    for (let k = 0; k < rows.length - 1; k++) {
      if (vi[k] < 0 || vi[k + 1] < 0) continue;
      const A = vi[k];
      const B = vi[k] + 1;
      const C2 = vi[k + 1];
      const D = vi[k + 1] + 1;
      lidx.push(A, C2, B, B, C2, D);
    }
    if (lidx.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(lpos, 3));
      lg.setIndex(lidx);
      const lm = new THREE.ShaderMaterial({
        uniforms: lakeUniforms,
        fog: true,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec3 vW;
          #include <fog_pars_vertex>
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vW = wp.xyz;
            vec4 mvPosition = viewMatrix * wp;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `
          uniform float uTime; uniform vec3 uSunPos[5]; uniform vec3 uSunCol[5];
          varying vec3 vW;
          #include <common>
          #include <fog_pars_fragment>
          float h2(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
          float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
          float ht(vec2 p){ return n2(p*1.0+vec2(uTime*0.04,0.0))*0.55 + n2(p*2.7-vec2(0.0,uTime*0.07))*0.3 + n2(p*7.0+uTime*0.12)*0.15; }
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            vec2 p = vW.xz * 0.011;
            float e = 0.02;
            float h0 = ht(p);
            vec3 N = normalize(vec3(-(ht(p+vec2(e,0.0))-h0)*3.2, 1.0, -(ht(p+vec2(0.0,e))-h0)*3.2));
            vec3 R = reflect(-V, N);
            vec3 sky = mix(vec3(0.03,0.09,0.2), vec3(0.2,0.5,0.85), smoothstep(-0.1, 0.95, R.y));
            float F = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 3.5);
            vec3 deep = vec3(0.01, 0.07, 0.12) + vec3(0.0,0.08,0.1) * smoothstep(0.55, 0.9, n2(p*5.0 + uTime*0.1));
            vec3 col = mix(deep, sky, F);
            float pch = smoothstep(0.58, 0.82, n2(p*0.45 + 7.0));
            col += mix(vec3(0.05,0.9,0.7), vec3(0.8,0.2,1.0), n2(p*0.2)) * pch * 0.55 * (0.6 + 0.4*sin(uTime*0.8 + p.x*3.0));
            for(int i=0;i<5;i++){
              vec3 L = normalize(uSunPos[i] - vW);
              float sd = max(dot(R, L), 0.0);
              col += uSunCol[i] * (pow(sd, 260.0) * 6.0 + pow(sd, 40.0) * 0.8) * (0.35 + F);
            }
            gl_FragColor = vec4(col, 1.0);
            #include <fog_fragment>
          }`,
      });
      const lake = new THREE.Mesh(lg, lm);
      lake.frustumCulled = false;
      group.add(lake);
    }
  }

  /* ---------------- drifting light motes (depth + scale cues) ---------------- */
  const moteU = { uTime, uVis: { value: 1 } };
  const motes = (() => {
    const MN = 5600;
    const mp = new Float32Array(MN * 3);
    const mc = new Float32Array(MN * 3);
    const mph = new Float32Array(MN);
    const msz = new Float32Array(MN);
    let n = 0;
    for (let tries = 0; tries < MN * 6 && n < MN; tries++) {
      const k = 3 + Math.floor(rnd() * (K - 6));
      const r = rings[k];
      if (r.env < 0.2) continue;
      const x = (rnd() * 2 - 1) * r.Rh * 0.95;
      const y = -r.Rd * 0.85 + rnd() * (r.Ru * 0.85 + r.Rd * 0.85);
      const w = r.C.clone().addScaledVector(r.R, x).addScaledVector(r.U, y);
      if (!contains(w.x, w.y, w.z, 30)) continue;
      mp[n * 3] = w.x;
      mp[n * 3 + 1] = w.y;
      mp[n * 3 + 2] = w.z;
      const pc = CAVE_PAL[clamp(Math.floor((k / (K - 1)) * 4 + (rnd() - 0.5) * 1.6), 0, 3)];
      const br = 0.5 + rnd() * 0.9;
      mc[n * 3] = pc[0] * br;
      mc[n * 3 + 1] = pc[1] * br;
      mc[n * 3 + 2] = pc[2] * br;
      mph[n] = rnd();
      msz[n] = 0.7 + rnd() * rnd() * 3.2;
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mp.slice(0, n * 3), 3));
    g.setAttribute("aCol", new THREE.BufferAttribute(mc.slice(0, n * 3), 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(mph.slice(0, n), 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(msz.slice(0, n), 1));
    const m = new THREE.ShaderMaterial({
      uniforms: moteU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; attribute vec3 aCol; attribute float aPhase; attribute float aSize; varying vec3 vC;
        void main(){
          vec3 p = position + vec3(sin(uTime*0.25 + aPhase*6.28), cos(uTime*0.2 + aPhase*9.0), sin(uTime*0.22 + aPhase*3.0)) * 7.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * 1500.0 / max(1.0, -mv.z), 1.5, 28.0);
          vC = aCol * (0.55 + 0.45 * sin(uTime*1.4 + aPhase*20.0));
        }`,
      fragmentShader: `
        uniform float uVis; varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * 1.1, a * a * uVis * 0.8);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    group.add(pts);
    return pts;
  })();

  /* ---------------- rune rings over the road ---------------- */
  {
    const geo = new THREE.TorusGeometry(1, 0.03, 8, 64);
    const items: { s: number }[] = [];
    for (let s = s0 + 260; s < s1 - 220; s += 120) items.push({ s });
    const mat = new THREE.MeshBasicMaterial({ fog: false });
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const q = new THREE.Quaternion();
    const f = newFrame();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      track.sample(it.s, f);
      const bas = new THREE.Matrix4().makeBasis(f.R, f.N, f.T.clone().negate());
      q.setFromRotationMatrix(bas);
      const rad = f.half + 15;
      const c = f.pos.clone().addScaledVector(f.N, 12);
      m4.compose(c, q, new THREE.Vector3(rad, rad, rad));
      im.setMatrixAt(i, m4);
      const t = (it.s - s0) / L;
      const pc = CAVE_PAL[clamp(Math.floor(t * 4 + 0.5 * Math.sin(i)), 0, 3)];
      col.setRGB(pc[0] * 1.3, pc[1] * 1.3, pc[2] * 1.3);
      im.setColorAt(i, col);
    });
    im.frustumCulled = false;
    group.add(im);
    void one;
  }

  /* ---------------- portal gates ---------------- */
  {
    const metal = new THREE.MeshStandardMaterial({ color: 0x252c3c, roughness: 0.4, metalness: 0.85, envMapIntensity: 1.2 });
    const glowC = new THREE.MeshBasicMaterial();
    glowC.color.setRGB(0.2, 1.2, 2.2);
    const glowO = new THREE.MeshBasicMaterial();
    glowO.color.setRGB(2.2, 0.8, 0.12);
    const signTex = portalSignTexture("HOLLOW EARTH", "AETHER RIFT · SUBTERRANEAN SECTOR");
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: new THREE.Color(0.75, 0.75, 0.75),
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const f = newFrame();
    const gate = (s: number, ringIdx: number) => {
      track.sample(s, f);
      const bas = new THREE.Matrix4().makeBasis(f.R, f.N, f.T.clone().negate());
      const q = new THREE.Quaternion().setFromRotationMatrix(bas);
      const Wd = Math.min(rings[ringIdx].Rh * 0.62, 56);
      const topUp = 58;
      const put = (geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, castShadow = true) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(p);
        m.quaternion.copy(q);
        m.castShadow = castShadow;
        group.add(m);
        return m;
      };
      for (const sd of [-1, 1]) {
        const px = f.pos.x + f.R.x * sd * (Wd + 8);
        const pz = f.pos.z + f.R.z * sd * (Wd + 8);
        const gy = groundAt(px, pz) - 10;
        const topY = f.pos.y + topUp;
        const h = topY - gy;
        const base = new THREE.Vector3(px, gy + h / 2, pz);
        put(new THREE.BoxGeometry(16, h, 14), metal, base);
        const inner = base.clone().addScaledVector(f.R, -sd * 8.3).addScaledVector(f.T, 0);
        put(new THREE.BoxGeometry(0.8, h - 6, 1.2), sd === -1 ? glowC : glowO, inner, false);
      }
      const lc = f.pos.clone().addScaledVector(f.N, topUp - 8);
      put(new THREE.BoxGeometry(2 * (Wd + 16), 16, 14), metal, lc);
      put(new THREE.BoxGeometry(2 * Wd, 1.0, 1.2), glowC, f.pos.clone().addScaledVector(f.N, topUp - 17.2), false);
      const sw = 2 * (Wd + 8) * 0.96;
      for (const face of [-1, 1]) {
        const sp = put(new THREE.PlaneGeometry(sw, sw / 8), signMat, lc.clone().addScaledVector(f.T, face * 7.2), false);
        if (face === 1) sp.rotateY(Math.PI);
      }
    };
    gate(s0 + 16, 1);
    gate(s1 - 16, K - 2);
  }

  /* ---------------- update ---------------- */
  const update = (time: number, cf: number) => {
    uTime.value = time;
    moteU.uVis.value = cf;
    motes.visible = cf > 0.02;
    lakeUniforms.uVis.value = cf;
    const pulse = 0.85 + 0.15 * Math.sin(time * 0.7);
    for (const m of shaftMats) m.uniforms.uPulse.value = pulse * (0.35 + 0.65 * cf);
    for (const l of orbLights) l.intensity = (l.userData.base as number) * cf * (0.94 + 0.06 * Math.sin(time * 1.3 + l.position.x));
  };

  return { group, contains, update };
}
