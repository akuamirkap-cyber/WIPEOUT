import * as THREE from 'three';

export type ShipStyle = 'aerovoid' | 'velocity';

export interface Team {
  name: string;
  primary: number;
  secondary: number;
  accent?: number;
  glow: number;
}

export const TEAMS: Team[] = [
  { name: 'AURORA', primary: 0x1f6fe0, secondary: 0xffd21a, accent: 0xf2f6fc, glow: 0x3fd0ff },
  { name: 'VANTA', primary: 0x20242a, secondary: 0xff3b30, accent: 0xe8edf2, glow: 0xff4a3a },
  { name: 'KORIN', primary: 0xe8edf2, secondary: 0x14d6b0, accent: 0x1e2633, glow: 0x2affd4 },
  { name: 'SOLARIS', primary: 0xff7a1a, secondary: 0x1b1f2a, accent: 0xffe14a, glow: 0xffa640 },
  { name: 'NOVA', primary: 0x7b3ff0, secondary: 0xff4fd8, accent: 0xffd400, glow: 0xc07bff },
  { name: 'VERDANT', primary: 0x2fa84f, secondary: 0xf2f6f0, accent: 0xffe600, glow: 0x6dff8a },
  { name: 'CRIMSON', primary: 0xc4262e, secondary: 0xf4f4f4, accent: 0xffb800, glow: 0xff6a6a },
  { name: 'STRATUS', primary: 0x8a97a6, secondary: 0x2b6bff, accent: 0xff3b3b, glow: 0x6fb5ff },
];

const flameVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const flameFrag = /* glsl */ `
uniform float uTime;
uniform float uBoost;
uniform float uPower;
uniform vec3 uGlow;
uniform float uCore;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  float t = vUv.y;
  float fall = pow(clamp(1.0 - t, 0.0, 1.0), 1.4);
  float n = 0.78 + 0.22 * sin(uTime * 70.0 - t * 28.0 + vUv.x * 40.0);
  n *= 0.85 + 0.15 * sin(uTime * 41.0 + t * 11.0);
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.1);
  vec3 cold = mix(uGlow, vec3(0.55,0.85,1.0), 0.35);
  vec3 hot = mix(vec3(1.0,0.28,0.05), vec3(1.0,0.75,0.25), uCore);
  vec3 col = mix(cold, hot, uBoost);
  col = mix(col, vec3(1.0,0.95,0.85), uCore * (1.0 - t) * 0.8);
  float a = f * fall * n * uPower;
  gl_FragColor = vec4(col * (1.25 + uBoost * 0.85), a);
}`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _glowTex: THREE.Texture | null = null;
const getGlowTex = () => (_glowTex ??= glowTexture());

export interface Ship {
  group: THREE.Group;
  setFlame(power: number, boost: number, time: number): void;
  setAirbrake?(left: number, right: number, dt: number): void;
  nozzles: THREE.Vector3[];
  nozzleScales: number[];
  glowColor: THREE.Color;
}

/* ---------------------------------------------------------------- geometry helpers */

interface Ring {
  z: number;
  w: number;
  h: number;
  cy: number;
}

