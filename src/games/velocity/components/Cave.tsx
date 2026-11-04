import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  samples,
  wrapIndex,
  DOME,
  LAKE_Y,
  INNER_SUN,
  TUNNELS,
  distToTrack,
  TRACK_HALF_WIDTH as HW,
} from "../game/track";
import { caveRockTextures, causticTexture, glowTexture, ledTexture, textTexture } from "../game/textures";
import { game } from "../game/store";

/* ------------------------------------------------------------------ utils */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), sx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), sx), sy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), sx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), sx), sy),
    sz
  );
}
function fbm(x: number, y: number, z: number) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * vnoise(x * f, y * f, z * f);
    a *= 0.5;
    f *= 2.1;
  }
  return v;
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function frameQuat(i: number) {
  const s = samples[wrapIndex(i)];
  const m = new THREE.Matrix4().makeBasis(s.r, s.u, s.t.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** project a world point onto the dome shell (slightly inside); returns point + OUTWARD normal */
function project(p: THREE.Vector3, inset = 0.985) {
  const d = new THREE.Vector3((p.x - DOME.c.x) / DOME.r.x, (p.y - DOME.c.y) / DOME.r.y, (p.z - DOME.c.z) / DOME.r.z).normalize();
  const pos = new THREE.Vector3(DOME.c.x + d.x * DOME.r.x * inset, DOME.c.y + d.y * DOME.r.y * inset, DOME.c.z + d.z * DOME.r.z * inset);
  const n = new THREE.Vector3(d.x / DOME.r.x, d.y / DOME.r.y, d.z / DOME.r.z).normalize();
  return { pos, n, d };
}
function randomUnit(rng: () => number) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
}
function nearTunnel(p: THREE.Vector3, d = 95) {
  return TUNNELS.some((t) => t.crossPos.distanceTo(p) < d);
}

function rockMaterial(opts: { side?: THREE.Side; repeat?: [number, number]; emissive?: number; color?: string; flat?: boolean }) {
  const { map, emissive } = caveRockTextures();
  const m = map.clone();
  const e = emissive.clone();
  m.repeat.set(...(opts.repeat ?? [1, 1]));
  e.repeat.set(...(opts.repeat ?? [1, 1]));
  m.needsUpdate = e.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: m,
    emissiveMap: e,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: opts.emissive ?? 0.45,
    color: opts.color ?? "#8b8196",
    roughness: 0.95,
    metalness: 0.05,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false,
  });
}

/** instanced material whose emissive is tinted by per-instance color */
function glowInstancedMaterial(emissiveIntensity: number, opacity = 1) {
  const m = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity,
    roughness: 0.2,
    metalness: 0.05,
    vertexColors: true,
    transparent: opacity < 1,
    opacity,
    envMapIntensity: 1.5,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;"
    );
  };
  m.customProgramCacheKey = () => "glowinst" + emissiveIntensity + opacity;
  return m;
}

/* ------------------------------------------------------------------ layout */
interface Island {
  pos: THREE.Vector3;
  rx: number;
  ry: number;
  rz: number;
  rot: number;
}
interface Layout {
  crystals: { m: THREE.Matrix4; c: THREE.Color }[];
  stals: THREE.Matrix4[];
  stems: THREE.Matrix4[];
  caps: { m: THREE.Matrix4; c: THREE.Color }[];
  islands: Island[];
  waterfalls: { x: number; z: number; top: number; w: number }[];
  lights: { pos: THREE.Vector3; color: string }[];
  fireflies: Float32Array;
  phases: Float32Array;
}

const CRYSTAL_COLORS = ["#3df2ff", "#d55cff", "#45ffc8", "#5a8cff", "#8affff"];
const CAP_COLORS = ["#4dffd2", "#ff6ad5", "#7aa6ff", "#c8ff5a", "#ffb15a"];

