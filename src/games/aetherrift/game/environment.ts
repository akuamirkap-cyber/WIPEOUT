import * as THREE from "three";
import { Track } from "./track";
import { clamp, fbm, mulberry32, quadGeometry, smoothstep } from "./utils";
import {
  LedDisplay,
  bigArrowTexture,
  bigLetterTexture,
  checkerTexture,
  adTexture,
  facadeTexture,
  grainTexture,
  hazardTexture,
  slotTexture,
  towerTexture,
  trussTexture,
} from "./textures";

/* ------------------------------------------------------------------ */
/* Ground height field                                                 */
/* ------------------------------------------------------------------ */
let coarse: { x: number; z: number }[] = [];

export function initGround(track: Track) {
  coarse = [];
  for (let i = 0; i < track.n; i += 8) coarse.push({ x: track.pos[i].x, z: track.pos[i].z });
}

export function distToTrack(x: number, z: number) {
  let best = 1e12;
  for (let i = 0; i < coarse.length; i++) {
    const dx = coarse[i].x - x;
    const dz = coarse[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function groundHeight(x: number, z: number, dt = distToTrack(x, z)) {
  const dStart = Math.hypot(x, z + 100);
  const base = -3 - 40 * smoothstep(dStart, 380, 950);
  const w = smoothstep(dt, 80, 440);
  const n1 = fbm(x * 0.0022 + 10, z * 0.0022 - 4, 5);
  const hills = Math.pow(Math.max(0, n1 - 0.28), 1.4) * 900;
  const r = Math.hypot(x - 330, z + 60);
  const ring = smoothstep(r, 1100, 2150) * (420 + 900 * fbm(x * 0.0012, z * 0.0012 + 7, 4));
  const window = smoothstep(z, 260, 120) * smoothstep(z, -440, -260);
  const ridge = smoothstep(x, 55, 330) * window * (120 + 110 * fbm(x * 0.012, z * 0.012, 4));
  return base + w * hills * 0.55 + ring + ridge;
}

/* ------------------------------------------------------------------ */
/* Terrain + rocks                                                     */
/* ------------------------------------------------------------------ */
export type CaveTest = (x: number, y: number, z: number, margin?: number) => boolean;

export function createTerrain(track: Track, inCave?: CaveTest) {
  const group = new THREE.Group();
  const SIZE = 5800;
  const SEG = 380;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(300, 0, -50);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const dts: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = distToTrack(x, z);
    dts.push(d);
    pos.setY(i, groundHeight(x, z, d));
  }
  geo.computeVertexNormals();
  // carve the hollow-earth cavern out of the terrain (drop every cell whose surface lies inside the shell)
  if (inCave) {
    const idx = geo.index!.array as ArrayLike<number>;
    const keep: number[] = [];
    for (let c = 0; c < idx.length; c += 6) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let q = 0; q < 6; q++) {
        const vi = idx[c + q];
        cx += pos.getX(vi);
        cy += pos.getY(vi);
        cz += pos.getZ(vi);
      }
      cx /= 6;
      cy /= 6;
      cz /= 6;
      if (inCave(cx, cy, cz, -8)) continue;
      for (let q = 0; q < 6; q++) keep.push(idx[c + q]);
    }
    geo.setIndex(keep);
  }
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const snow = new THREE.Color(0.82, 0.86, 0.94);
  const rock = new THREE.Color(0.1, 0.095, 0.1);
  const gravel = new THREE.Color(0.16, 0.17, 0.2);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const h = pos.getY(i);
    let sn = smoothstep(ny, 0.6, 0.86) + smoothstep(h, 220, 520) * 0.6;
    sn = clamp(sn, 0, 1);
    c.copy(rock).lerp(snow, sn);
    const g = 1 - smoothstep(dts[i], 24, 70);
    c.lerp(gravel, g * 0.8);
    const v = 0.92 + 0.16 * fbm(pos.getX(i) * 0.05, pos.getZ(i) * 0.05, 3);
    colors[i * 3] = c.r * v;
    colors[i * 3 + 1] = c.g * v;
    colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const grain = grainTexture();
  grain.repeat.set(900, 900);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grain,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // rocks
  const rg = new THREE.IcosahedronGeometry(1, 3);
  const rp = rg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const y = rp.getY(i);
    const z = rp.getZ(i);
    const k = 0.72 + 0.7 * fbm(x * 1.6 + 5, y * 1.6 + z * 1.2, 4);
    rp.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  rg.computeVertexNormals();
  const rcol = new Float32Array(rp.count * 3);
  const rn = rg.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const sn = smoothstep(rn.getY(i), 0.25, 0.6);
    const col = rock.clone().multiplyScalar(1.6).lerp(snow, sn);
    rcol.set([col.r, col.g, col.b], i * 3);
  }
  rg.setAttribute("color", new THREE.BufferAttribute(rcol, 3));
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const COUNT = 170;
  const inst = new THREE.InstancedMesh(rg, rockMat, COUNT);
  const rnd = mulberry32(2024);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard < 5000) {
    guard++;
    const i = Math.floor(rnd() * track.n);
    const sd = rnd() > 0.5 ? 1 : -1;
    const off = 90 + rnd() * 360;
    const x = track.pos[i].x + track.R[i].x * sd * off;
    const z = track.pos[i].z + track.R[i].z * sd * off;
    if (Math.abs(x) < 160 && z < 200 && z > -480) continue;
    const dt = distToTrack(x, z);
    if (dt < 85) continue;
    const y = groundHeight(x, z, dt);
    if (inCave && inCave(x, y, z, 60)) continue;
    const s = 9 + rnd() * rnd() * 46;
    e.set(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, y + s * 0.2, z), q, new THREE.Vector3(s * (1 + rnd() * 0.5), s, s * (1 + rnd() * 0.5)));
    inst.setMatrixAt(placed++, m4);
  }
  inst.count = placed;
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  return group;
}

