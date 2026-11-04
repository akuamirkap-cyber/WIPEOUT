import * as THREE from "three";
import { blobShadowTexture, glowTexture, liveryTexture } from "./textures";

export interface ShipPalette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: [number, number, number]; // HDR rgb for emissive accents
  flame: [number, number, number]; // outer flame color
  number: string;
}

export const PALETTES: ShipPalette[] = [
  { name: "AETHER-01", primary: "#1c55e0", secondary: "#0d1530", accent: "#e8eef9", glow: [0.2, 1.6, 3.4], flame: [0.15, 0.55, 3.2], number: "01" },
  { name: "FEISAR", primary: "#e0262a", secondary: "#1a0c0e", accent: "#f4f4f4", glow: [3.4, 0.4, 0.3], flame: [2.8, 0.7, 0.2], number: "07" },
  { name: "AG-SYS", primary: "#e9edf3", secondary: "#1b3a8c", accent: "#2f7cff", glow: [0.4, 1.2, 3.4], flame: [0.3, 0.6, 3.0], number: "12" },
  { name: "QIREX", primary: "#16a05a", secondary: "#08201a", accent: "#e8fff3", glow: [0.4, 3.2, 1.2], flame: [0.2, 2.4, 1.0], number: "23" },
  { name: "PIRANHA", primary: "#f2800a", secondary: "#241406", accent: "#fff2dc", glow: [3.4, 1.6, 0.2], flame: [3.0, 1.1, 0.2], number: "34" },
  { name: "AURORA", primary: "#8a45e6", secondary: "#150a28", accent: "#f2e8ff", glow: [2.2, 0.6, 3.4], flame: [1.8, 0.4, 3.0], number: "48" },
  { name: "VELOX", primary: "#e8c20c", secondary: "#1c1704", accent: "#111111", glow: [3.4, 2.8, 0.3], flame: [3.0, 2.0, 0.2], number: "55" },
  { name: "NOVA", primary: "#e0488a", secondary: "#220a16", accent: "#fff0f7", glow: [3.4, 0.5, 1.8], flame: [3.0, 0.4, 1.4], number: "69" },
];

interface Section {
  z: number;
  w: number;
  h: number;
  y: number;
}

function loft(sections: Section[], seg = 28, power = 2.4, capFront = false, capBack = true) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ring = seg + 1;
  const zMin = sections[sections.length - 1].z;
  const zMax = sections[0].z;
  // sections are given from front (high z) to back (low z); build back→front so winding matches
  const secs = sections.slice().reverse();
  secs.forEach((s) => {
    for (let j = 0; j <= seg; j++) {
      const th = -Math.PI / 2 + (j / seg) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const x = s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / power);
      const y = s.h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / power) + s.y;
      pos.push(x, y, s.z);
      uv.push(j / seg, (s.z - zMin) / (zMax - zMin));
    }
  });
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const A = i * ring + j;
      const B = i * ring + j + 1;
      const C = (i + 1) * ring + j;
      const D = (i + 1) * ring + j + 1;
      idx.push(A, B, C, B, D, C);
    }
  }
  // caps
  const addCap = (si: number, front: boolean) => {
    const s = secs[si];
    const ci = pos.length / 3;
    pos.push(0, s.y, s.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < seg; j++) {
      const a = si * ring + j;
      const b = si * ring + j + 1;
      if (front) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (capBack) addCap(0, false);
  if (capFront) addCap(secs.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat horizontal plate. pts = [lateral x, forward z] */
function plate(pts: [number, number][], thick: number, bevel = 0.03) {
  const sh = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? sh.moveTo(p[0], -p[1]) : sh.lineTo(p[0], -p[1])));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thick / 2);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Vertical fin. pts = [forward z, up y], thin along x */
function fin(pts: [number, number][], thick: number, bevel = 0.02) {
  const sh = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? sh.moveTo(p[0], p[1]) : sh.lineTo(p[0], p[1])));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