function buildLayout(): Layout {
  const rng = mulberry(1337);
  const crystals: Layout["crystals"] = [];
  const stals: THREE.Matrix4[] = [];
  const stems: THREE.Matrix4[] = [];
  const caps: Layout["caps"] = [];
  const islands: Island[] = [];
  const waterfalls: Layout["waterfalls"] = [];
  const lights: Layout["lights"] = [];
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();

  const okFloorY = (y: number) => y > LAKE_Y + 3;
  const surfacePt = (kind: "floor" | "wall" | "ceiling") => {
    for (let tries = 0; tries < 40; tries++) {
      const d = randomUnit(rng);
      const ok = kind === "floor" ? d.y < -0.2 && d.y > -0.76 : kind === "wall" ? Math.abs(d.y) < 0.35 : d.y > 0.3;
      if (!ok) continue;
      const pr = project(new THREE.Vector3(DOME.c.x + d.x * DOME.r.x, DOME.c.y + d.y * DOME.r.y, DOME.c.z + d.z * DOME.r.z));
      if (nearTunnel(pr.pos)) continue;
      return pr;
    }
    return null;
  };
  const orient = (up: THREE.Vector3, tilt: number, yaw: number) => {
    tmpQ.setFromUnitVectors(Y_AXIS, up);
    const perp = new THREE.Vector3().crossVectors(up, Math.abs(up.y) < 0.9 ? Y_AXIS : new THREE.Vector3(1, 0, 0)).normalize();
    tmpQ2.setFromAxisAngle(perp, tilt);
    tmpQ.premultiply(tmpQ2);
    tmpQ2.setFromAxisAngle(up, yaw);
    tmpQ.premultiply(tmpQ2);
    return tmpQ;
  };

  // ---- floating islands
  for (let tries = 0; islands.length < 9 && tries < 400; tries++) {
    const a = rng() * Math.PI * 2;
    const rad = 60 + rng() * 170;
    const pos = new THREE.Vector3(DOME.c.x + Math.cos(a) * rad, -40 - rng() * 190, DOME.c.z + Math.sin(a) * rad);
    const rx = 16 + rng() * 26;
    const ry = rx * (0.45 + rng() * 0.3);
    if (pos.y - ry < LAKE_Y + 30) continue;
    const { d, w } = distToTrack(pos);
    if (d < rx + w + 40) continue;
    if (pos.distanceTo(INNER_SUN) < rx + 70) continue;
    if (islands.some((o) => o.pos.distanceTo(pos) < o.rx + rx + 30)) continue;
    islands.push({ pos, rx, ry, rz: rx * (0.8 + rng() * 0.4), rot: rng() * Math.PI * 2 });
  }
  islands.slice(0, 5).forEach((isl) => waterfalls.push({ x: isl.pos.x, z: isl.pos.z, top: isl.pos.y - isl.ry * 0.6, w: 8 + rng() * 9 }));

  // ---- crystal clusters
  const clusters: { pos: THREE.Vector3; n: THREE.Vector3; col: THREE.Color }[] = [];
  for (let i = 0; i < 16; i++) {
    const kind = i < 9 ? "floor" : i < 14 ? "wall" : "ceiling";
    const pr = surfacePt(kind);
    if (!pr) continue;
    if (kind === "floor" && !okFloorY(pr.pos.y)) continue;
    clusters.push({ pos: pr.pos, n: pr.n, col: new THREE.Color(CRYSTAL_COLORS[i % CRYSTAL_COLORS.length]) });
  }
  clusters.slice(0, 4).forEach((cl, i) => {
    if (i >= 3) return;
    lights.push({ pos: cl.pos.clone().addScaledVector(cl.n, -22), color: "#" + cl.col.getHexString() });
  });
  const addCrystal = (pos: THREE.Vector3, up: THREE.Vector3, h: number, col: THREE.Color) => {
    const wdt = h * (0.28 + rng() * 0.25);
    const q = orient(up, (rng() - 0.5) * 0.7, rng() * Math.PI * 2);
    const m = new THREE.Matrix4().compose(pos, q, tmpS.set(wdt, h, wdt));
    crystals.push({ m, c: col.clone().offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.15) });
  };
  // giant crystals at cluster hearts
  clusters.forEach((cl) => {
    const { d, w } = distToTrack(cl.pos);
    const h = 18 + rng() * 26;
    if (d > w + h + 10) addCrystal(cl.pos, cl.n.clone().negate(), h, cl.col);
    for (let k = 0; k < 28; k++) {
      const off = new THREE.Vector3((rng() - 0.5) * 70, (rng() - 0.5) * 70, (rng() - 0.5) * 70);
      const pr = project(cl.pos.clone().add(off));
      if (pr.pos.y < LAKE_Y + 2 && pr.d.y < 0) continue;
      const hh = 3 + rng() * 11;
      const dt = distToTrack(pr.pos);
      if (dt.d < dt.w + hh + 6) continue;
      addCrystal(pr.pos, pr.n.clone().negate(), hh, cl.col);
    }
  });
  // scattered crystals
  for (let i = 0; i < 260; i++) {
    const kind = rng() < 0.55 ? "floor" : rng() < 0.6 ? "wall" : "ceiling";
    const pr = surfacePt(kind);
    if (!pr) continue;
    if (kind === "floor" && !okFloorY(pr.pos.y)) continue;
    const h = 2.5 + rng() * 7;
    const dt = distToTrack(pr.pos);
    if (dt.d < dt.w + h + 6) continue;
    addCrystal(pr.pos, pr.n.clone().negate(), h, new THREE.Color(CRYSTAL_COLORS[Math.floor(rng() * CRYSTAL_COLORS.length)]));
  }
  // crystals + mushrooms on islands
  islands.forEach((isl) => {
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.55;
      const pos = new THREE.Vector3(isl.pos.x + Math.cos(a) * isl.rx * rr, isl.pos.y + isl.ry * 0.78, isl.pos.z + Math.sin(a) * isl.rz * rr);
      addCrystal(pos, Y_AXIS, 4 + rng() * 10, new THREE.Color(CRYSTAL_COLORS[Math.floor(rng() * CRYSTAL_COLORS.length)]));
    }
    for (let k = 0; k < 4; k++) {
      const a = rng() * Math.PI * 2;
      const rr = 0.3 + rng() * 0.5;
      const pos = new THREE.Vector3(isl.pos.x + Math.cos(a) * isl.rx * rr, isl.pos.y + isl.ry * 0.8, isl.pos.z + Math.sin(a) * isl.rz * rr);
      addMushroom(pos, Y_AXIS, 2 + rng() * 4);
    }
  });

  function addMushroom(pos: THREE.Vector3, up: THREE.Vector3, h: number) {
    const q = orient(up, (rng() - 0.5) * 0.3, rng() * Math.PI * 2);
    stems.push(new THREE.Matrix4().compose(pos, q, tmpS.set(h * 0.13, h, h * 0.13)));
    const capPos = pos.clone().addScaledVector(up, h * 0.92);
    const cr = h * (0.4 + rng() * 0.2);
    caps.push({
      m: new THREE.Matrix4().compose(capPos, q, tmpS.set(cr, cr * 0.6, cr)),
      c: new THREE.Color(CAP_COLORS[Math.floor(rng() * CAP_COLORS.length)]),
    });
  }
  // ---- giant crystal spires rising from the floor / lake, and chandeliers hanging over the track
  const floorY = (x: number, z: number) => {
    const q = 1 - ((x - DOME.c.x) / DOME.r.x) ** 2 - ((z - DOME.c.z) / DOME.r.z) ** 2;
    return q <= 0 ? -1e9 : DOME.c.y - DOME.r.y * Math.sqrt(q);
  };
  const ceilY = (x: number, z: number) => {
    const q = 1 - ((x - DOME.c.x) / DOME.r.x) ** 2 - ((z - DOME.c.z) / DOME.r.z) ** 2;
    return q <= 0 ? 1e9 : DOME.c.y + DOME.r.y * Math.sqrt(q);
  };
  let spireCol = 0;
  for (let i = 0; i < samples.length; i += 28) {
    const s = samples[i];
    if (s.cave < 0.9 || nearTunnel(s.p, 120)) continue;
    const side = (i / 28) % 2 === 0 ? 1 : -1;
    const lat = side * (s.w + 30 + rng() * 70);
    const bx = s.p.x + s.r.x * lat;
    const bz = s.p.z + s.r.z * lat;
    const fy = floorY(bx, bz);
    if (fy < -1e8) continue;
    const base = new THREE.Vector3(bx, Math.max(fy, LAKE_Y - 10), bz);
    const colr = new THREE.Color(CRYSTAL_COLORS[spireCol++ % CRYSTAL_COLORS.length]);
    const h = (s.p.y - base.y) * (0.55 + rng() * 0.6);
    if (h < 30) continue;
    const dt = distToTrack(base.clone().setY(s.p.y));
    if (dt.d < dt.w + 18) continue;
    addCrystal(base, Y_AXIS, h, colr);
    // satellites
    for (let k = 0; k < 4; k++) {
      const off = new THREE.Vector3((rng() - 0.5) * 30, 0, (rng() - 0.5) * 30);
      const p2 = base.clone().add(off);
      p2.y = Math.max(floorY(p2.x, p2.z), LAKE_Y - 10);
      addCrystal(p2, Y_AXIS, h * (0.25 + rng() * 0.35), colr);
    }
    if (spireCol % 3 === 0) lights.push({ pos: base.clone().setY(base.y + h * 0.8), color: "#" + colr.getHexString() });
    // chandelier above the track on the opposite side
    const cl = -side * (s.w + 10 + rng() * 40);
    const cx = s.p.x + s.r.x * cl;
    const cz = s.p.z + s.r.z * cl;
    const cy = ceilY(cx, cz);
    if (cy < 1e8) {
      const hh = 35 + rng() * 60;
      if (cy - hh > s.p.y + 40) {
        const top = new THREE.Vector3(cx, cy - 4, cz);
        const down = new THREE.Vector3(0, -1, 0);
        addCrystal(top, down, hh, colr);
        for (let k = 0; k < 3; k++) {
          const p2 = top.clone().add(new THREE.Vector3((rng() - 0.5) * 24, 0, (rng() - 0.5) * 24));
          addCrystal(p2, down, hh * (0.3 + rng() * 0.4), colr);
        }
      }
    }
  }
  // ---- mushrooms on the shore slopes
  for (let i = 0; i < 190; i++) {
    const pr = surfacePt("floor");
    if (!pr || !okFloorY(pr.pos.y) || pr.pos.y > LAKE_Y + 110) continue;
    const h = 2 + rng() * 7;
    const dt = distToTrack(pr.pos);
    if (dt.d < dt.w + h + 4) continue;
    addMushroom(pr.pos, pr.n.clone().negate(), h);
  }
  // ---- stalactites / stalagmites
  for (let i = 0; i < 260; i++) {
    const pr = surfacePt("ceiling");
    if (!pr) continue;
    const r = 2.5 + rng() * 7;
    const len = 14 + rng() * 60;
    const dt = distToTrack(pr.pos);
    if (dt.d < dt.w + len + 10) continue;
    const q = orient(pr.n, (rng() - 0.5) * 0.25, rng() * Math.PI * 2);
    stals.push(new THREE.Matrix4().compose(pr.pos, q, tmpS.set(r, len, r)));
  }
  for (let i = 0; i < 140; i++) {
    const pr = surfacePt("floor");
    if (!pr || !okFloorY(pr.pos.y)) continue;
    const r = 3 + rng() * 8;
    const len = 10 + rng() * 36;
    const dt = distToTrack(pr.pos);
    if (dt.d < dt.w + len + 8) continue;
    const q = orient(pr.n, (rng() - 0.5) * 0.25, rng() * Math.PI * 2);
    stals.push(new THREE.Matrix4().compose(pr.pos, q, tmpS.set(r, len, r)));
  }
  // ---- fireflies
  const FF = 1400;
  const fireflies = new Float32Array(FF * 3);
  const phases = new Float32Array(FF);
  for (let i = 0; i < FF; i++) {
    let p: THREE.Vector3;
    do {
      p = new THREE.Vector3((rng() * 2 - 1) * 0.92, (rng() * 2 - 1) * 0.92, (rng() * 2 - 1) * 0.92);
    } while (p.lengthSq() > 0.85 || DOME.c.y + p.y * DOME.r.y < LAKE_Y + 6 || p.y > 0.55);
    fireflies[i * 3] = DOME.c.x + p.x * DOME.r.x;
    fireflies[i * 3 + 1] = DOME.c.y + p.y * DOME.r.y;
    fireflies[i * 3 + 2] = DOME.c.z + p.z * DOME.r.z;
    phases[i] = rng() * Math.PI * 2;
  }
  return { crystals, stals, stems, caps, islands, waterfalls, lights, fireflies, phases };
}