/** smooth lofted body: elliptical rings swept along +Z, capped at both ends */
function loft(rings: Ring[], radial = 32): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const x = Math.cos(a) * r.w;
      const y = r.cy + Math.sin(a) * r.h;
      pos.push(x, y, r.z);
      // analytic normal for an ellipse of revolution
      const nx = Math.cos(a) / Math.max(r.w, 1e-4);
      const ny = Math.sin(a) / Math.max(r.h, 1e-4);
      const l = Math.hypot(nx, ny) || 1;
      nor.push(nx / l, ny / l, 0);
      uv.push(j / radial, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // caps
  const cap = (i: number, front: boolean) => {
    const c = pos.length / 3;
    const r = rings[i];
    pos.push(0, r.cy, r.z);
    nor.push(0, 0, front ? -1 : 1);
    uv.push(0.5, front ? 0 : 1);
    const base = i * (radial + 1);
    for (let j = 0; j < radial; j++) {
      if (front) idx.push(c, base + j + 1, base + j);
      else idx.push(c, base + j, base + j + 1);
    }
  };
  cap(0, true);
  cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** flat planform extruded upward (shape x = lateral, shape y = -forwardZ) */
function plate(shape: THREE.Shape, thick = 0.12, bevel = 0.035) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** vertical fin: shape x = forwardZ, shape y = height, thickness along lateral */
function fin(f: THREE.Shape, thick = 0.05) {
  const g = new THREE.ExtrudeGeometry(f, { depth: thick, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);
  g.translate(thick / 2, 0, 0);
  return g;
}

/** Velocity ship planform extrusion helper (from Velocity Ship.tsx) */
function extrudeVelocityShape(pts: [number, number][], depth: number, bevel: number, mirror = true) {
  const s = new THREE.Shape();
  const all: [number, number][] = [...pts];
  if (mirror) {
    for (let i = pts.length - 2; i > 0; i--) all.push([-pts[i][0], pts[i][1]]);
  }
  s.moveTo(all[0][0], all[0][1]);
  for (let i = 1; i < all.length; i++) s.lineTo(all[i][0], all[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 4,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2); // shape +y -> local -z (Velocity forward), extrude depth -> +y
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------- Aerovoid NOS builder */

interface AerovoidNozzleDef {
  flamePos: THREE.Vector3;
  spritePos?: THREE.Vector3;
  widthBase: number;
  lengthBase: number;
  spriteBase: number;
}

function attachAerovoidNos(
  group: THREE.Group,
  glowCol: THREE.Color,
  defs: AerovoidNozzleDef[],
  onBoostUpdate?: (power: number, boost: number, time: number) => void
) {
  const flameGeo = new THREE.ConeGeometry(0.3, 1, 18, 1, true);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.5);

  const mkFlame = (core: number) =>
    new THREE.ShaderMaterial({
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uBoost: { value: 0 },
        uPower: { value: 0 },
        uCore: { value: core },
        uGlow: { value: glowCol.clone() },
      },
    });

  const flames: { outer: THREE.Mesh; inner: THREE.Mesh; widthBase: number; lengthBase: number }[] = [];
  const glowSprites: { sprite: THREE.Sprite; spriteBase: number }[] = [];

  defs.forEach((d) => {
    const outer = new THREE.Mesh(flameGeo, mkFlame(0));
    outer.position.copy(d.flamePos);
    outer.frustumCulled = false;
    outer.renderOrder = 5;
    const inner = new THREE.Mesh(flameGeo, mkFlame(1));
    inner.position.copy(d.flamePos);
    inner.frustumCulled = false;
    inner.renderOrder = 6;
    group.add(outer, inner);
    flames.push({ outer, inner, widthBase: d.widthBase, lengthBase: d.lengthBase });

    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTex(),
        color: glowCol.clone(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      })
    );
    sp.position.copy(d.spritePos ?? d.flamePos);
    group.add(sp);
    glowSprites.push({ sprite: sp, spriteBase: d.spriteBase });
  });

  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 6.8),
    new THREE.MeshBasicMaterial({
      map: getGlowTex(),
      color: glowCol.clone(),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, -0.62, -0.2);
  under.renderOrder = 3;
  group.add(under);

  const tmpC = new THREE.Color();
  const hotCol = new THREE.Color(1, 0.35, 0.08);

  return (power: number, boost: number, time: number) => {
    flames.forEach((f, i) => {
      const flick = 0.92 + 0.08 * Math.sin(time * 55 + i * 2);
      // Keep the exhaust behind the ship but short of the chase camera, even under full NOS.
      const len = (1.7 + power * 2.5 + boost * 5.2) * f.lengthBase * flick;
      const wid = (0.7 + power * 0.3 + boost * 0.5) * f.widthBase;
      f.outer.scale.set(wid, wid, len);
      f.inner.scale.set(wid * 0.5, wid * 0.5, len * 0.62);
      for (const m of [f.outer, f.inner]) {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = time;
        u.uBoost.value = boost;
        u.uPower.value = 0.35 + power * 0.65;
      }
    });
    glowSprites.forEach(({ sprite, spriteBase }) => {
      const sc = (0.5 + power * 0.35 + boost * 2.6) * spriteBase;
      sprite.scale.set(sc, sc, 1);
      tmpC.copy(glowCol).lerp(hotCol, boost);
      (sprite.material as THREE.SpriteMaterial).color.copy(tmpC).multiplyScalar(0.4 + boost * 0.45);
    });
    (under.material as THREE.MeshBasicMaterial).opacity = 0.045 + power * 0.07 + boost * 0.2;
    onBoostUpdate?.(power, boost, time);
  };
}

// Shared linear micro-surface texture: subtle paint grain without changing team colors.
let paintSurface: THREE.CanvasTexture | null = null;
function getPaintSurface(): THREE.CanvasTexture {
  if (paintSurface) return paintSurface;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(128, 128);
  let seed = 4127;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 220 + (seed >>> 28);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  paintSurface = new THREE.CanvasTexture(canvas);
  paintSurface.wrapS = paintSurface.wrapT = THREE.RepeatWrapping;
  paintSurface.repeat.set(2, 2);
  return paintSurface;
}