const flameVert = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const flameFrag = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uOuter;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
varying vec2 vUv;
void main(){
  float a = 1.0 - vUv.y;
  float n = sin(vUv.x * 62.0 + uTime * 38.0 + uSeed - a * 26.0) * 0.5 + 0.5;
  float n2 = sin(vUv.x * 23.0 - uTime * 27.0 + a * 11.0) * 0.5 + 0.5;
  float flick = 0.62 + 0.38 * n * n2;
  float fade = pow(clamp(1.0 - a, 0.0, 1.0), 1.25);
  float core = pow(clamp(1.0 - a, 0.0, 1.0), 2.6);
  vec3 col = mix(uOuter, uCore, core) * (0.55 + uPower * 0.45);
  float alpha = fade * flick * clamp(0.15 + uPower * 0.45, 0.0, 0.7);
  gl_FragColor = vec4(col, alpha);
}`;

class Flame {
  group = new THREE.Group();
  outer: THREE.Mesh;
  inner: THREE.Mesh;
  glow: THREE.Sprite;
  uniforms: { outer: Record<string, { value: unknown }>; inner: Record<string, { value: unknown }> };
  radius: number;
  constructor(radius: number, flameColor: [number, number, number], glowTex: THREE.Texture, seed: number) {
    this.radius = radius;
    const geo = new THREE.CylinderGeometry(1, 0.05, 1, 20, 1, true);
    geo.translate(0, -0.5, 0);
    geo.rotateX(Math.PI / 2);
    const mkMat = (core: THREE.Color, outer: THREE.Color) => {
      const u = {
        uCore: { value: core },
        uOuter: { value: outer },
        uTime: { value: 0 },
        uPower: { value: 0 },
        uSeed: { value: seed },
      };
      const m = new THREE.ShaderMaterial({
        vertexShader: flameVert,
        fragmentShader: flameFrag,
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      m.toneMapped = false;
      return { m, u };
    };
    const o = mkMat(
      new THREE.Color().setRGB(flameColor[0] * 0.6 + 0.5, flameColor[1] * 0.6 + 0.5, flameColor[2] * 0.6 + 0.5),
      new THREE.Color().setRGB(flameColor[0] * 0.55, flameColor[1] * 0.55, flameColor[2] * 0.55)
    );
    const i = mkMat(new THREE.Color().setRGB(0.8, 0.9, 1.2), new THREE.Color().setRGB(0.35, 0.6, 1.2));
    this.outer = new THREE.Mesh(geo, o.m);
    this.inner = new THREE.Mesh(geo, i.m);
    this.uniforms = { outer: o.u, inner: i.u };
    this.outer.frustumCulled = false;
    this.inner.frustumCulled = false;
    const sm = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    sm.color.setRGB(flameColor[0] * 0.4 + 0.15, flameColor[1] * 0.4 + 0.15, flameColor[2] * 0.4 + 0.15);
    this.glow = new THREE.Sprite(sm);
    this.group.add(this.outer, this.inner, this.glow);
  }
  set(power: number, nitro: number, time: number) {
    // power 0..1 throttle, nitro 0..1
    const p = power * 0.4 + nitro * 0.6;
    const len = 0.45 + power * 0.7 + nitro * 2.4;
    const r = this.radius * (0.7 + power * 0.2 + nitro * 0.3);
    this.outer.scale.set(r, r, len);
    this.inner.scale.set(r * 0.5, r * 0.5, len * 0.62);
    (this.uniforms.outer.uTime as { value: number }).value = time;
    (this.uniforms.inner.uTime as { value: number }).value = time * 1.2;
    (this.uniforms.outer.uPower as { value: number }).value = p;
    (this.uniforms.inner.uPower as { value: number }).value = p;
    const gs = this.radius * (1.2 + power * 0.3 + nitro * 1.0);
    this.glow.scale.set(gs, gs, 1);
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.18 + power * 0.08 + nitro * 0.18;
  }
}

let SHARED_GLOW: THREE.Texture | null = null;
let SHARED_BLOB: THREE.Texture | null = null;

export class ShipModel {
  root = new THREE.Group(); // positioned & oriented on track basis
  model = new THREE.Group(); // local pitch/yaw/roll
  flames: Flame[] = [];
  navLeft: THREE.Mesh;
  navRight: THREE.Mesh;
  underGlow: THREE.Mesh;
  blob: THREE.Mesh;
  hover = 1.25;
  palette: ShipPalette;

  constructor(palette: ShipPalette) {
    this.palette = palette;
    if (!SHARED_GLOW) SHARED_GLOW = glowTexture("255,255,255", 2);
    if (!SHARED_BLOB) SHARED_BLOB = blobShadowTexture();

    const livery = liveryTexture(palette.primary, palette.accent, palette.number);
    const paint = new THREE.MeshPhysicalMaterial({
      map: livery,
      roughness: 0.38,
      metalness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.65,
    });
    const paint2 = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(palette.primary),
      roughness: 0.4,
      metalness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.65,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.secondary).lerp(new THREE.Color(0x0a0c12), 0.5),
      roughness: 0.38,
      metalness: 0.85,
      envMapIntensity: 1.1,
    });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.5, metalness: 0.7 });
    const white = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(palette.accent),
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x04070d,
      roughness: 0.04,
      metalness: 0.95,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
    });
    const glowMat = new THREE.MeshBasicMaterial();
    glowMat.color.setRGB(palette.glow[0] * 0.6, palette.glow[1] * 0.6, palette.glow[2] * 0.6);
    const hot = new THREE.MeshBasicMaterial();
    hot.color.setRGB(0.3, 0.55, 1.2);
    const red = new THREE.MeshBasicMaterial();
    red.color.setRGB(2.2, 0.1, 0.06);

    const m = this.model;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = m) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // ---------- Fuselage
    const fus = loft(
      [
        { z: 3.2, w: 0.03, h: 0.03, y: 0.06 },
        { z: 2.95, w: 0.14, h: 0.1, y: 0.08 },
        { z: 2.35, w: 0.3, h: 0.19, y: 0.1 },
        { z: 1.5, w: 0.46, h: 0.3, y: 0.17 },
        { z: 0.6, w: 0.58, h: 0.38, y: 0.22 },
        { z: -0.6, w: 0.62, h: 0.4, y: 0.24 },
        { z: -1.6, w: 0.58, h: 0.37, y: 0.22 },
        { z: -2.3, w: 0.46, h: 0.3, y: 0.2 },
      ],
      30,
      2.7
    );
    add(fus, paint);

    // dark belly
    const belly = loft(
      [
        { z: 2.4, w: 0.2, h: 0.04, y: -0.14 },
        { z: 1.2, w: 0.4, h: 0.08, y: -0.2 },
        { z: -1.0, w: 0.5, h: 0.09, y: -0.23 },
        { z: -2.3, w: 0.4, h: 0.07, y: -0.17 },
      ],
      18,
      2.4
    );
    add(belly, carbon);

    // canopy
    const canopyGeo = new THREE.SphereGeometry(1, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    canopyGeo.scale(0.34, 0.27, 1.05);
    const canopy = add(canopyGeo, glass);
    canopy.position.set(0, 0.52, 0.75);
    // canopy frame
    const frame = add(new THREE.TorusGeometry(0.33, 0.025, 8, 28, Math.PI), carbon);
    frame.scale.set(1, 0.85, 1);
    frame.position.set(0, 0.52, 0.55);

    // intake scoops on shoulders
    const scoopGeo = new THREE.BoxGeometry(0.24, 0.12, 0.5);
    const scoop = add(scoopGeo, carbon);
    scoop.position.set(0, 0.64, -0.7);
    scoop.rotation.x = 0.1;
    const spine = add(new THREE.BoxGeometry(0.1, 0.06, 1.5), white);
    spine.position.set(0, 0.62, -1.5);

    // ---------- Half (left side, +x)
    const half = new THREE.Group();

    // main delta wing
    const wing = add(
      plate(
        [
          [0.5, 1.15],
          [1.4, 0.2],
          [2.45, -1.05],
          [2.52, -1.5],
          [2.2, -1.78],
          [0.5, -2.1],
        ],
        0.07
      ),
      paint2,
      half
    );
    wing.position.set(0, 0.1, 0);
    wing.rotation.z = 0.05;

    // wing top trim (dark stripe)
    const trim = add(
      plate(
        [
          [0.9, 0.7],
          [2.2, -0.95],
          [2.25, -1.2],
          [0.9, -0.2],
        ],
        0.02,
        0.01
      ),
      dark,
      half
    );
    trim.position.set(0, 0.16, 0);
    trim.rotation.z = 0.05;

    // leading edge glow
    const edge = add(new THREE.BoxGeometry(0.035, 0.03, 1.95), glowMat, half);
    edge.position.set(1.42, 0.13, 0.1);
    edge.rotation.y = 0.65;
    edge.rotation.z = 0.05;
    edge.castShadow = false;

    // canards
    const canard = add(
      plate(
        [
          [0.42, 2.4],
          [1.35, 1.62],
          [1.42, 1.38],
          [0.42, 1.5],
        ],
        0.05,
        0.02
      ),
      paint2,
      half
    );
    canard.position.set(0, 0.2, 0);
    canard.rotation.z = -0.08;

    // winglet
    const winglet = add(
      fin(
        [
          [-0.7, 0],
          [-1.75, 0],
          [-2.0, 0.65],
          [-1.45, 0.72],
        ],
        0.05
      ),
      paint2,
      half
    );
    winglet.position.set(2.42, 0.12, 0);
    winglet.rotation.z = -0.22;

    // V blade (long panel)
    const blade = add(
      fin(
        [
          [2.25, 0.0],
          [2.4, 0.16],
          [-0.2, 0.95],
          [-1.9, 1.02],
          [-2.2, 0.9],
          [-1.9, 0.0],
        ],
        0.07,
        0.025
      ),
      paint,
      half
    );
    blade.position.set(0.5, 0.4, 0);
    blade.rotation.z = -0.4;
    // blade inner dark stripe
    const bladeStripe = add(
      fin(
        [
          [1.2, 0.25],
          [-0.2, 0.58],
          [-1.8, 0.62],
          [-1.95, 0.5],
          [-1.7, 0.3],
        ],
        0.085,
        0.01
      ),
      dark,
      half
    );
    bladeStripe.position.set(0.5, 0.4, 0);
    bladeStripe.rotation.z = -0.4;

    // nacelle
    const nac = add(
      loft(
        [
          { z: 0.9, w: 0.4, h: 0.4, y: 0 },
          { z: 0.55, w: 0.44, h: 0.44, y: 0 },
          { z: -1.3, w: 0.44, h: 0.44, y: 0 },
          { z: -2.2, w: 0.36, h: 0.36, y: 0 },
          { z: -2.5, w: 0.33, h: 0.33, y: 0 },
        ],
        28,
        2,
        true,
        true
      ),
      paint,
      half
    );
    nac.position.set(1.08, 0.2, 0);
    // intake
    const ring = add(new THREE.TorusGeometry(0.4, 0.06, 12, 32), white, half);
    ring.position.set(1.08, 0.2, 0.9);
    const inlet = add(new THREE.CircleGeometry(0.38, 28), carbon, half);
    inlet.position.set(1.08, 0.2, 0.93);
    const fanDisc = add(new THREE.RingGeometry(0.08, 0.3, 24, 2), dark, half);
    fanDisc.position.set(1.08, 0.2, 0.95);
    // nacelle side vents (dark louvres)
    for (let k = 0; k < 4; k++) {
      const v = add(new THREE.BoxGeometry(0.05, 0.22, 0.12), carbon, half);
      v.position.set(1.08 + 0.43, 0.22, 0.1 - k * 0.28);
      v.castShadow = false;
    }
    // nozzle
    const nozzle = add(new THREE.CylinderGeometry(0.34, 0.4, 0.28, 24, 1, true), dark, half);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(1.08, 0.2, -2.55);
    (nozzle.material as THREE.Material).side = THREE.DoubleSide;
    const nRing = add(new THREE.TorusGeometry(0.33, 0.04, 8, 28), glowMat, half);
    nRing.position.set(1.08, 0.2, -2.66);
    nRing.castShadow = false;
    const nCore = add(new THREE.CircleGeometry(0.3, 24), hot, half);
    nCore.rotation.y = Math.PI;
    nCore.position.set(1.08, 0.2, -2.6);
    nCore.castShadow = false;
    // strut
    const strut = add(new THREE.BoxGeometry(0.5, 0.16, 1.7), dark, half);
    strut.position.set(0.72, 0.16, -0.5);
    // side accent line
    const side = add(new THREE.BoxGeometry(0.02, 0.035, 2.2), glowMat, half);
    side.position.set(0.625, 0.3, -0.1);
    side.castShadow = false;
    // rear tail light
    const tl = add(new THREE.BoxGeometry(0.12, 0.05, 0.08), red, half);
    tl.position.set(0.3, 0.3, -2.3);
    tl.castShadow = false;
    // wing-tip nav light
    const nav = add(new THREE.SphereGeometry(0.05, 8, 8), glowMat, half);
    nav.position.set(2.5, 0.12, -1.4);
    nav.castShadow = false;

    const left = half;
    const right = half.clone();
    right.scale.x = -1;
    m.add(left, right);
    this.navLeft = nav;
    this.navRight = right.children[right.children.length - 1] as THREE.Mesh;

    // rear spoiler between blade tops
    const spoiler = add(
      plate(
        [
          [-0.95, 0.28],
          [0.95, 0.28],
          [0.95, -0.28],
          [-0.95, -0.28],
        ],
        0.04,
        0.015
      ),
      paint2
    );
    spoiler.position.set(0, 1.34, -2.0);
    spoiler.rotation.x = 0.06;
    const spoilerGlow = add(new THREE.BoxGeometry(1.7, 0.02, 0.025), glowMat);
    spoilerGlow.position.set(0, 1.37, -2.28);
    spoilerGlow.castShadow = false;

    // center thruster
    const cn = add(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 20, 1, true), dark);
    cn.rotation.x = Math.PI / 2;
    cn.position.set(0, 0.2, -2.36);
    (cn.material as THREE.Material).side = THREE.DoubleSide;
    const cCore = add(new THREE.CircleGeometry(0.18, 20), hot);
    cCore.rotation.y = Math.PI;
    cCore.position.set(0, 0.2, -2.42);
    cCore.castShadow = false;

    // ---------- Flames
    const fl = (x: number, y: number, z: number, r: number, seed: number) => {
      const f = new Flame(r, palette.flame, SHARED_GLOW!, seed);
      f.group.position.set(x, y, z);
      m.add(f.group);
      this.flames.push(f);
    };
    fl(1.08, 0.2, -2.66, 0.3, 0);
    fl(-1.08, 0.2, -2.66, 0.3, 1.7);
    fl(0, 0.2, -2.45, 0.16, 3.1);

    this.root.add(m);

    // under glow & contact shadow (follow track basis, not roll)
    const gm = new THREE.MeshBasicMaterial({
      map: SHARED_GLOW,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    gm.color.setRGB(palette.glow[0] * 0.3, palette.glow[1] * 0.3, palette.glow[2] * 0.3);
    this.underGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 9), gm);
    this.underGlow.rotation.x = -Math.PI / 2;
    this.underGlow.position.y = -this.hover + 0.07;
    this.root.add(this.underGlow);

    const bm = new THREE.MeshBasicMaterial({
      map: SHARED_BLOB,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7.2), bm);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = -this.hover + 0.05;
    this.root.add(this.blob);
  }

  updateFlames(throttle: number, nitro: number, time: number) {
    for (const f of this.flames) f.set(throttle, nitro, time);
    const k = 0.35 + throttle * 0.5 + nitro * 1.2;
    (this.underGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k);
  }
}