/* ------------------------------------------------------------------ dome */
function buildDome(scale: number) {
  const g = new THREE.SphereGeometry(1, 128, 96);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 2.6 + 7.3, v.y * 2.6 + 1.1, v.z * 2.6 + 3.7);
    const ridge = Math.pow(Math.abs(Math.sin(v.y * 9 + n * 4)), 3) * 0.012;
    const d = 1 + (n - 0.5) * 0.07 + ridge;
    pos.setXYZ(i, DOME.c.x + v.x * d * DOME.r.x * scale, DOME.c.y + v.y * d * DOME.r.y * scale, DOME.c.z + v.z * d * DOME.r.z * scale);
  }
  // cut holes for the tunnels
  const idx = g.index!;
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const ia = idx.getX(t), ib = idx.getX(t + 1), ic = idx.getX(t + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    a.add(b).add(c).multiplyScalar(1 / 3);
    if (TUNNELS.some((tn) => tn.crossPos.distanceTo(a) < 52)) continue;
    keep.push(ia, ib, ic);
  }
  g.setIndex(keep);
  g.computeVertexNormals();
  return g;
}

function Dome() {
  const inner = useMemo(() => buildDome(1), []);
  const outer = useMemo(() => buildDome(1.025), []);
  const innerMat = useMemo(() => rockMaterial({ side: THREE.BackSide, repeat: [7, 4], emissive: 0.4, color: "#9a90a8" }), []);
  const outerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#dfe5ee", roughness: 0.95, flatShading: true }), []);
  return (
    <>
      <mesh geometry={inner} material={innerMat} receiveShadow />
      <mesh geometry={outer} material={outerMat} castShadow receiveShadow />
    </>
  );
}