/* ------------------------------------------------------------------ */
/* Start grid                                                          */
/* ------------------------------------------------------------------ */
export interface GridSlot {
  d: number;
  back: number;
}
export const GRID_SLOTS: GridSlot[] = Array.from({ length: 8 }, (_, k) => {
  const row = k >> 1;
  const left = k % 2 === 0;
  return { d: left ? -5.5 : 5.5, back: 14 + row * 17 + (left ? 0 : 7) };
});

/* ------------------------------------------------------------------ */
/* Start area                                                          */
/* ------------------------------------------------------------------ */
export function createStartArea() {
  const group = new THREE.Group();
  const led = new LedDisplay();

  const Z0 = 115;
  const Z1 = -245;
  const ZC = (Z0 + Z1) / 2;
  const ZL = Z0 - Z1;

  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const box = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material | THREE.Material[],
    x: number,
    y: number,
    z: number,
    cast = true,
    receive = true
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };
  const emissiveMat = (r: number, g: number, b: number) => {
    const m = new THREE.MeshBasicMaterial();
    m.color.setRGB(r, g, b);
    return m;
  };

  const concrete = std({ color: 0x8c8a82, roughness: 0.85, metalness: 0.05 });
  const darkMetal = std({ color: 0x242a38, roughness: 0.45, metalness: 0.8 });
  const cream = std({ color: 0xe8e3cf, roughness: 0.4, metalness: 0.2 });
  const hazTex = hazardTexture();

  // ---------- Plaza floor
  const grain = grainTexture();
  grain.repeat.set(60, 90);
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(130, ZL + 80),
    std({ color: 0x4a4f5a, map: grain, roughness: 0.9, metalness: 0.1 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(15, -2.85, ZC);
  plaza.receiveShadow = true;
  group.add(plaza);

  // ---------- Left grandstand (slanted bowl)
  const facade = facadeTexture();
  const facadeMat = std({
    map: facade,
    roughness: 0.6,
    metalness: 0.1,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
  });
  const BX = -27;
  const TX = -80;
  const TY = 66;
  const BY = -3;
  const slopeLen = Math.hypot(BX - TX, TY - BY);
  const stand = new THREE.Mesh(
    quadGeometry(
      new THREE.Vector3(BX, BY, Z0),
      new THREE.Vector3(BX, BY, Z1),
      new THREE.Vector3(TX, TY, Z1),
      new THREE.Vector3(TX, TY, Z0),
      ZL / 16,
      slopeLen / 8
    ),
    facadeMat
  );
  stand.castShadow = true;
  stand.receiveShadow = true;
  group.add(stand);
  // end caps
  const capMat = std({ color: 0x3a4152, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
  for (const z of [Z0, Z1]) {
    const cap = new THREE.Mesh(
      quadGeometry(
        new THREE.Vector3(BX, BY, z),
        new THREE.Vector3(TX, BY, z),
        new THREE.Vector3(TX, TY, z),
        new THREE.Vector3(TX, TY, z)
      ),
      capMat
    );
    cap.castShadow = true;
    group.add(cap);
  }
  // slope direction
  const slopeDir = new THREE.Vector3(TX - BX, TY - BY, 0).normalize();
  const slopeNormal = new THREE.Vector3(-slopeDir.y, slopeDir.x, 0).normalize(); // toward track & up
  if (slopeNormal.x < 0) slopeNormal.negate();
  const onSlope = (t: number, off = 0) =>
    new THREE.Vector3(BX, BY, 0).addScaledVector(slopeDir, t).addScaledVector(slopeNormal, off);

  // balcony slabs + under-lights
  const underGlow = emissiveMat(1.1, 1.3, 1.8);
  [16, 38, 60].forEach((t) => {
    const p = onSlope(t, 2.6);
    const slab = box(6.5, 1.1, ZL, concrete, p.x, p.y, ZC);
    slab.rotation.z = Math.atan2(slopeDir.y, slopeDir.x) - Math.PI / 2 + Math.PI; // slight tilt
    slab.rotation.z = 0;
    const lp = onSlope(t, 5.4);
    box(0.25, 0.16, ZL, underGlow, lp.x, lp.y - 0.65, ZC, false, false);
    // railing top light
    box(0.12, 0.12, ZL, emissiveMat(0.6, 1.2, 2.0), lp.x, lp.y + 1.2, ZC, false, false);
  });

  // big sign
  const signTex = bigLetterTexture("AETHER");
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissiveMap: signTex,
    emissive: new THREE.Color(0.4, 0.5, 1),
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.3,
    transparent: true,
    alphaTest: 0.08,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(210, 52.5), signMat);
  const sp = onSlope(46, 0.5);
  const bx = new THREE.Vector3(0, 0, -1);
  const by = slopeDir.clone();
  const bz = new THREE.Vector3().crossVectors(bx, by).normalize();
  sign.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
  sign.position.set(sp.x, sp.y, ZC - 20);
  sign.receiveShadow = true;
  group.add(sign);

  // roof canopy with light bars
  box(46, 2.6, ZL + 6, darkMetal, TX - 14, TY + 1.5, ZC);
  box(1.4, 8, ZL + 6, darkMetal, TX + 8, TY + 4, ZC);
  const roofLightGeo = new THREE.BoxGeometry(5, 0.4, 2.4);
  const roofLights = new THREE.InstancedMesh(roofLightGeo, emissiveMat(2.0, 2.0, 1.85), 60);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < 60; k++) {
    m4.makeTranslation(TX + 4, TY - 0.3, Z0 - 3 - k * (ZL / 60));
    roofLights.setMatrixAt(k, m4);
  }
  group.add(roofLights);

  // ---------- Right: retaining wall + ads
  const rwallTex = grainTexture();
  rwallTex.repeat.set(30, 6);
  box(5.5, 17, ZL, std({ color: 0xa79d86, map: rwallTex, roughness: 0.85 }), 22.9, 5.5, ZC);
  box(6.2, 1.3, ZL, std({ color: 0xe9eef6, roughness: 0.8 }), 23, 14.4, ZC);
  // dark blue windows band
  box(0.3, 3.2, ZL, std({ color: 0x141a55, roughness: 0.4, metalness: 0.4, envMapIntensity: 0.8 }), 20.0, 11, ZC, false, true);
  for (let k = 0; k < 10; k++) {
    const z = Z0 - 20 - k * 36;
    const t = adTexture(k + 1);
    const ad = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 6.5),
      std({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.5, roughness: 0.5 })
    );
    ad.rotation.y = -Math.PI / 2;
    ad.position.set(19.85, 5.2, z);
    ad.receiveShadow = true;
    group.add(ad);
  }
  // snow-covered ledge
  box(9, 1.2, ZL, std({ color: 0xdfe8f5, roughness: 0.95 }), 27.5, 15.4, ZC, true, true);

  // ---------- Floodlight pole (right)
  const poleMat = std({ color: 0x8e99ad, roughness: 0.4, metalness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.0, 90, 12), poleMat);
  pole.position.set(78, 42, -70);
  pole.castShadow = true;
  group.add(pole);
  const lampMat = emissiveMat(2.0, 2.0, 1.9);
  const lampBack = std({ color: 0x555d6e, roughness: 0.5, metalness: 0.7 });
  const ringGroup = new THREE.Group();
  ringGroup.position.set(78, 90, -70);
  const lampGeo = new THREE.BoxGeometry(6, 4, 0.5);
  const lampBackGeo = new THREE.BoxGeometry(6.4, 4.4, 0.9);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const lg = new THREE.Group();
    const f = new THREE.Mesh(lampGeo, lampMat);
    f.position.z = 0.5;
    const b = new THREE.Mesh(lampBackGeo, lampBack);
    lg.add(b, f);
    lg.position.set(Math.cos(a) * 11, Math.sin(a * 2) * 0.3, Math.sin(a) * 11);
    lg.rotation.y = Math.PI / 2 - a;
    lg.rotation.x = 0.35;
    ringGroup.add(lg);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 1, 20, 1, true), poleMat);
  hub.material = std({ color: 0x8e99ad, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide });
  ringGroup.add(hub);
  group.add(ringGroup);

  // ---------- Background towers (left / ahead)
  const towerMat = std({ map: (() => { const t = towerTexture(); t.repeat.set(7, 6); return t; })(), roughness: 0.55, metalness: 0.25, envMapIntensity: 1.2 });
  const hazMat = std({ map: (() => { const t = hazTex.clone(); t.repeat.set(10, 1); t.needsUpdate = true; return t; })(), roughness: 0.6, metalness: 0.3 });
  const tower = (x: number, z: number, r: number, h: number, bowl: boolean) => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 32), towerMat);
    shaft.position.set(x, h / 2 - 3, z);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);
    if (bowl) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.5, r * 1.2, r * 1.3, 40), hazMat);
      b.position.set(x, h - 3 + r * 0.6, z);
      b.castShadow = true;
      group.add(b);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.5, r * 2.5, r * 0.4, 40), darkMetal);
      top.position.set(x, h - 3 + r * 1.5, z);
      group.add(top);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(r * 2.1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        std({ color: 0x1c3f9a, roughness: 0.15, metalness: 0.8, envMapIntensity: 2 })
      );
      dome.position.set(x, h - 3 + r * 1.7, z);
      group.add(dome);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(r * 3.4, r * 0.9, r * 1.4), hazMat);
      pod.position.set(x + r * 1.9, h * 0.62, z + r * 1.2);
      pod.castShadow = true;
      group.add(pod);
    } else {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 3, 20), emissiveMat(0.7, 1.4, 2.6));
      lamp.position.set(x, h - 1.5, z);
      group.add(lamp);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 2, 20), darkMetal);
      cap.position.set(x, h + 1, z);
      group.add(cap);
    }
  };
  tower(-175, -215, 17, 150, true);
  tower(-330, -420, 11, 215, false);
  tower(-120, -520, 14, 120, false);
  tower(-410, -80, 12, 170, false);
  tower(-230, 140, 10, 110, false);

  // ---------- Pads (launch plates with truss)
  const trussTex = trussTexture();
  const padTop = std({ map: trussTex, roughness: 0.5, metalness: 0.5, envMapIntensity: 1.1 });
  trussTex.repeat.set(1, 3.4);
  const padCount = 10;
  const padLen = 30;
  const padStart = 74;
  for (const sd of [-1, 1]) {
    for (let k = 0; k < padCount; k++) {
      const z = padStart - k * (padLen + 2);
      const mats = [cream, cream, padTop, cream, cream, cream];
      const pad = box(8, 0.4, padLen, mats, sd * 12, 0.2, z, true, true);
      pad.castShadow = false;
      // raised front lip
      box(8, 0.7, 0.6, cream, sd * 12, 0.35, z - padLen / 2 + 0.3, true, true);
    }
    // long rail
    box(0.55, 0.9, padStart + 20 + padCount * (padLen + 2) - 140, cream, sd * 7.7, 0.45, ZC - 10, true, true);
    // ribs
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.2, 0.55), darkMetal, 260);
    for (let k = 0; k < 260; k++) {
      m4.makeTranslation(sd * 7.7, 0.95, padStart + 14 - k * 1.3);
      ribs.setMatrixAt(k, m4);
    }
    group.add(ribs);
  }
  // arrows on pads
  const arrowTex = bigArrowTexture();
  const arrowMat = new THREE.MeshStandardMaterial({
    map: arrowTex,
    transparent: true,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  for (const sd of [-1, 1]) {
    for (let k = 1; k < padCount; k += 2) {
      const z = padStart - k * (padLen + 2);
      const a = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), arrowMat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(sd * 12, 0.43, z);
      a.receiveShadow = true;
      group.add(a);
    }
  }
  // center big arrows
  const bigArrowMat = arrowMat.clone();
  for (let k = 0; k < 6; k++) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), bigArrowMat);
    a.rotation.x = -Math.PI / 2;
    a.position.set(0, 0.05, -30 - k * 38);
    a.receiveShadow = true;
    group.add(a);
  }

  // ---------- Start line + grid slots
  const lineMat = new THREE.MeshStandardMaterial({
    map: checkerTexture(),
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(31, 3.9), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.05, 0);
  line.receiveShadow = true;
  group.add(line);
  const slotMat = new THREE.MeshStandardMaterial({
    map: slotTexture(),
    transparent: true,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  GRID_SLOTS.forEach((s) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 8.4), slotMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(s.d, 0.05, s.back);
    p.receiveShadow = true;
    group.add(p);
  });

  // ---------- Gantry
  const GZ = -16;
  const gantryMat = std({ color: 0x1f2533, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.3 });
  for (const sd of [-1, 1]) {
    box(4, 40, 4.5, gantryMat, sd * 22.5, 17, GZ);
    box(1.2, 40, 5, std({ color: 0x3a4358, roughness: 0.4, metalness: 0.8 }), sd * 20.2, 17, GZ);
    box(0.5, 38, 0.5, emissiveMat(0.2, 1.0, 2.0), sd * 19.5, 17, GZ + 2.4, false, false);
  }
  box(52, 5.2, 6, gantryMat, 0, 33, GZ);
  const haz = std({ map: (() => { const t = hazTex.clone(); t.repeat.set(26, 1); t.needsUpdate = true; return t; })(), roughness: 0.6, metalness: 0.2 });
  box(52.2, 1.1, 6.2, haz, 0, 30.1, GZ);
  box(40, 0.3, 0.4, emissiveMat(0.2, 1.0, 2.0), 0, 34.7, GZ + 3.1, false, false);
  // led display
  const ledMat = new THREE.MeshBasicMaterial({ map: led.texture });
  ledMat.color.setRGB(1.25, 1.25, 1.25);
  for (const front of [1, -1]) {
    const back = box(23, 6.4, 0.8, darkMetal, 0, 25.6, GZ);
    back.castShadow = true;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), ledMat);
    disp.position.set(0, 25.6, GZ + front * 0.45);
    if (front === -1) disp.rotation.y = Math.PI;
    group.add(disp);
  }
  for (const sx of [-9, 9]) box(0.5, 3, 0.5, darkMetal, sx, 29, GZ, false, false);
  // flood panels
  const floodMat = emissiveMat(1.9, 1.9, 1.75);
  for (const sx of [-1, 1]) {
    box(10, 5.4, 0.7, darkMetal, sx * 17, 25.6, GZ);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.6), floodMat);
    f.position.set(sx * 17, 25.6, GZ + 0.4);
    group.add(f);
    const f2 = f.clone();
    f2.rotation.y = Math.PI;
    f2.position.z = GZ - 0.4;
    group.add(f2);
  }

  // ---------- Side flag-less banners: pit billboards on left of the road (above wall)
  const lt = new THREE.PointLight(0xfff0d8, 0, 0);
  group.add(lt);

  return { group, led };
}