/* ---------------------------------------------------------------- Aerovoid ship */

function createAerovoidShip(team: Team): Ship {
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({
    color: team.primary,
    metalness: 0.3,
    roughness: 0.38,
    roughnessMap: getPaintSurface(),
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.65,
  });
  const accent = new THREE.MeshPhysicalMaterial({
    color: team.secondary,
    metalness: 0.3,
    roughness: 0.4,
    roughnessMap: getPaintSurface(),
    clearcoat: 0.8,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.65,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c1016, metalness: 0.88, roughness: 0.26, envMapIntensity: 1.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd8e2, metalness: 1, roughness: 0.1, envMapIntensity: 1.9 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x05080d,
    metalness: 0.55,
    roughness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.4,
  });
  const glowCol = new THREE.Color(team.glow);
  const glowBasic = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.35), toneMapped: false });
  const whiteBasic = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.85, 2.0), toneMapped: false });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  /* ---- hull: clean teardrop with raised spine ---- */
  const hull = loft(
    [
      { z: 4.45, w: 0.04, h: 0.03, cy: 0.0 },
      { z: 4.0, w: 0.2, h: 0.11, cy: 0.0 },
      { z: 3.35, w: 0.4, h: 0.21, cy: 0.02 },
      { z: 2.5, w: 0.56, h: 0.3, cy: 0.04 },
      { z: 1.5, w: 0.66, h: 0.36, cy: 0.06 },
      { z: 0.3, w: 0.7, h: 0.39, cy: 0.07 },
      { z: -1.0, w: 0.62, h: 0.35, cy: 0.06 },
      { z: -2.2, w: 0.5, h: 0.29, cy: 0.05 },
      { z: -2.95, w: 0.36, h: 0.2, cy: 0.03 },
      { z: -3.25, w: 0.16, h: 0.09, cy: 0.02 },
    ],
    36
  );
  add(hull, body);

  // dark underbelly plate
  const belly = loft(
    [
      { z: 3.5, w: 0.22, h: 0.06, cy: -0.16 },
      { z: 2.5, w: 0.5, h: 0.1, cy: -0.24 },
      { z: 1.0, w: 0.58, h: 0.11, cy: -0.27 },
      { z: -1.2, w: 0.5, h: 0.1, cy: -0.24 },
      { z: -2.7, w: 0.3, h: 0.07, cy: -0.16 },
    ],
    24
  );
  add(belly, dark);

  // canopy
  const canopy = loft(
    [
      { z: 2.0, w: 0.16, h: 0.05, cy: 0.34 },
      { z: 1.35, w: 0.3, h: 0.15, cy: 0.42 },
      { z: 0.5, w: 0.35, h: 0.18, cy: 0.45 },
      { z: -0.35, w: 0.29, h: 0.14, cy: 0.38 },
      { z: -1.0, w: 0.16, h: 0.05, cy: 0.26 },
    ],
    28
  );
  add(canopy, glass, 0, 0, 0, false);
  // canopy base trim
  const trim = add(new THREE.TorusGeometry(0.36, 0.02, 6, 40), dark, 0, 0.42, 0.45, false);
  trim.scale.set(1, 1, 2.6);
  trim.rotation.x = Math.PI / 2;

  // dorsal spine (team accent)
  add(
    loft(
      [
        { z: 1.1, w: 0.1, h: 0.04, cy: 0.45 },
        { z: 0.2, w: 0.12, h: 0.05, cy: 0.48 },
        { z: -1.4, w: 0.1, h: 0.04, cy: 0.42 },
        { z: -2.6, w: 0.06, h: 0.03, cy: 0.28 },
      ],
      12
    ),
    accent,
    0,
    0,
    0,
    false
  );

  /* ---- wings ---- */
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.42, -1.9);
  wingShape.bezierCurveTo(1.5, -1.8, 2.25, -1.14, 2.66, -0.26);
  wingShape.lineTo(2.66, 0.46);
  wingShape.bezierCurveTo(2.05, 0.62, 1.25, 1.28, 0.42, 2.2);
  wingShape.closePath();
  const wingGeo = plate(wingShape, 0.11, 0.035);

  const stripe = new THREE.Shape();
  stripe.moveTo(0.54, -1.78);
  stripe.bezierCurveTo(1.55, -1.68, 2.22, -1.06, 2.6, -0.28);
  stripe.lineTo(2.6, 0.06);
  stripe.bezierCurveTo(2.05, -0.62, 1.5, -1.2, 0.68, -1.42);
  stripe.closePath();
  const stripeGeo = plate(stripe, 0.02, 0.008);

  const tipFin = new THREE.Shape();
  tipFin.moveTo(0.75, 0);
  tipFin.lineTo(-1.15, 0);
  tipFin.lineTo(-1.75, 0.72);
  tipFin.lineTo(-1.35, 0.78);
  tipFin.lineTo(0.55, 0.16);
  tipFin.closePath();
  const tipFinGeo = fin(tipFin, 0.05);

  for (const sx of [1, -1]) {
    const w = add(wingGeo, body);
    w.scale.x = sx;
    w.position.y = -0.12;
    const s = add(stripeGeo, accent, 0, 0.04, 0);
    s.scale.x = sx;
    s.position.y = 0.0;
    const tf = add(tipFinGeo, accent, sx * 2.58, -0.04, 0.3);
    tf.scale.setScalar(0.86);
    tf.scale.x = sx * 0.86;
    tf.rotation.z = -sx * 0.28;
    // wing tip light
    add(new THREE.BoxGeometry(0.05, 0.03, 0.45), glowBasic, sx * 2.64, 0.0, 0.16, false);
    // leading-edge light strip
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.012, 0.03), glowBasic);
    leg.position.set(0, 0.03, 0);
    leg.rotation.y = sx * 0.72;
    leg.position.z = 0.35;
    leg.position.x = sx * 1.45;
    leg.scale.x = 0.7;
    group.add(leg);
  }

  /* ---- engine nacelles ---- */
  const nozzles: THREE.Vector3[] = [];
  const nacelleGeo = loft(
    [
      { z: 2.7, w: 0.07, h: 0.06, cy: 0 },
      { z: 2.3, w: 0.26, h: 0.23, cy: 0 },
      { z: 1.7, w: 0.36, h: 0.32, cy: 0 },
      { z: 0.6, w: 0.4, h: 0.35, cy: 0 },
      { z: -0.8, w: 0.38, h: 0.33, cy: 0 },
      { z: -2.0, w: 0.32, h: 0.28, cy: 0 },
      { z: -2.65, w: 0.27, h: 0.24, cy: 0 },
    ],
    28
  );
  const intakeGeo = new THREE.TorusGeometry(0.28, 0.045, 10, 32);
  const nozzleGeo = new THREE.CircleGeometry(0.24, 24);
  nozzleGeo.rotateY(Math.PI);
  const innerNozzle = new THREE.CircleGeometry(0.09, 20);
  innerNozzle.rotateY(Math.PI);
  for (const sx of [1, -1]) {
    const x = sx * 1.32;
    add(nacelleGeo, body, x, -0.02, 0).scale.set(0.86, 0.86, 1);
    add(intakeGeo, chrome, x, -0.02, 2.28, false).scale.setScalar(0.86);
    add(new THREE.CircleGeometry(0.26, 24), dark, x, -0.02, 2.28, false).scale.setScalar(0.86);
    add(new THREE.CircleGeometry(0.2, 24), glowBasic, x, -0.02, 2.3, false).scale.setScalar(0.7);
    add(nozzleGeo, dark, x, -0.02, -2.66, false).scale.setScalar(0.86);
    add(innerNozzle, glowBasic, x, -0.02, -2.67, false).scale.setScalar(0.6);
    add(new THREE.BoxGeometry(0.12, 0.02, 2.0), accent, x, 0.27, -0.3, false);
    add(new THREE.BoxGeometry(0.1, 0.025, 1.3), glowBasic, x, -0.33, -0.6, false);
    nozzles.push(new THREE.Vector3(x, -0.02, -2.8));
  }
  // centre thruster
  add(
    loft(
      [
        { z: 0.3, w: 0.16, h: 0.14, cy: -0.05 },
        { z: -0.6, w: 0.2, h: 0.17, cy: -0.05 },
        { z: -2.5, w: 0.17, h: 0.15, cy: -0.05 },
      ],
      18
    ),
    dark,
    0,
    0,
    0
  );
  add(new THREE.CircleGeometry(0.1, 20).rotateY(Math.PI), glowBasic, 0, -0.05, -2.52, false).scale.setScalar(0.7);
  nozzles.push(new THREE.Vector3(0, -0.05, -2.6));

  /* ---- tail fins ---- */
  const finShape = new THREE.Shape();
  finShape.moveTo(1.3, 0);
  finShape.lineTo(-1.4, 0);
  finShape.lineTo(-2.0, 1.05);
  finShape.lineTo(-1.55, 1.1);
  finShape.lineTo(0.9, 0.24);
  finShape.closePath();
  const finGeo = fin(finShape, 0.05);
  for (const sx of [1, -1]) {
    const f = add(finGeo, body, sx * 0.42, 0.18, 0);
    f.scale.x = sx;
    f.rotation.z = -sx * 0.26;
    add(new THREE.BoxGeometry(0.04, 0.05, 0.5), glowBasic, sx * 0.72, 1.18, 2.5, false).rotation.z = -sx * 0.26;
  }
  // centre dorsal fin
  const dfin = add(finGeo, accent, 0, 0.26, -0.2);
  dfin.scale.set(0.6, 0.72, 0.72);

  /* ---- details ---- */
  // side intakes
  for (const sx of [1, -1]) {
    const intake = add(new THREE.SphereGeometry(0.2, 16, 12), dark, sx * 0.5, 0.12, 1.05, false);
    intake.scale.set(0.7, 0.55, 1.9);
    add(new THREE.BoxGeometry(0.03, 0.05, 0.5), glowBasic, sx * 0.58, 0.2, 0.95, false);
  }
  // nose light + sensors
  add(new THREE.BoxGeometry(0.34, 0.035, 0.05), whiteBasic, 0, 0.12, 3.94, false);
  add(new THREE.BoxGeometry(0.08, 0.02, 0.3), accent, 0, 0.2, 3.5, false);
  add(new THREE.SphereGeometry(0.05, 10, 8), glowBasic, 0, 0.16, 3.98, false);

  /* ---- Aerovoid NOS flames ---- */
  const setFlame = attachAerovoidNos(
    group,
    glowCol,
    nozzles.map((n, i) => {
      const base = i === 2 ? 0.8 : 1;
      return {
        flamePos: n,
        widthBase: base,
        lengthBase: base,
        spriteBase: 1,
      };
    })
  );

  return { group, setFlame, nozzles: nozzles.slice(0, 2), nozzleScales: [1, 1], glowColor: glowCol };
}