/* ------------------------------------------------------------------ tunnels + portals */
function Tunnels() {
  const data = useMemo(() => {
    return TUNNELS.map((t) => {
      const pts: THREE.Vector3[] = [];
      for (let i = t.start; i <= t.end; i += 2) {
        const s = samples[wrapIndex(i)];
        pts.push(s.p.clone().addScaledVector(s.u, 12));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const geo = new THREE.TubeGeometry(curve, 64, 32, 24, false);
      const geoOuter = new THREE.TubeGeometry(curve, 64, 36, 24, false);
      const rings: { pos: THREE.Vector3; q: THREE.Quaternion }[] = [];
      for (let i = t.start + 8; i < t.end - 4; i += 9) {
        const s = samples[wrapIndex(i)];
        rings.push({ pos: s.p.clone().addScaledVector(s.u, 12), q: frameQuat(i) });
      }
      // rubble around the shell crossing
      const rng = mulberry(t.cross * 7 + 3);
      const sc = samples[t.cross];
      const boulders: THREE.Matrix4[] = [];
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const sv = new THREE.Vector3();
      for (const ring of [
        { R: 52, n: 12, s0: 18, s1: 28, spread: 40 },
        { R: 82, n: 16, s0: 24, s1: 36, spread: 56 },
      ]) {
        for (let k = 0; k < ring.n; k++) {
          const ang = (k / ring.n) * Math.PI * 2 + rng() * 0.35;
          const along = (rng() - 0.5) * ring.spread;
          const pos = sc.p
            .clone()
            .addScaledVector(sc.r, Math.cos(ang) * ring.R)
            .addScaledVector(sc.u, Math.sin(ang) * ring.R + 10)
            .addScaledVector(sc.t, along);
          const s = ring.s0 + rng() * (ring.s1 - ring.s0);
          q.setFromEuler(e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28));
          boulders.push(new THREE.Matrix4().compose(pos, q, sv.set(s * (0.8 + rng() * 0.4), s * (0.7 + rng() * 0.5), s * (0.8 + rng() * 0.4))));
        }
      }
      const gateIndex = t.entering ? t.start - 7 : t.end + 7;
      return { geo, geoOuter, rings, boulders, gate: { pos: samples[wrapIndex(gateIndex)].p.clone(), q: frameQuat(gateIndex) }, entering: t.entering };
    });
  }, []);
  const tubeMat = useMemo(() => rockMaterial({ side: THREE.BackSide, repeat: [5, 2], emissive: 0.5, color: "#8c8398" }), []);
  const boulderMat = useMemo(() => rockMaterial({ repeat: [1, 1], emissive: 0.3, color: "#a09aa8", flat: true }), []);
  const tubeOuterMat = useMemo(() => rockMaterial({ repeat: [5, 2], emissive: 0.15, color: "#b9b3c2", flat: true }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#4fd8ff").multiplyScalar(2.5), toneMapped: false }), []);
  const boulderGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 1), []);
  const boulderRefs = useRef<THREE.InstancedMesh[]>([]);
  useMemo(() => void 0, []);
  return (
    <group>
      {data.map((d, i) => (
        <group key={i}>
          <mesh geometry={d.geo} material={tubeMat} receiveShadow />
          <mesh geometry={d.geoOuter} material={tubeOuterMat} castShadow receiveShadow />
          {d.rings.map((r, k) => (
            <mesh key={k} position={r.pos} quaternion={r.q} material={ringMat}>
              <torusGeometry args={[31, 0.45, 8, 48]} />
            </mesh>
          ))}
          <instancedMesh
            ref={(m) => {
              if (m && !boulderRefs.current[i]) {
                boulderRefs.current[i] = m;
                d.boulders.forEach((mat, k) => m.setMatrixAt(k, mat));
                m.instanceMatrix.needsUpdate = true;
              }
            }}
            args={[boulderGeo, boulderMat, d.boulders.length]}
            castShadow
            receiveShadow
          />
          <PortalGate pos={d.gate.pos} q={d.gate.q} label={d.entering ? "HOLLOW EARTH" : "SURFACE"} color={d.entering ? "#ff9a3c" : "#4fd8ff"} />
        </group>
      ))}
    </group>
  );
}

