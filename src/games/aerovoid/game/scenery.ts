import * as THREE from 'three';
import { HW, Track, makeFrame, orientToFrame } from './track';
import { loopList } from './trackDefs';

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

function billboardTexture(brand: string, sub: string, c1: string, c2: string, aniso: number) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 360;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 1024, 360);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 360);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let x = -400; x < 1200; x += 70) {
    g.beginPath();
    g.moveTo(x, 360);
    g.lineTo(x + 40, 360);
    g.lineTo(x + 240, 0);
    g.lineTo(x + 200, 0);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.font = 'italic 900 150px "Arial Black", Impact, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(brand, 56, 150);
  g.font = '600 46px "Arial", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(sub, 62, 270);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 1008, 344);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function startBanner(aniso: number) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c1118';
  g.fillRect(0, 0, 1024, 192);
  for (let x = 0; x < 1024; x += 24)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x / 24 + y) % 2 ? '#f2f5f8' : '#0c1118';
      g.fillRect(x, y * 24, 24, 24);
      g.fillStyle = (x / 24 + y) % 2 ? '#0c1118' : '#f2f5f8';
      g.fillRect(x, 192 - 48 + y * 24, 24, 24);
    }
  g.fillStyle = '#ffe14a';
  g.font = 'italic 900 100px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('START / FINISH', 512, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function cloudTexture(seed: number, tint: string) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 38; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.pow(r(), 0.7) * 78;
    const x = 128 + Math.cos(a) * d * 1.15;
    const y = 128 + Math.sin(a) * d * 0.7;
    const rad = 26 + r() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${tint},0.55)`);
    gr.addColorStop(0.6, `rgba(${tint},0.22)`);
    gr.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  // feather the sprite border so its quad edge never reads as a hard horizon line
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  mask.addColorStop(0.85, 'rgba(255,255,255,0.3)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}



function checkerBand() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 32; x++) {
      g.fillStyle = (x + y) % 2 ? '#eef2f6' : '#12171d';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#12161b';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#f2b51d';
  for (let x = -128; x < 640; x += 96) {
    g.beginPath();
    g.moveTo(x, 128);
    g.lineTo(x + 48, 128);
    g.lineTo(x + 128, 0);
    g.lineTo(x + 80, 0);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 118, 512, 10);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 512, Math.random() * 128, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function sponsorTexture(name: string, sub: string, accent: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eef3f8';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = accent;
  g.fillRect(0, 0, 14, 128);
  g.fillStyle = '#101828';
  g.font = 'italic 900 62px "Arial Black", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(name, 40, 58);
  g.fillStyle = '#5a6b80';
  g.font = '600 24px Arial, sans-serif';
  g.fillText(sub, 42, 100);
  g.strokeStyle = 'rgba(20,30,50,0.25)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function bigLettersTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 256);
  g.font = 'italic 900 210px "Arial Black", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = '#3f7ddb';
  g.lineWidth = 16;
  g.strokeText(text, 12, 132);
  g.fillStyle = 'rgba(10,30,60,0.85)';
  g.fillText(text, 12, 132);
  g.strokeStyle = 'rgba(190,225,255,0.9)';
  g.lineWidth = 3;
  g.strokeText(text, 12, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}


function gridPadTexture(n: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 224;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 224);
  g.fillStyle = '#39424d';
  g.fillRect(0, 0, 512, 224);
  // hazard edge strips
  g.save();
  g.beginPath();
  g.rect(0, 0, 512, 22);
  g.rect(0, 202, 512, 22);
  g.clip();
  g.fillStyle = '#c99a1c';
  for (let x = -60; x < 560; x += 44) {
    g.beginPath();
    g.moveTo(x, 22);
    g.lineTo(x + 22, 22);
    g.lineTo(x + 40, 0);
    g.lineTo(x + 18, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(x, 224);
    g.lineTo(x + 22, 224);
    g.lineTo(x + 40, 202);
    g.lineTo(x + 18, 202);
    g.closePath();
    g.fill();
  }
  g.restore();
  // panel seams
  g.strokeStyle = 'rgba(10,14,20,0.55)';
  g.lineWidth = 3;
  for (const x of [128, 256, 384]) {
    g.beginPath();
    g.moveTo(x, 22);
    g.lineTo(x, 202);
    g.stroke();
  }
  // slot number
  g.fillStyle = 'rgba(200,225,245,0.9)';
  g.font = 'italic 900 116px "Arial Black", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(String(n), 34, 112);
  // chevrons
  g.strokeStyle = 'rgba(170,200,225,0.55)';
  g.lineWidth = 10;
  for (let k = 0; k < 3; k++) {
    const x = 300 + k * 56;
    g.beginPath();
    g.moveTo(x, 62);
    g.lineTo(x + 34, 112);
    g.lineTo(x, 162);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildScenery(track: Track, scene: THREE.Scene, aniso: number, seed = 0) {
  const rand = rng(77 + seed * 31);
  const root = new THREE.Group();
  scene.add(root);
  const f = makeFrame();
  const L = track.L;

  const metalLight = new THREE.MeshStandardMaterial({ color: 0xc9d1d8, metalness: 0.6, roughness: 0.35, envMapIntensity: 1.2 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2a3037, metalness: 0.8, roughness: 0.4, envMapIntensity: 1.2 });
  const cyanGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3.4), toneMapped: false });
  const amberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.4, 0.25), toneMapped: false });

  /** is any *other* part of the circuit (not the neighbourhood of s) closer than rad to p? */
  const nearOtherTrack = (p: THREE.Vector3, s: number, rad: number, skip = 220) => {
    for (let i = 0; i < track.N; i += 2) {
      const ds = Math.abs(i * track.ds - track.wrap(s));
      if (Math.min(ds, L - ds) < skip) continue;
      if (track.P[i].distanceTo(p) < rad) return true;
    }
    return false;
  };
  const farFromTrack = (p: THREE.Vector3, rad: number) => {
    for (let i = 0; i < track.N; i += 3) if (track.P[i].distanceTo(p) < rad) return false;
    return true;
  };

  // ---- pylons (instanced, never through loops or other track sections) ----
  const spacing = 95;
  const total = Math.floor(L / spacing);
  const colGeo = new THREE.CylinderGeometry(3.2, 7.5, 1, 10);
  colGeo.translate(0, -0.5, 0);
  const colMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c2, metalness: 0.55, roughness: 0.45, envMapIntensity: 1.1 });
  const beamGeo = new THREE.BoxGeometry(30, 2.2, 7);
  const capGeo = new THREE.BoxGeometry(12, 3, 9);
  const cols = new THREE.InstancedMesh(colGeo, colMat, total);
  const beams = new THREE.InstancedMesh(beamGeo, metalDark, total);
  const caps = new THREE.InstancedMesh(capGeo, metalLight, total);
  cols.castShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tmp = new THREE.Object3D();
  let pc = 0;
  for (let i = 0; i < total; i++) {
    const s = i * spacing + 20;
    if (!track.flat(s, 26)) continue;
    track.frameAt(s, f);
    if (f.u.y < 0.8) continue;
    // anything under this pylon?
    let blocked = false;
    for (let k = 0; k < track.N; k += 2) {
      const q2 = track.P[k];
      if (q2.y < f.pos.y - 4 && Math.hypot(q2.x - f.pos.x, q2.z - f.pos.z) < 30) {
        const ds = Math.abs(k * track.ds - s);
        if (Math.min(ds, L - ds) > 40) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;
    const top = f.pos.y - 11.5;
    m4.compose(new THREE.Vector3(f.pos.x, top, f.pos.z), q.identity(), new THREE.Vector3(1, top + 1300, 1));
    cols.setMatrixAt(pc, m4);
    orientToFrame(tmp, f, 0, -11.2);
    tmp.updateMatrix();
    beams.setMatrixAt(pc, tmp.matrix);
    orientToFrame(tmp, f, 0, -12.8);
    tmp.updateMatrix();
    caps.setMatrixAt(pc, tmp.matrix);
    pc++;
  }
  cols.count = beams.count = caps.count = pc;
  root.add(cols, beams, caps);

  // ---- gates ----
  const gateGroupFor = (k: number, big: boolean) => {
    const g = new THREE.Group();
    const half = HW + 3.5;
    const H = big ? 13 : 34;
    const post = new THREE.BoxGeometry(2.2, H, 2.2);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(post, metalLight);
      p.position.set(sx * half, H / 2 - 1, 0);
      p.castShadow = true;
      g.add(p);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.45, H * 0.4, 5), metalDark);
      fin.position.set(sx * (half + 1.6), H * 0.28, 0);
      g.add(fin);
    }
    const beamY = big ? 10.8 : 25;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 2.4, big ? 2.6 : 3.4, 3), metalLight);
    beam.position.set(0, beamY, 0);
    beam.castShadow = true;
    g.add(beam);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 4, 0.4, 0.4), k % 2 ? amberGlow : cyanGlow);
    strip.position.set(0, beamY - 1.5, 0.4);
    g.add(strip);
    const strip2 = strip.clone();
    strip2.position.z = -0.4;
    g.add(strip2);
    if (big) {
      // checkered band on the gantry, plus a compact start board below the HUD line
      const check = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1.15, 0.35), new THREE.MeshBasicMaterial({ map: checkerBand(), toneMapped: false }));
      check.position.set(0, beamY - 0.85, 0.3);
      g.add(check);
      const bannerGeo = new THREE.PlaneGeometry(half * 1.7, 4.2);
      bannerGeo.rotateY(Math.PI);
      const banner = new THREE.Mesh(
        bannerGeo,
        new THREE.MeshBasicMaterial({ map: startBanner(aniso), side: THREE.DoubleSide, toneMapped: true, color: 0xaab4bf })
      );
      banner.position.set(0, beamY - 3.6, 0);
      g.add(banner);
      for (let i = -4; i <= 4; i++) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), cyanGlow);
        l.position.set(i * 5, 8.6, 0);
        g.add(l);
      }
      // start lights
      for (let i = -2; i <= 2; i++) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.12), toneMapped: false }));
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(i * 2.4, 8.4, 0.4);
        g.add(lamp);
      }
    }
    return g;
  };
  const gateS: number[] = [0];
  const gateCount = Math.round(L / 330);
  for (let k = 1; k < gateCount; k++) gateS.push((k / gateCount) * L);
  for (const lp of track.loops) gateS.push(lp.s0 - 85);
  gateS.forEach((s, k) => {
    if (!track.flat(s, 24)) return;
    const g = gateGroupFor(k, k === 0);
    track.frameAt(s, f);
    orientToFrame(g, f);
    root.add(g);
  });

  // ---- loop guard rings ----
  for (const lp of loopList(track.def)) {
    const mid = new THREE.Vector3().copy(lp.o).addScaledVector(new THREE.Vector3(0, 1, 0), lp.R);
    [-1, 1].forEach((sd, idx) => {
      const lat = sd < 0 ? Math.min(0, lp.side * lp.shift) - HW - 5 : Math.max(0, lp.side * lp.shift) + HW + 5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(lp.R + 15, 1.1, 10, 96), idx ? amberGlow : cyanGlow);
      ring.position.copy(mid).addScaledVector(lp.r, lat);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lp.r);
      root.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(lp.R + 18, 0.5, 8, 96), metalLight);
      ring2.position.copy(ring.position);
      ring2.quaternion.copy(ring.quaternion);
      root.add(ring2);
    });
  }

  // ---- billboards ----
  const brands: [string, string, string, string][] = [
    ['AURORA', 'DYNAMICS · AG DRIVE', '#0a54d6', '#0a1f5c'],
    ['VANTA', 'RACING SYSTEMS', '#2a2f36', '#7a1410'],
    ['KORIN', 'GRAVITY WORKS', '#0f9d86', '#0b2f3a'],
    ['SOLARIS', 'ENERGY · NITRO CELLS', '#e8731a', '#5a1f0a'],
    ['OMEGA CUP', 'ANTI-GRAVITY LEAGUE', '#3d2ba8', '#0f0a35'],
  ];
  const bbCount = Math.round(L / 380);
  let bbPlaced = 0;
  for (let k = 0; k < bbCount * 3 && bbPlaced < bbCount; k++) {
    const s = ((k + 0.5) / (bbCount * 3)) * L + 40;
    if (track.wrap(s) < 280) continue;
    if (!track.flat(s, 30)) continue;
    track.frameAt(s, f);
    if (f.u.y < 0.85) continue;
    const side = bbPlaced % 2 ? 1 : -1;
    const pos = f.pos.clone().addScaledVector(f.r, side * (HW + 38));
    if (nearOtherTrack(pos, s, 70)) continue;
    const b = brands[bbPlaced % brands.length];
    const tex = billboardTexture(b[0], b[1], b[2], b[3], aniso);
    const g = new THREE.Group();
    const panelMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, color: 0xc9d4e0 });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 20.4),
      panelMat
    );
    panel.position.set(0, 30, 0.17);
    const backPanel = panel.clone();
    backPanel.rotation.y = Math.PI;
    backPanel.position.z = -0.17;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(58.5, 20.9, 0.26), metalDark);
    backing.position.y = 30;
    g.add(backing, panel, backPanel);
    // A narrow bezel leaves the sponsor artwork visible from both directions.
    for (const y of [19.25, 40.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(59.8, 0.9, 0.7), metalLight);
      rail.position.set(0, y, 0);
      g.add(rail);
    }
    for (const x of [-29.45, 29.45]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 21.5, 0.7), metalLight);
      rail.position.set(x, 30, 0);
      g.add(rail);
    }
    const pole = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 2), metalLight);
    pole.position.set(0, 5, 0);
    g.add(pole);
    orientToFrame(g, f, side * (HW + 38));
    g.rotateY(Math.PI + side * 0.35);
    root.add(g);
    bbPlaced++;
  }

  // ---- floating mushroom structures ----
  const discMat = new THREE.MeshStandardMaterial({ color: 0xd7dde3, metalness: 0.55, roughness: 0.38, envMapIntensity: 1.3 });
  const makeSaucer = () => {
    const g = new THREE.Group();
    const lathe = (pts: [number, number][], seg = 40) =>
      new THREE.LatheGeometry(
        pts.map((p) => new THREE.Vector2(p[0], p[1])),
        seg
      );
    const d1 = lathe([[0, -6], [46, -4], [70, 0], [74, 4], [66, 7], [0, 8]]);
    const d2 = lathe([[0, -3], [34, -2], [50, 1], [52, 4], [46, 6], [0, 7]]);
    const d3 = lathe([[0, -2], [22, -1], [34, 1], [35, 3], [30, 4], [0, 5]]);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(d1, discMat, 0);
    add(d2, discMat, 34);
    add(d3, metalDark, 64);
    add(new THREE.CylinderGeometry(9, 12, 260, 12), metalLight, 14);
    const spike = new THREE.ConeGeometry(30, 140, 12);
    spike.rotateX(Math.PI);
    add(spike, metalDark, -76);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(71, 0.9, 6, 64), cyanGlow);
    r1.rotation.x = Math.PI / 2;
    r1.position.y = 1.5;
    g.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(50, 0.7, 6, 64), amberGlow);
    r2.rotation.x = Math.PI / 2;
    r2.position.y = 35.5;
    g.add(r2);
    add(new THREE.CylinderGeometry(0.8, 1.4, 70, 6), metalLight, 105);
    return g;
  };
  const span = track.maxY - track.minY;
  let placed = 0;
  let tries = 0;
  while (placed < 20 && tries < 500) {
    tries++;
    const near = placed < 12;
    let p: THREE.Vector3;
    if (near) {
      const i = Math.floor(rand() * track.N);
      const side = rand() < 0.5 ? -1 : 1;
      p = track.P[i]
        .clone()
        .addScaledVector(track.R[i], side * (200 + rand() * 420))
        .add(new THREE.Vector3(0, -120 + rand() * 420, 0));
    } else {
      const a = rand() * Math.PI * 2;
      const r = rand() < 0.3 ? rand() * track.ext * 0.3 : track.ext + 700 + rand() * 1700;
      p = new THREE.Vector3(track.cx + Math.cos(a) * r, track.minY - 150 + rand() * (span + 600), track.cz + Math.sin(a) * r);
    }
    const sc = 0.7 + rand() * 1.5;
    if (!farFromTrack(p, 90 * sc + 130)) continue;
    const s = makeSaucer();
    s.position.copy(p);
    s.scale.setScalar(sc);
    s.rotation.y = rand() * 6;
    s.rotation.z = (rand() - 0.5) * 0.12;
    root.add(s);
    placed++;
  }

  // ---- giant rings ----
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe6ebef, metalness: 0.5, roughness: 0.3, envMapIntensity: 1.3 });
  let rp = 0;
  tries = 0;
  while (rp < 7 && tries < 400) {
    tries++;
    const i = Math.floor(rand() * track.N);
    const side = rand() < 0.5 ? -1 : 1;
    const p = track.P[i]
      .clone()
      .addScaledVector(track.R[i], side * (260 + rand() * 360))
      .add(new THREE.Vector3(0, 40 + rand() * 260, 0));
    const rad = 90 + rand() * 90;
    if (!farFromTrack(p, rad + 130)) continue;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 5, 16, 80), ringMat);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(rad - 6, 1.2, 8, 80), rp % 2 ? amberGlow : cyanGlow);
    g.add(ring, inner);
    g.position.copy(p);
    g.rotation.y = rand() * Math.PI;
    g.rotation.x = (rand() - 0.5) * 0.8;
    root.add(g);
    rp++;
  }

  // ================================================================ START COMPLEX
  // local frame: +X = left of the circuit, +Y = up, +Z = forward
  const hazardTex = hazardTexture();
  hazardTex.repeat.set(3, 1);
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.72, metalness: 0.15, envMapIntensity: 0.55 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x7d8792, roughness: 0.82, metalness: 0.1, envMapIntensity: 0.55 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x4f5964, roughness: 0.85, metalness: 0.14, envMapIntensity: 0.5 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x25314a, roughness: 0.7, metalness: 0.18, envMapIntensity: 0.55 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x79838f, roughness: 0.6, metalness: 0.35, envMapIntensity: 0.6 });
  const lightBar = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 0.98), toneMapped: false });
  const screenGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.34, 0.85), toneMapped: false });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xc6d2de, roughness: 0.93, metalness: 0.02, flatShading: true, envMapIntensity: 0.6 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x707b87, roughness: 0.93, metalness: 0.04, flatShading: true, envMapIntensity: 0.5 });
  const cr = rng(4242);

  // --- hazard panels on both walls ---
  {
    const n = Math.floor((250 + 190) / 18);
    const geo = new THREE.PlaneGeometry(18, 2.4);
    for (const side of [-1, 1]) {
      const im = new THREE.InstancedMesh(geo, hazardMat, n);
      const o = new THREE.Object3D();
      for (let k = 0; k < n; k++) {
        const sv = -180 + k * 18;
        track.frameAt(sv, f);
        orientToFrame(o, f, side * (HW - 0.25), 1.75);
        o.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        o.updateMatrix();
        im.setMatrixAt(k, o.matrix);
      }
      root.add(im);
    }
  }

  // --- sponsor lightboxes on the right-hand barrier (local +X) ---
  {
    const names: [string, string, string][] = [
      ['SYNCHRO', 'ENERGY SYSTEMS', '#c23a2a'],
      ['HYPERION', 'AG DRIVE', '#1c56c8'],
      ['KORIN', 'GRAVITY WORKS', '#0b8f7d'],
      ['VANTA', 'RACING', '#20242a'],
      ['SOLARIS', 'NITRO CELLS', '#e8731a'],
    ];
    for (let k = 0; k < 7; k++) {
      const sv = -150 + k * 58;
      const nm = names[k % names.length];
      const tex = sponsorTexture(nm[0], nm[1], nm[2]);
      track.frameAt(sv, f);
      const g = new THREE.Group();
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(17, 4.3),
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.62, metalness: 0.08 })
      );
      const back = new THREE.Mesh(new THREE.BoxGeometry(17.6, 4.9, 0.5), metalDark);
      back.position.z = -0.35;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(17.2, 4.5, 0.15), lightBar);
      rim.position.z = -0.2;
      g.add(panel, back, rim);
      orientToFrame(g, f, HW + 5.5, 5.2);
      g.rotateY(-Math.PI / 2);
      root.add(g);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 19), concreteDark);
      orientToFrame(base, f, HW + 5.5, 1.3);
      root.add(base);
    }
  }

  // --- grandstand on the left-hand side (local -X), set back behind the barrier ---
  const crowdGeo = new THREE.BoxGeometry(0.95, 0.95, 0.6);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.04 });
  const crowdColors = [0xc94a32, 0x2f6bd8, 0xe3d64a, 0x3fae6a, 0xdfe6ee, 0x8f4fd0, 0x2fb9c9];
  const crowdCount = 420;
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
  const cc = new THREE.Color();
  for (let i = 0; i < crowdCount; i++) {
    cc.setHex(crowdColors[Math.floor(cr() * crowdColors.length)]);
    crowd.setColorAt(i, cc);
  }
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  let crowdIdx = 0;
  const SIDE = -1; // stands on the left of the circuit
  for (let seg = 0; seg < 7; seg++) {
    const sv = -170 + seg * 62;
    if (!track.flat(sv, 24)) continue;
    track.frameAt(sv, f);
    const stand = new THREE.Group();
    const baseLat = HW + 27;
    for (let t = 0; t < 4; t++) {
      const h = 1.9 * (t + 1);
      const depth = 4.0;
      const x = SIDE * (2 + t * depth);
      const tier = new THREE.Mesh(new THREE.BoxGeometry(depth, h, 52), t % 2 ? seatMat : concreteDark);
      tier.position.set(x, h / 2, 0);
      tier.castShadow = true;
      tier.receiveShadow = true;
      stand.add(tier);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.08, 0.22, 52.2), concrete);
      lip.position.set(x, h + 0.1, 0);
      stand.add(lip);
      for (let c = 0; c < 20 && crowdIdx < crowdCount; c++) {
        const o = new THREE.Object3D();
        o.position.set(x - SIDE * 0.2 + (cr() - 0.5) * 1.1, h + 0.62, -23 + c * 2.4 + (cr() - 0.5) * 0.8);
        o.rotation.y = -SIDE * Math.PI * 0.5 + (cr() - 0.5) * 0.5;
        o.scale.setScalar(0.75 + cr() * 0.3);
        o.updateMatrix();
        crowd.setMatrixAt(crowdIdx++, o.matrix);
      }
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(20, 2.6, 54), concrete);
    plinth.position.set(SIDE * 8, -1.2, 0);
    plinth.receiveShadow = true;
    stand.add(plinth);
    // rear facade (kept low so the skyline stays open)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 9.5, 52), roofMat);
    wall.position.set(SIDE * 16.5, 4.75, 0);
    wall.castShadow = true;
    stand.add(wall);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(48, 1.7), screenGlow);
    band.rotation.y = -SIDE * Math.PI * 0.5;
    band.position.set(SIDE * 15.9, 8.2, 0);
    stand.add(band);
    // slim roof canopy over the seats only
    const roof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.55, 52), roofMat);
    roof.position.set(SIDE * 8, 9.2, 0);
    roof.rotation.z = SIDE * 0.05;
    roof.castShadow = true;
    stand.add(roof);
    for (const zz of [-24, 0, 24]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 9.2, 8), metalLight);
      col.position.set(SIDE * 15.6, 4.6, zz);
      stand.add(col);
    }
    for (let l = 0; l < 5; l++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.3), lightBar);
      lamp.position.set(SIDE * 15.4, 8.9, -20 + l * 10);
      stand.add(lamp);
    }
    orientToFrame(stand, f, SIDE * baseLat, 0);
    root.add(stand);

    // illuminated branding on the stand facade, facing the circuit
    if (seg % 2 === 0) {
      const letters = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 9),
        new THREE.MeshStandardMaterial({
          map: bigLettersTexture(seg % 4 === 0 ? 'AEROVOID' : 'OMEGA CUP'),
          transparent: true,
          metalness: 0.2,
          roughness: 0.5,
          emissive: 0x2a4f8a,
          emissiveIntensity: 0.5,
        })
      );
      orientToFrame(letters, f, SIDE * (baseLat - 16.2), 7.4);
      letters.rotateY(SIDE > 0 ? -Math.PI / 2 : Math.PI / 2);
      root.add(letters);
    }

    // floodlight mast behind the stand
    if (seg % 2 === 1) {
      const mast = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 22, 8), metalLight);
      pole.position.y = 11;
      mast.add(pole);
      const rig = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 8, 24), metalLight);
      rig.rotation.x = Math.PI / 2;
      rig.position.y = 22.3;
      mast.add(rig);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.6), lightBar);
        lamp.position.set(Math.cos(a) * 4.2, 22.1, Math.sin(a) * 4.2);
        mast.add(lamp);
      }
      orientToFrame(mast, f, SIDE * (baseLat - 2), 0);
      root.add(mast);
    }
  }
  root.add(crowd);

  // --- snow / ice hills on the right-hand side (local +X) ---
  for (let k = 0; k < 10; k++) {
    const sv = -170 + k * 46 + cr() * 18;
    track.frameAt(sv, f);
    const lat = HW + 60 + cr() * 95;
    const p = f.pos.clone().addScaledVector(f.r, lat);
    if (nearOtherTrack(p, sv, 60)) continue;
    const sc = 24 + cr() * 30;
    const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cr() > 0.4 ? snowMat : rockMat);
    mound.position.copy(p).add(new THREE.Vector3(0, sc * 0.1 - 8, 0));
    mound.scale.set(sc * 1.7, sc * 0.5, sc * 1.35);
    mound.rotation.y = cr() * 6;
    mound.castShadow = true;
    mound.receiveShadow = true;
    root.add(mound);
  }

  // --- start grid pads ---
  {
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x252d36, roughness: 0.7, metalness: 0.25, envMapIntensity: 0.35 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.7, 1.0), toneMapped: false });
    for (let slot = 0; slot < 8; slot++) {
      const row = Math.floor(slot / 2);
      const p = -(16 + row * 14);
      const lat = slot % 2 === 0 ? -7 : 7;
      track.frameAt(p, f);
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 4.4), plateMat);
      pad.receiveShadow = true;
      g.add(pad);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(9.9, 4.3),
        new THREE.MeshBasicMaterial({ map: gridPadTexture(slot + 1), toneMapped: true, color: 0x8f9aa6, transparent: true })
      );
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.06;
      g.add(face);
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 4.3), edgeMat);
        e.position.set(sx * 4.9, 0.07, 0);
        g.add(e);
      }
      orientToFrame(g, f, lat, 0.06);
      root.add(g);
    }
  }

  // ---- clouds ----
  const cloudTex = [
    cloudTexture(1, '255,255,255'),
    cloudTexture(2, '246,250,255'),
    cloudTexture(3, '226,234,246'),
  ];
  const clouds: THREE.Sprite[] = [];
  const reach = track.ext + 2600;
  for (let i = 0; i < 140; i++) {
    const low = i < 95;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (low ? reach : reach + 1200) + (low ? 0 : 600);
    const y = low ? track.minY - 900 + rand() * 650 : track.minY - 200 + rand() * (span + 750);
    const mat = new THREE.SpriteMaterial({
      map: cloudTex[i % 3],
      transparent: true,
      opacity: low ? 0.8 : 0.5,
      depthWrite: false,
      fog: true,
    });
    const sp = new THREE.Sprite(mat);
    const sc = (low ? 900 : 1300) + rand() * 1100;
    sp.scale.set(sc, sc * 0.5, 1);
    sp.position.set(track.cx + Math.cos(a) * r, y, track.cz + Math.sin(a) * r);
    root.add(sp);
    clouds.push(sp);
  }

  return { root, clouds };
}