/* ---------------------------------------------------------------- Velocity ship body + Aerovoid NOS */

function createVelocityShip(team: Team): Ship {
  const group = new THREE.Group();

  // Velocity's ship faces -Z with hull base slightly higher; rotate 180 deg around Y so +Z is forward in Aerovoid
  const DY = -0.22;
  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.y = Math.PI;
  bodyGroup.position.y = DY;
  group.add(bodyGroup);

  const glowCol = new THREE.Color(team.glow);
  const paint = (c: number) =>
    new THREE.MeshPhysicalMaterial({
      color: c,
      metalness: 0.34,
      roughness: 0.34,
      roughnessMap: getPaintSurface(),
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.65,
    });

  // Map Aerovoid team palette onto Velocity's 3-tone Wipeout chassis
  const mats = {
    primary: paint(team.primary),
    secondary: paint(team.primary),
    accent: paint(team.secondary),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.72, roughness: 0.42, roughnessMap: getPaintSurface(), envMapIntensity: 1.0 }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x9aa2ad,
      metalness: 0.95,
      roughness: 0.24,
      envMapIntensity: 1.8,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0b1626,
      metalness: 0.35,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.2,
    }),
    glow: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.6), toneMapped: false }),
    nozzleGlow: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.75), toneMapped: false }),
    ringGlow: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.4), toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(1.8), toneMapped: false }),
  };

  // Exact procedural hull geometries from Velocity (components/Ship.tsx)
  const gHull = extrudeVelocityShape(
    [
      [0, 4.1],
      [0.18, 3.5],
      [0.42, 2.0],
      [0.7, 0.4],
      [0.86, -1.2],
      [0.82, -2.4],
      [0.52, -2.85],
      [0, -2.9],
    ],
    0.4,
    0.16
  );
  const gHullTop = extrudeVelocityShape(
    [
      [0, 2.4],
      [0.24, 1.4],
      [0.42, -0.2],
      [0.44, -1.8],
      [0.26, -2.4],
      [0, -2.45],
    ],
    0.2,
    0.11
  );
  const gProng = extrudeVelocityShape(
    [
      [0, 4.4],
      [0.16, 4.1],
      [0.28, 2.8],
      [0.34, 0.4],
      [0.32, -1.5],
      [0.18, -2.1],
      [0, -2.15],
    ],
    0.3,
    0.1
  );
  const gWing = extrudeVelocityShape(
    [
      [0, 1.0],
      [1.95, 0.3],
      [1.95, -0.7],
      [0, -1.1],
    ],
    0.07,
    0.035
  );
  const gRearWing = extrudeVelocityShape(
    [
      [0, 0.5],
      [2.5, -0.25],
      [2.5, -0.7],
      [0, -0.85],
    ],
    0.06,
    0.035
  );
  const gFin = (() => {
    const f = extrudeVelocityShape(
      [
        [0, 1.1],
        [1.0, -0.15],
        [1.0, -0.6],
        [0, -0.6],
      ],
      0.05,
      0.02,
      false
    );
    f.rotateZ(Math.PI / 2);
    return f;
  })();
  const gAirbrake = new THREE.BoxGeometry(0.55, 0.08, 0.7);
  const gNozzle = new THREE.CylinderGeometry(0.46, 0.56, 0.7, 24, 1, true);
  const gNozzleInner = new THREE.CylinderGeometry(0.34, 0.42, 0.5, 24);
  const gSmallNozzle = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 16);
  const gCanopy = new THREE.SphereGeometry(1, 24, 16);
  const gIntake = new THREE.BoxGeometry(0.3, 0.28, 1.2);
  const gNoseStripe = new THREE.BoxGeometry(0.2, 0.05, 2.0);
  const gProngStripe = new THREE.BoxGeometry(0.14, 0.04, 3.2);
  const gTipLight = new THREE.SphereGeometry(0.07, 8, 8);
  const gSmallDisc = new THREE.CircleGeometry(0.14, 16);
  const gTailLight = new THREE.BoxGeometry(0.08, 0.06, 0.04);

  const addTo = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    cast = true
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Main hull & top deck
  addTo(bodyGroup, gHull, mats.primary, 0, 0.05, 0);
  addTo(bodyGroup, gHullTop, mats.secondary, 0, 0.48, 0.1);

  // Cockpit canopy
  const canopyGlass = addTo(bodyGroup, gCanopy, mats.glass, 0, 0.7, -0.75, false);
  canopyGlass.scale.set(0.32, 0.27, 1.35);
  const canopyFrame = addTo(bodyGroup, gCanopy, mats.dark, 0, 0.64, -0.75, false);
  canopyFrame.scale.set(0.36, 0.23, 1.42);

  // Nose accent stripe
  addTo(bodyGroup, gNoseStripe, mats.accent, 0, 0.5, -2.8);

  // Side intakes
  addTo(bodyGroup, gIntake, mats.dark, 0.7, 0.3, 0.6);
  addTo(bodyGroup, gIntake, mats.dark, -0.7, 0.3, 0.6);

  // Wings connecting hull to prongs
  addTo(bodyGroup, gWing, mats.secondary, 0, 0.2, -0.3);
  const wingMirrored = addTo(bodyGroup, gWing, mats.secondary, 0, 0.2, -0.3);
  wingMirrored.scale.set(-1, 1, 1);

  // Twin prongs (outriggers) with small rear exhaust nozzles & airbrake flaps
  let abL: THREE.Mesh | null = null;
  let abR: THREE.Mesh | null = null;
  for (const side of [-1, 1]) {
    const prongGroup = new THREE.Group();
    prongGroup.position.set(side * 1.78, 0.12, 0);
    bodyGroup.add(prongGroup);

    addTo(prongGroup, gProng, mats.primary);
    addTo(prongGroup, gProngStripe, mats.accent, 0, 0.44, 0.6);
    addTo(prongGroup, gTipLight, mats.glow, 0, 0.18, -4.3, false);

    // Prong rear exhaust pipe (knalpot samping Velocity)
    const sn = addTo(prongGroup, gSmallNozzle, mats.dark, 0, 0.18, 2.2, false);
    sn.rotation.x = Math.PI / 2;
    addTo(prongGroup, gSmallDisc, mats.nozzleGlow, 0, 0.18, 2.32, false);

    // Tail light
    addTo(prongGroup, gTailLight, mats.red, side * 0.28, 0.2, 2.15, false);

    // Airbrake flap
    const flap = addTo(prongGroup, gAirbrake, mats.secondary, side * 0.5, 0.34, 1.4);
    if (side < 0) abL = flap;
    else abR = flap;
  }

  // Rear wings & vertical dorsal fin
  addTo(bodyGroup, gRearWing, mats.primary, 0, 0.52, 1.9);
  const rearWingMirrored = addTo(bodyGroup, gRearWing, mats.primary, 0, 0.52, 1.9);
  rearWingMirrored.scale.set(-1, 1, 1);
  addTo(bodyGroup, gFin, mats.accent, 0, 0.68, 1.8);

  // Central main jet engine housing & nozzle (knalpot utama Velocity)
  const engineGroup = new THREE.Group();
  engineGroup.position.set(0, 0.4, 2.8);
  bodyGroup.add(engineGroup);

  const mainNozzle = addTo(engineGroup, gNozzle, mats.metal, 0, 0, 0);
  mainNozzle.rotation.x = Math.PI / 2;
  const innerNozzle = addTo(engineGroup, gNozzleInner, mats.dark, 0, 0, -0.05, false);
  innerNozzle.rotation.x = Math.PI / 2;
  addTo(engineGroup, new THREE.CircleGeometry(0.34, 24), mats.nozzleGlow, 0, 0, 0.2, false);
  addTo(engineGroup, new THREE.RingGeometry(0.1, 0.16, 16), mats.dark, 0, 0, 0.21, false);
  addTo(engineGroup, new THREE.TorusGeometry(0.47, 0.04, 10, 32), mats.ringGlow, 0, 0, 0.33, false);

  // Broad dark rear fascia visually connects the three engines in chase view.
  // Keep the exhaust mouths open and all NOS attachment points untouched.
  for (const side of [-1, 1]) {
    const rearDeck = addTo(bodyGroup, new THREE.BoxGeometry(1.05, 0.13, 0.62), mats.primary, side * 1.15, 0.38, 2.05);
    rearDeck.rotation.y = side * 0.16;
    const insert = addTo(bodyGroup, new THREE.BoxGeometry(0.92, 0.18, 0.12), mats.dark, side * 1.15, 0.27, 2.38);
    insert.rotation.y = side * 0.1;
    const tail = addTo(bodyGroup, new THREE.BoxGeometry(0.62, 0.045, 0.035), mats.red, side * 1.2, 0.4, 2.46, false);
    tail.rotation.y = side * 0.1;
    const fin = addTo(bodyGroup, new THREE.BoxGeometry(0.08, 0.3, 0.7), mats.accent, side * 2.18, 0.52, 1.95);
    fin.rotation.x = -0.2;
  }

  // Sculpted rear diffuser and clean symmetric trim frame the three exhausts
  // without moving or replacing Aerovoid's independently positioned NOS.
  const diffuser = addTo(bodyGroup, new THREE.BoxGeometry(1.38, 0.16, 0.66), mats.dark, 0, -0.06, 2.5);
  diffuser.rotation.x = -0.08;
  for (const side of [-1, 1]) {
    const shoulder = addTo(bodyGroup, new THREE.BoxGeometry(0.55, 0.12, 0.62), mats.primary, side * 0.7, 0.32, 2.45);
    shoulder.rotation.y = side * 0.18;
    const blade = addTo(bodyGroup, new THREE.BoxGeometry(0.07, 0.25, 0.6), mats.metal, side * 0.62, -0.1, 2.54);
    blade.rotation.x = -0.12;
    const wingTrim = addTo(bodyGroup, new THREE.BoxGeometry(0.75, 0.035, 0.11), mats.accent, side * 1.22, 0.61, 2.38, false);
    wingTrim.rotation.y = side * 0.16;
    // Narrow non-emissive bezels make the side engines legible in chase view.
    const bezel = addTo(bodyGroup, new THREE.TorusGeometry(0.2, 0.025, 8, 24), mats.metal, side * 1.78, 0.3, 2.34, false);
    bezel.scale.set(1, 1, 0.7);
  }

  // Underside hover emitters
  [-1.85, 0, 1.85].forEach((x, i) => {
    const em = addTo(
      bodyGroup,
      new THREE.CircleGeometry(i === 1 ? 0.22 : 0.14, 16),
      mats.glow,
      x,
      i === 1 ? -0.12 : -0.05,
      i === 1 ? -1.0 : -0.2,
      false
    );
    em.rotation.x = Math.PI / 2;
  });

  // ---- Aerovoid NOS & trails aligned precisely to Velocity's 3 exhaust nozzles ----
  // Velocity local (vx, vy, vz) maps to Aerovoid ship space (-vx, vy + DY, -vz):
  //   1. Main central jet pipe: (0, 0.4 + DY, -3.06) = (0, 0.18, -3.06), exit lip at z = -3.15
  //   2. Left prong pipe:       (+1.78, 0.30 + DY, -2.33) = (+1.78, 0.08, -2.33)
  //   3. Right prong pipe:      (-1.78, 0.30 + DY, -2.33) = (-1.78, 0.08, -2.33)
  const mainY = 0.4 + DY;
  const prongY = 0.3 + DY;
  const hotNozzle = new THREE.Color(1, 0.42, 0.12);
  const tmpNozzleCol = new THREE.Color();

  const setFlame = attachAerovoidNos(
    group,
    glowCol,
    [
      {
        flamePos: new THREE.Vector3(0, mainY, -3.06),
        spritePos: new THREE.Vector3(0, mainY, -3.14),
        widthBase: 1.38,
        lengthBase: 1.05,
        spriteBase: 1.28,
      },
      {
        flamePos: new THREE.Vector3(1.78, prongY, -2.33),
        spritePos: new THREE.Vector3(1.78, prongY, -2.36),
        widthBase: 0.54,
        lengthBase: 0.64,
        spriteBase: 0.56,
      },
      {
        flamePos: new THREE.Vector3(-1.78, prongY, -2.33),
        spritePos: new THREE.Vector3(-1.78, prongY, -2.36),
        widthBase: 0.54,
        lengthBase: 0.64,
        spriteBase: 0.56,
      },
    ],
    (power, boost) => {
      // Sync inner exhaust nozzle glow & afterburner rim color with Aerovoid's NOS heat
      tmpNozzleCol.copy(glowCol).lerp(hotNozzle, boost);
      mats.nozzleGlow.color.copy(tmpNozzleCol).multiplyScalar(1.35 + power * 0.35 + boost * 1.1);
      mats.ringGlow.color.copy(tmpNozzleCol).multiplyScalar(0.95 + power * 0.35 + boost * 1.65);
    }
  );

  const setAirbrake = (left: number, right: number, dt: number) => {
    const k = Math.min(1, dt * 10);
    if (abL) abL.rotation.x += (-left * 0.9 - abL.rotation.x) * k;
    if (abR) abR.rotation.x += (-right * 0.9 - abR.rotation.x) * k;
  };

  const trailNozzles = [
    new THREE.Vector3(0, mainY, -3.16),
    new THREE.Vector3(1.78, prongY, -2.36),
    new THREE.Vector3(-1.78, prongY, -2.36),
  ];
  const nozzleScales = [1.3, 0.55, 0.55];

  return { group, setFlame, setAirbrake, nozzles: trailNozzles, nozzleScales, glowColor: glowCol };
}