function PortalGate({ pos, q, label, color }: { pos: THREE.Vector3; q: THREE.Quaternion; label: string; color: string }) {
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a3f4c", roughness: 0.45, metalness: 0.85 }), []);
  const hazard = useMemo(() => new THREE.MeshStandardMaterial({ map: textTexture("▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼", "#e2b21a", "#15161a", 1024, 128), roughness: 0.6 }), []);
  const led = useMemo(() => ledTexture(label, color), [label, color]);
  const beacon = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.opacity = 0.4 + 0.6 * (Math.sin(clock.elapsedTime * 6) > 0 ? 1 : 0);
  });
  const W = HW + 7;
  return (
    <group position={pos} quaternion={q}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * W, 0, 0]}>
          <mesh material={steel} position={[0, 14, 0]} castShadow>
            <boxGeometry args={[3.2, 28, 3.2]} />
          </mesh>
          <mesh material={hazard} position={[0, 4, 0]}>
            <boxGeometry args={[3.4, 6, 3.4]} />
          </mesh>
          <mesh position={[0, 28.6, 0]}>
            <sphereGeometry args={[0.8, 12, 12]} />
            <meshBasicMaterial ref={beacon} color={new THREE.Color("#ff3030").multiplyScalar(4)} toneMapped={false} transparent />
          </mesh>
        </group>
      ))}
      <mesh material={steel} position={[0, 28, 0]} castShadow>
        <boxGeometry args={[2 * W + 3, 3, 3]} />
      </mesh>
      <mesh material={hazard} position={[0, 26, 0]}>
        <boxGeometry args={[2 * W, 1.2, 3.2]} />
      </mesh>
      <mesh position={[0, 22, 1.7]}>
        <planeGeometry args={[22, 7]} />
        <meshBasicMaterial map={led} toneMapped={false} />
      </mesh>
      <mesh material={steel} position={[0, 22, 0]}>
        <boxGeometry args={[23, 8, 3]} />
      </mesh>
      {[-10, -4, 4, 10].map((x) => (
        <mesh key={x} position={[x, 26.6, 1.7]}>
          <boxGeometry args={[2, 0.4, 0.2]} />
          <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(3)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ inner sun */
function InnerSun() {
  const g1 = useRef<THREE.Sprite>(null!);
  const ring1 = useRef<THREE.Mesh>(null!);
  const ring2 = useRef<THREE.Mesh>(null!);
  const mats = useMemo(
    () => ({
      core: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0").multiplyScalar(3.5), toneMapped: false }),
      glow: new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#ffb46a").multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.9 }),
      glow2: new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#ff8a4a"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.22 }),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc27a").multiplyScalar(2.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    }),
    []
  );
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (g1.current) g1.current.scale.setScalar(150 + Math.sin(t * 1.7) * 8);
    if (ring1.current) ring1.current.rotation.z += dt * 0.15;
    if (ring2.current) ring2.current.rotation.x += dt * 0.1;
  });
  return (
    <group position={INNER_SUN}>
      <mesh material={mats.core}>
        <sphereGeometry args={[20, 48, 32]} />
      </mesh>
      <sprite ref={g1} material={mats.glow} scale={[150, 150, 1]} />
      <sprite material={mats.glow2} scale={[460, 460, 1]} />
      <mesh ref={ring1} material={mats.ring} rotation={[1.1, 0.3, 0]}>
        <torusGeometry args={[46, 0.9, 8, 96]} />
      </mesh>
      <mesh ref={ring2} material={mats.ring} rotation={[0.4, 1.2, 0.5]}>
        <torusGeometry args={[66, 0.6, 8, 96]} />
      </mesh>
      <pointLight color="#ffb97a" intensity={48000} distance={1100} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------------ instanced props */
function Instanced({
  geometry,
  material,
  items,
  castShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: { m: THREE.Matrix4; c?: THREE.Color }[];
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const init = useRef(false);
  return (
    <instancedMesh
      ref={(m) => {
        if (!m || init.current) return;
        init.current = true;
        ref.current = m;
        items.forEach((it, i) => {
          m.setMatrixAt(i, it.m);
          if (it.c) m.setColorAt(i, it.c);
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function Props({ layout }: { layout: Layout }) {
  const geos = useMemo(() => {
    const whiteColors = (g: THREE.BufferGeometry) => {
      const n = g.attributes.position.count;
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      return g;
    };
    const crystal = whiteColors(new THREE.OctahedronGeometry(1, 0));
    crystal.translate(0, 0.55, 0); // base slightly embedded
    const stal = new THREE.ConeGeometry(1, 1, 7, 1);
    stal.rotateX(Math.PI);
    stal.translate(0, -0.5, 0); // base at y=0, apex at y=-1 (grows along -Y = inward)
    const stem = new THREE.CylinderGeometry(0.7, 1, 1, 8);
    stem.translate(0, 0.5, 0);
    const cap = whiteColors(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    const island = new THREE.DodecahedronGeometry(1, 1);
    return { crystal, stal, stem, cap, island };
  }, []);
  const mats = useMemo(
    () => ({
      crystal: glowInstancedMaterial(1.5, 0.9),
      cap: glowInstancedMaterial(1.1),
      stem: new THREE.MeshStandardMaterial({ color: "#d9d2e6", roughness: 0.7 }),
      rock: rockMaterial({ repeat: [2, 2], emissive: 0.35, color: "#8a8296", flat: true }),
      island: rockMaterial({ repeat: [3, 2], emissive: 0.45, color: "#948aa2", flat: true }),
    }),
    []
  );
  const stalItems = useMemo(() => layout.stals.map((m) => ({ m })), [layout]);
  const stemItems = useMemo(() => layout.stems.map((m) => ({ m })), [layout]);
  const islandItems = useMemo(
    () =>
      layout.islands.map((isl) => ({
        m: new THREE.Matrix4().compose(isl.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, isl.rot, 0)), new THREE.Vector3(isl.rx, isl.ry, isl.rz)),
      })),
    [layout]
  );
  return (
    <group>
      <Instanced geometry={geos.crystal} material={mats.crystal} items={layout.crystals} />
      <Instanced geometry={geos.stal} material={mats.rock} items={stalItems} castShadow />
      <Instanced geometry={geos.stem} material={mats.stem} items={stemItems} />
      <Instanced geometry={geos.cap} material={mats.cap} items={layout.caps} />
      <Instanced geometry={geos.island} material={mats.island} items={islandItems} castShadow />
      {layout.lights.slice(0, 5).map((l, i) => (
        <pointLight key={i} position={l.pos} color={l.color} intensity={12000} distance={480} decay={2} />
      ))}
      {layout.lights.map((l, i) => (
        <sprite key={"s" + i} position={l.pos} scale={[70, 70, 1]}>
          <spriteMaterial map={glowTexture()} color={new THREE.Color(l.color).multiplyScalar(0.8)} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ lake */
function Lake() {
  const caustic = useMemo(() => {
    const t = causticTexture();
    t.repeat.set(10, 10);
    return t;
  }, []);
  const caustic2 = useMemo(() => {
    const t = causticTexture().clone();
    t.repeat.set(7, 7);
    t.needsUpdate = true;
    return t;
  }, []);
  useFrame((_, dt) => {
    caustic.offset.x += dt * 0.012;
    caustic.offset.y += dt * 0.008;
    caustic2.offset.x -= dt * 0.009;
    caustic2.offset.y += dt * 0.011;
  });
  return (
    <group position={[DOME.c.x, LAKE_Y, DOME.c.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[242, 96]} />
        <meshPhysicalMaterial color="#06303a" emissive="#0d8a9a" emissiveIntensity={0.55} roughness={0.08} metalness={0.25} clearcoat={1} envMapIntensity={1.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <circleGeometry args={[240, 96]} />
        <meshBasicMaterial map={caustic} color={new THREE.Color("#3fe0ff").multiplyScalar(0.8)} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <circleGeometry args={[240, 96]} />
        <meshBasicMaterial map={caustic2} color={new THREE.Color("#7affd0").multiplyScalar(0.6)} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 40, 0]} color="#27c9d8" intensity={14000} distance={520} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------------ waterfalls */
const waterfallMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float n  = noise(vec2(vUv.x*7.0,  vUv.y*26.0 + uTime*2.2));
        float n2 = noise(vec2(vUv.x*19.0+4.0, vUv.y*70.0 + uTime*4.5));
        float streak = smoothstep(0.38, 0.85, n*0.62 + n2*0.38);
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float topFade = smoothstep(1.0, 0.92, vUv.y);
        float a = (streak*0.55 + 0.12) * edge * topFade;
        vec3 col = mix(vec3(0.55,0.95,1.0), vec3(1.0), streak*0.6);
        gl_FragColor = vec4(col*1.6, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

function Waterfalls({ layout }: { layout: Layout }) {
  const mat = useMemo(() => waterfallMaterial(), []);
  const mist = useMemo(
    () => new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#9af5ff"), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    []
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return (
    <group>
      {layout.waterfalls.map((wf, i) => {
        const h = wf.top - LAKE_Y;
        const cy = (wf.top + LAKE_Y) / 2;
        return (
          <group key={i} position={[wf.x, cy, wf.z]}>
            <mesh material={mat}>
              <planeGeometry args={[wf.w, h]} />
            </mesh>
            <mesh material={mat} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[wf.w, h]} />
            </mesh>
            <sprite material={mist} position={[0, -h / 2 + 4, 0]} scale={[wf.w * 3.5, wf.w * 2, 1]} />
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ fireflies */
function Fireflies({ layout }: { layout: Layout }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => layout.fireflies.slice(), [layout]);
  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    pts.visible = game.cave > 0.02;
    if (!pts.visible) return;
    const t = clock.elapsedTime;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const base = layout.fireflies;
    const ph = layout.phases;
    for (let i = 0; i < ph.length; i++) {
      const p = ph[i];
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.5 + p) * 3.5;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.37 + p * 2.0) * 2.5;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.43 + p) * 3.5;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = 0.75 * Math.min(1, game.cave * 2);
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={glowTexture()} color="#8ff7ff" size={1.3} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ root */
export function Cave() {
  const layout = useMemo(buildLayout, []);
  return (
    <group>
      <Dome />
      <Tunnels />
      <InnerSun />
      <Props layout={layout} />
      <Lake />
      <Waterfalls layout={layout} />
      <Fireflies layout={layout} />
    </group>
  );
}