export function createShip(team: Team, style: ShipStyle = 'aerovoid'): Ship {
  return style === 'velocity' ? createVelocityShip(team) : createAerovoidShip(team);
}

/** Light ribbon trail */
export class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ws: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();
  private base = new THREE.Color();
  private scale: number;
  static MAXP = 30;

  constructor(color: THREE.Color, scale = 1) {
    this.scale = scale;
    const M = Trail.MAXP;
    this.pos = new Float32Array(M * 2 * 3);
    this.col = new Float32Array(M * 2 * 3);
    for (let i = 0; i < M; i++) {
      this.pts.push(new THREE.Vector3());
      this.ws.push(new THREE.Vector3());
    }
    const idx: number[] = [];
    for (let i = 0; i < M - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.base.copy(color);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  reset(p: THREE.Vector3) {
    for (const q of this.pts) q.copy(p);
  }

  push(p: THREE.Vector3, w: THREE.Vector3, intensity: number, boost: number, color?: THREE.Color) {
    const M = Trail.MAXP;
    for (let i = M - 1; i > 0; i--) {
      this.pts[i].copy(this.pts[i - 1]);
      this.ws[i].copy(this.ws[i - 1]);
    }
    this.pts[0].copy(p);
    this.ws[0].copy(w);
    const c = color ?? this.base;
    const width = (0.16 + boost * 0.34) * this.scale;
    for (let i = 0; i < M; i++) {
      const fade = Math.pow(1 - i / (M - 1), 1.6) * intensity;
      const q = this.pts[i];
      const ww = this.ws[i];
      const wd = width * (1 - (i / M) * 0.4);
      this.pos.set([q.x - ww.x * wd, q.y - ww.y * wd, q.z - ww.z * wd, q.x + ww.x * wd, q.y + ww.y * wd, q.z + ww.z * wd], i * 6);
      const r = c.r * fade * 1.6,
        g = c.g * fade * 1.6,
        b = c.b * fade * 1.6;
      this.col.set([r, g, b, r, g, b], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
