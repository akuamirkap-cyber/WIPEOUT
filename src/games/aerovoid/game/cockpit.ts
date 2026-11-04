import * as THREE from 'three';
import type { Team } from './ship';
import { WindshieldRain } from './windshield';

export interface CockpitData {
  speed: number;
  energy: number;
  boosting: boolean;
  lap: number;
  laps: number;
  pos: number;
  total: number;
  best: number | null;
  last: number | null;
  lapTime: number;
}

/** barrel-distortion strength shared with the post-process shader */
export const FISHEYE = 0.2;

const FONT = '"Rajdhani","Arial Narrow",Arial,sans-serif';

function fmt(t: number | null) {
  if (t === null || !isFinite(t)) return '-:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/* ------------------------------------------------------------------ helpers */

function chamferPts(w: number, h: number, c: number): [number, number][] {
  const x = w / 2,
    y = h / 2;
  return [
    [-x + c, -y],
    [x - c, -y],
    [x, -y + c],
    [x, y - c],
    [x - c, y],
    [-x + c, y],
    [-x, y - c],
    [-x, -y + c],
  ];
}

function shapeFrom(pts: [number, number][]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function hexPts(r: number): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * (Math.PI / 180);
    o.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return o;
}

/** flat ribbon along a 2D polyline (XY plane) */
function ribbon(pts: [number, number][], w: number, closed: boolean): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
    const b = closed ? pts[(i + 1) % n] : pts[Math.min(i + 1, n - 1)];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l,
      ny = dx / l;
    const p = pts[i];
    pos.push(p[0] + (nx * w) / 2, p[1] + (ny * w) / 2, 0, p[0] - (nx * w) / 2, p[1] - (ny * w) / 2, 0);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * 2,
      b = ((i + 1) % n) * 2;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** tapered tube along a smooth curve */
function taperTube(points: THREE.Vector3[], r0: number, r1: number, seg = 48, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const N = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const P = curve.getPoint(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(v)).addScaledVector(frames.binormals[i], Math.sin(v));
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nor.push(N.x, N.y, N.z);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ textures */

function panelTextures() {
  const S = 512;
  const col = document.createElement('canvas');
  col.width = col.height = S;
  const g = col.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, '#2a323d');
  gr.addColorStop(1, '#1a2028');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // brushed grain
  for (let i = 0; i < 1100; i++) {
    const y = Math.random() * S;
    const x = Math.random() * S;
    const l = 30 + Math.random() * 240;
    const a = Math.random() * 0.06;
    g.fillStyle = `rgba(210,225,240,${a})`;
    g.fillRect(x, y, l, 1);
  }
  // panel seams
  const seam = (x0: number, y0: number, w: number, h: number) => {
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(190,215,240,0.16)';
    if (w > h) g.fillRect(x0, y0 + h, w, 1);
    else g.fillRect(x0 + w, y0, 1, h);
  };
  for (const p of [0, 256]) {
    seam(0, p, S, 3);
    seam(p, 0, 3, S);
  }
  seam(0, 128, 256, 2);
  seam(256, 384, 256, 2);
  seam(128, 0, 2, 128);
  seam(384, 256, 2, 128);
  // rivets
  for (const px of [18, 238, 274, 494])
    for (const py of [18, 238, 274, 494]) {
      g.fillStyle = 'rgba(120,140,160,0.7)';
      g.beginPath();
      g.arc(px, py, 3.2, 0, 7);
      g.fill();
    }
  // vents
  for (let i = 0; i < 6; i++) {
    seam(300, 300 + i * 9, 70, 3);
  }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.repeat.set(1.7, 1.7);
  return map;
}

function dirtTexture() {
  const W = 1024,
    H = 576;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  // smudges
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * W,
      y = Math.random() * H,
      r = 60 + Math.random() * 190;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.08;
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine finger-wipe arcs
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.03})`;
    g.lineWidth = 14 + Math.random() * 22;
    g.beginPath();
    const x = Math.random() * W,
      y = Math.random() * H;
    g.arc(x, y, 120 + Math.random() * 260, Math.random() * 6, Math.random() * 6 + 0.9);
    g.stroke();
  }
  // dust specks
  for (let i = 0; i < 380; i++) {
    g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.16})`;
    g.beginPath();
    g.arc(Math.random() * W, Math.random() * H, 0.4 + Math.random() * 1.2, 0, 7);
    g.fill();
  }
  // micro scratches
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.16})`;
    g.lineWidth = 0.4 + Math.random() * 0.7;
    const x = Math.random() * W,
      y = Math.random() * H,
      a = Math.random() * Math.PI,
      l = 14 + Math.random() * 110;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 10, y + Math.sin(a) * l * 0.5 + (Math.random() - 0.5) * 10, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // soft diagonal reflection bands
  const band = (x: number, w: number, a: number) => {
    g.save();
    g.translate(x, 0);
    g.rotate(0.5);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, -400, w, 1600);
    g.restore();
  };
  band(150, 120, 0.05);
  band(290, 24, 0.07);
  band(620, 190, 0.035);
  band(800, 44, 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ screens */

class Screen {
  canvas = document.createElement('canvas');
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  key = '';
  constructor(public w: number, public h: number, pw: number, ph: number, transparent = false) {
    // The screens occupy only a small area on the final display; lower upload size without shrinking their UI layout.
    const scale = 0.75;
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(scale, scale);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent, fog: false })
    );
  }
  frame(accent: string, c = 22) {
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(8,26,40,1)');
    gr.addColorStop(1, 'rgba(3,10,18,1)');
    g.beginPath();
    const p = chamferPts(w - 10, h - 10, c);
    p.forEach(([x, y], i) => (i ? g.lineTo(x + w / 2, y + h / 2) : g.moveTo(x + w / 2, y + h / 2)));
    g.closePath();
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = accent;
    g.shadowColor = accent;
    g.shadowBlur = 12;
    g.stroke();
    g.shadowBlur = 0;
    // inner hairline + corner ticks
    g.strokeStyle = 'rgba(140,200,255,0.18)';
    g.lineWidth = 1.5;
    g.beginPath();
    chamferPts(w - 30, h - 30, c - 6).forEach(([x, y], i) => (i ? g.lineTo(x + w / 2, y + h / 2) : g.moveTo(x + w / 2, y + h / 2)));
    g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(120,200,255,0.045)';
    for (let y = 14; y < h - 10; y += 5) g.fillRect(14, y, w - 28, 1.2);
    // glass sheen
    const sh = g.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(255,255,255,0.07)');
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(8, 8, w - 16, h - 16);
  }
  done() {
    this.tex.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ cockpit */

export class Cockpit {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.04, 40);
  root = new THREE.Group();
  readonly rain: WindshieldRain;
  private sunLight = new THREE.DirectionalLight(0xfff2e0, 2.4);
  private glow = new THREE.Color(0x3fd0ff);
  private primaryMats: THREE.MeshStandardMaterial[] = [];
  private glowMats: THREE.MeshBasicMaterial[] = [];
  private accentCss = '#52d6ff';
  private lapS = new Screen(256, 200, 0.22, 0.172);
  private posS = new Screen(256, 200, 0.22, 0.172);
  private hexS = new Screen(512, 512, 0.4, 0.4, true);
  private bestS = new Screen(512, 256, 0.32, 0.16);
  private nosS = new Screen(512, 256, 0.32, 0.16);
  private dirtMat: THREE.MeshBasicMaterial;
  private sx = 0;
  private sy = 0;
  private last: CockpitData | null = null;
  private envE = new THREE.Euler();
  private qInv = new THREE.Quaternion();

  constructor(env: THREE.Texture) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 1.0;
    this.scene.add(this.camera, this.root, this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x141a24, 0.55));

    // Bump mapping on the near-field floor can produce invalid fragments at grazing angles.
    const panelFlat = new THREE.MeshStandardMaterial({ map: panelTextures(), metalness: 0.75, roughness: 0.42, envMapIntensity: 1.25 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x10151b, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.4 });
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x07090c, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: this.glow.clone().multiplyScalar(2.0), toneMapped: false, side: THREE.DoubleSide });
    this.glowMats.push(glowMat);
    const primary = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, metalness: 0.6, roughness: 0.28, envMapIntensity: 1.6, side: THREE.DoubleSide });
    this.primaryMats.push(primary);

    const bevel = (d: number, b = 0.008) => ({
      depth: d,
      bevelEnabled: true,
      bevelSize: b,
      bevelThickness: b,
      bevelSegments: 3,
      curveSegments: 6,
    });

    /* ---------------- floor / tub (fills gaps below dash & wings) ---------------- */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), panelFlat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.78, -1.0);
    this.root.add(floor);

    /* ---------------- dashboard (stepped: hex centre tallest, LAP/POS beside it, BEST/NITRO low corners) ---------------- */
    const dash = new THREE.Group();
    const top: [number, number][] = [
      [-1.12, -0.05],
      [-0.98, -0.03],
      [-0.64, -0.03],
      [-0.58, 0.1],
      [-0.3, 0.13],
      [-0.2, 0.2],
      [0.2, 0.2],
      [0.3, 0.13],
      [0.58, 0.1],
      [0.64, -0.03],
      [0.98, -0.03],
      [1.12, -0.05],
    ];
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom([[-1.12, -0.5], [1.12, -0.5], ...top.slice().reverse()]), bevel(0.05, 0.01)), panelFlat);
    dash.add(base);
    // glowing step edge
    const edge = new THREE.Mesh(ribbon(top.slice(1, -1), 0.007, false), glowMat);
    edge.position.z = 0.0615;
    dash.add(edge);
    // team-coloured shoulder blades beside the hex (as in the reference)
    for (const sx of [-1, 1]) {
      const blade = new THREE.Mesh(
        new THREE.ShapeGeometry(shapeFrom([[sx * 0.3, 0.132], [sx * 0.56, 0.104], [sx * 0.5, 0.06], [sx * 0.3, 0.085]])),
        primary
      );
      blade.position.z = 0.0618;
      dash.add(blade);
      const ch = new THREE.Mesh(ribbon([[sx * 0.6, -0.27], [sx * 0.76, -0.255], [sx * 0.9, -0.27]], 0.006, false), glowMat);
      ch.position.z = 0.0615;
      dash.add(ch);
    }

    const bezelFor = (w: number, h: number) =>
      new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom(chamferPts(w + 0.034, h + 0.034, 0.026)), bevel(0.06, 0.005)), darkMetal);

    const module = (s: Screen, w: number, h: number, x: number, y: number, rotY: number) => {
      const g = new THREE.Group();
      g.add(bezelFor(w, h));
      s.mesh.position.z = 0.0668;
      g.add(s.mesh);
      const rim = new THREE.Mesh(ribbon(chamferPts(w + 0.044, h + 0.044, 0.028), 0.0036, true), glowMat);
      rim.position.z = 0.0662;
      g.add(rim);
      g.position.set(x, y, 0.04);
      g.rotation.y = rotY;
      dash.add(g);
    };
    module(this.lapS, 0.22, 0.172, -0.43, 0.0, 0.1);
    module(this.posS, 0.22, 0.172, 0.43, 0.0, -0.1);
    module(this.bestS, 0.32, 0.16, -0.74, -0.125, 0.16);
    module(this.nosS, 0.32, 0.16, 0.74, -0.125, -0.16);

    // centre hex module
    const hexG = new THREE.Group();
    hexG.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom(hexPts(0.232)), bevel(0.03, 0.008)), darkMetal));
    const hexRim = new THREE.Mesh(ribbon(hexPts(0.236), 0.0075, true), glowMat);
    hexRim.position.z = 0.0395;
    hexG.add(hexRim);
    const hexRim2 = new THREE.Mesh(ribbon(hexPts(0.258), 0.0035, true), glowMat);
    hexRim2.position.z = 0.012;
    hexG.add(hexRim2);
    this.hexS.mesh.scale.setScalar(1.045);
    this.hexS.mesh.position.z = 0.0405;
    hexG.add(this.hexS.mesh);
    hexG.position.set(0, 0.03, 0.052);
    dash.add(hexG);

    dash.position.set(0, -0.37, -0.95);
    dash.rotation.x = -0.35;
    this.root.add(dash);

    /* ---------------- wings ---------------- */
    const wingPlan: [number, number][] = [
      [0.8, -0.4],
      [2.4, -0.4],
      [2.4, 0.15],
      [1.4, 2.5],
      [1.0, 2.55],
      [0.84, 0.95],
    ];
    const buildWing = (mirror: boolean) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom(wingPlan), bevel(0.05, 0.014)), panelFlat);
      body.geometry.rotateX(-Math.PI / 2);
      g.add(body);
      const top = 0.066;
      // team stripe
      const stripe = new THREE.Mesh(
        new THREE.ShapeGeometry(shapeFrom([[1.2, -0.05], [2.1, -0.05], [1.62, 1.35], [1.38, 1.35]])),
        primary
      );
      stripe.geometry.rotateX(-Math.PI / 2);
      stripe.position.y = top;
      g.add(stripe);
      const stripe2 = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom([[1.28, 1.45], [1.55, 1.45], [1.42, 1.9], [1.3, 1.9]])), primary);
      stripe2.geometry.rotateX(-Math.PI / 2);
      stripe2.position.y = top;
      g.add(stripe2);
      // light strips
      const inner = new THREE.Mesh(ribbon([[0.9, -0.2], [0.92, 0.9], [1.04, 2.4]], 0.014, false), glowMat);
      inner.geometry.rotateX(-Math.PI / 2);
      inner.position.y = top + 0.001;
      g.add(inner);
      const outer = new THREE.Mesh(ribbon([[2.3, 0.0], [1.78, 1.2]], 0.01, false), glowMat);
      outer.geometry.rotateX(-Math.PI / 2);
      outer.position.y = top + 0.001;
      g.add(outer);
      // raised ridge along the inner edge
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 2.7), darkMetal);
      ridge.position.set(0.86, 0.085, -1.05);
      ridge.rotation.y = -0.045;
      g.add(ridge);
      g.position.set(mirror ? -0.3 : 0.3, -0.54, 0.15);
      g.rotation.z = mirror ? -0.05 : 0.05;
      if (mirror) g.scale.x = -1;
      return g;
    };
    this.root.add(buildWing(false), buildWing(true));

    /* ---------------- canopy frame: stable near-field frame over a fisheye world ----------------
       Coordinates are screen positions (-1..1); the overlay no longer passes through world post-processing. */
    const RS = 1.25;
    const HH = Math.tan(THREE.MathUtils.degToRad(39));
    const HWd = (HH * 16) / 9;
    const dome = (ox: number, oy: number) =>
      new THREE.Vector3(ox * HWd, oy * HH, -1).normalize().multiplyScalar(RS);
    const frame = new THREE.Group();
    const T = (pts: [number, number][], r0: number, r1: number, seg = 56) =>
      frame.add(new THREE.Mesh(taperTube(pts.map(([x, y]) => dome(x, y)), r0, r1, seg, 8), strutMat));

    const A: [number, number] = [-0.17, 0.36];
    const B: [number, number] = [0.27, 0.16];

    // short arc joining the two junctions (bulges upward)
    T([A, [-0.01, 0.375], [0.15, 0.315], B], 0.0042, 0.0042, 48);
    // A -> up to the top-left
    T([A, [-0.24, 0.6], [-0.33, 0.84], [-0.42, 1.0], [-0.47, 1.12]], 0.0052, 0.0075, 40);
    // B -> long strut up to the top-right (gets heavier toward the edge)
    T([B, [0.46, 0.375], [0.69, 0.7], [0.9, 1.0], [0.96, 1.1]], 0.0058, 0.0125, 48);
    // A -> down to the dashboard
    T([A, [-0.17, 0.0], [-0.16, -0.5], [-0.14, -1.0]], 0.0052, 0.0105, 40);
    // B -> down to the dashboard
    T([B, [0.224, -0.25], [0.185, -0.725], [0.15, -1.0]], 0.0052, 0.0105, 40);

    for (const [x, y] of [A, B]) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 16, 12), strutMat);
      j.position.copy(dome(x, y));
      frame.add(j);
    }
    this.root.add(frame);

    /* ---------------- glass ---------------- */
    const glassGeo = new THREE.SphereGeometry(1.9, 72, 48);
    const glassPos = new THREE.Vector3(0, -0.15, 0.5);
    const refl = new THREE.Mesh(
      glassGeo,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0,
        roughness: 0.04,
        envMapIntensity: 0.55,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    refl.position.copy(glassPos);
    refl.renderOrder = 40;
    const tint = new THREE.Mesh(
      glassGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: { uTint: { value: new THREE.Color(0.2, 0.4, 0.55) } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position,1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            vP = position;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTint;
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
            float top = smoothstep(0.05, 0.95, normalize(vP).y);
            float a = 0.008 + f * 0.16 + top * 0.04;
            vec3 c = mix(uTint * 0.7, vec3(0.7, 0.95, 1.0), f * 0.8);
            gl_FragColor = vec4(c, a);
          }`,
      })
    );
    tint.position.copy(glassPos);
    tint.renderOrder = 41;
    this.root.add(refl, tint);

    // dust / scratches / reflection bands, brightens when facing the sun
    this.dirtMat = new THREE.MeshBasicMaterial({
      map: dirtTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.dirtMat.color.setScalar(0.3);
    const h = 2 * 1.5 * Math.tan(THREE.MathUtils.degToRad(39)) * 1.03;
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(h * (16 / 9), h), this.dirtMat);
    dirt.position.z = -1.5;
    dirt.renderOrder = 42;
    this.camera.add(dirt);
    this.rain = new WindshieldRain(this.camera);

    this.setTeam({ name: '', primary: 0x1f6fe0, secondary: 0xffd21a, glow: 0x3fd0ff });
    this.draw({ speed: 0, energy: 100, boosting: false, lap: 1, laps: 3, pos: 1, total: 8, best: null, last: null, lapTime: 0 }, true);
    // redraw once the webfont is ready so the dash text uses the right face
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.load('700 40px "Rajdhani"').then(() => {
        if (this.last) this.draw(this.last, true);
      });
    }
  }

  setTeam(team: Team) {
    this.glow.set(team.glow);
    this.primaryMats.forEach((m) => m.color.set(team.primary));
    this.glowMats.forEach((m) => m.color.copy(this.glow).multiplyScalar(2.0));
    this.accentCss = '#' + new THREE.Color(team.glow).getHexString();
    if (this.last) this.draw(this.last, true);
  }

  updateRain(dt: number, level: number, speed: number) {
    this.rain.update(dt, level, speed);
  }

  easeRain() {
    this.rain.easeRain();
  }

  dispose() {
    this.rain.dispose();
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setMotion(dx: number, dy: number, dt: number) {
    const k = 1 - Math.exp(-10 * dt);
    this.sx += (dx - this.sx) * k;
    this.sy += (dy - this.sy) * k;
    this.root.position.set(this.sx, this.sy, 0);
    this.root.rotation.z = 0;
  }

  setLighting(sunDirView: THREE.Vector3, camQ: THREE.Quaternion) {
    this.sunLight.position.copy(sunDirView).multiplyScalar(6);
    // make reflections follow the real world orientation
    this.qInv.copy(camQ).invert();
    this.envE.setFromQuaternion(this.qInv, 'ZYX');
    this.scene.environmentRotation.set(this.envE.x, this.envE.y, this.envE.z, 'XYZ');
    const facing = Math.max(0, -sunDirView.z);
    const glare = THREE.MathUtils.smoothstep(facing, 0.45, 0.97);
    this.dirtMat.color.setScalar(0.26 + glare * 0.95);
  }

  setScreens(d: CockpitData) {
    this.draw(d, false);
  }

  private draw(d: CockpitData, force: boolean) {
    this.last = d;
    const A = this.accentCss;
    const amber = '#ffa21a';
    const yellow = '#e8ff3a';

    const bigNum = (s: Screen, label: string, value: number, total: number) => {
      s.frame(yellow, 20);
      const g = s.g;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#8fb4dd';
      g.font = `700 30px ${FONT}`;
      g.fillText(label, 30, 52);
      // chevron icon
      g.fillStyle = yellow;
      g.beginPath();
      g.moveTo(206, 28);
      g.lineTo(226, 44);
      g.lineTo(206, 60);
      g.lineTo(206, 52);
      g.lineTo(214, 44);
      g.lineTo(206, 36);
      g.closePath();
      g.fill();
      g.shadowColor = yellow;
      g.shadowBlur = 20;
      g.font = `italic 700 126px ${FONT}`;
      g.fillText(`${value}`, 52, 164);
      g.shadowBlur = 0;
      g.fillStyle = '#b6c8dc';
      g.font = `600 34px ${FONT}`;
      g.fillText(`/${total}`, 166, 164);
      s.done();
    };

    let k = `${d.lap}/${d.laps}`;
    if (force || k !== this.lapS.key) {
      this.lapS.key = k;
      bigNum(this.lapS, 'LAP', d.lap, d.laps);
    }
    k = `${d.pos}/${d.total}`;
    if (force || k !== this.posS.key) {
      this.posS.key = k;
      bigNum(this.posS, 'POS', d.pos, d.total);
    }

    // SPEED hex
    k = `${d.speed}|${Math.round(d.energy / 3.4)}|${d.boosting ? 1 : 0}`;
    if (force || k !== this.hexS.key) {
      this.hexS.key = k;
      const s = this.hexS;
      const g = s.g;
      g.clearRect(0, 0, 512, 512);
      const hex = (r: number) => {
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (-90 + i * 60) * (Math.PI / 180);
          const x = 256 + Math.cos(a) * r,
            y = 256 + Math.sin(a) * r;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
      };
      hex(244);
      const gr = g.createRadialGradient(256, 256, 20, 256, 256, 250);
      gr.addColorStop(0, 'rgba(12,38,58,1)');
      gr.addColorStop(1, 'rgba(3,10,18,1)');
      g.fillStyle = gr;
      g.fill();
      const col = d.boosting ? amber : A;
      g.lineWidth = 11;
      g.strokeStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.stroke();
      g.shadowBlur = 0;
      hex(222);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(140,200,255,0.22)';
      g.stroke();
      // nitro arc ticks
      const N = 30;
      const on = Math.round((d.energy / 100) * N);
      for (let i = 0; i < N; i++) {
        const a = (150 + (i / (N - 1)) * 240) * (Math.PI / 180);
        g.strokeStyle = i < on ? col : 'rgba(150,190,230,0.18)';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(256 + Math.cos(a) * 172, 256 + Math.sin(a) * 172);
        g.lineTo(256 + Math.cos(a) * 206, 256 + Math.sin(a) * 206);
        g.stroke();
      }
      g.textAlign = 'center';
      g.fillStyle = '#8fb4dd';
      g.font = `700 32px ${FONT}`;
      g.fillText('SPEED', 256, 150);
      g.fillStyle = '#fff';
      g.shadowColor = col;
      g.shadowBlur = 22;
      g.font = `italic 700 148px ${FONT}`;
      g.fillText(`${d.speed}`, 256, 282);
      g.shadowBlur = 0;
      g.fillStyle = '#9ec6ee';
      g.font = `700 38px ${FONT}`;
      g.fillText('KM/H', 256, 334);
      g.textAlign = 'left';
      s.done();
    }

    // BEST / LAST / LAP
    k = `${fmt(d.best)}|${fmt(d.last)}|${fmt(d.lapTime)}`;
    if (force || k !== this.bestS.key) {
      this.bestS.key = k;
      const s = this.bestS;
      s.frame(A, 24);
      const g = s.g;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#8fb4dd';
      g.font = `700 34px ${FONT}`;
      g.fillText('BEST', 36, 82);
      g.fillText('LAST', 36, 140);
      g.fillStyle = '#fff';
      g.font = `600 50px ${FONT}`;
      g.fillText(fmt(d.best), 170, 84);
      g.fillStyle = '#c0d0e0';
      g.font = `600 44px ${FONT}`;
      g.fillText(fmt(d.last), 170, 142);
      g.fillStyle = yellow;
      g.shadowColor = yellow;
      g.shadowBlur = 10;
      g.font = `700 60px ${FONT}`;
      g.fillText(fmt(d.lapTime), 170, 214);
      g.shadowBlur = 0;
      g.fillStyle = '#8fb4dd';
      g.font = `700 34px ${FONT}`;
      g.fillText('LAP', 36, 212);
      s.done();
    }

    // NITRO
    k = `${Math.round(d.energy)}|${d.boosting ? 1 : 0}`;
    if (force || k !== this.nosS.key) {
      this.nosS.key = k;
      const s = this.nosS;
      const col = d.boosting ? amber : A;
      s.frame(col, 24);
      const g = s.g;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#8fb4dd';
      g.font = `700 36px ${FONT}`;
      g.fillText('NITRO', 36, 70);
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.font = `italic 700 62px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(`${Math.round(d.energy)}%`, 476, 74);
      g.textAlign = 'left';
      g.shadowBlur = 0;
      const N = 14;
      const on = Math.round((d.energy / 100) * N);
      for (let i = 0; i < N; i++) {
        const x = 36 + i * 31.4;
        g.save();
        g.transform(1, 0, -0.3, 1, 0, 0);
        g.fillStyle = i < on ? col : 'rgba(150,190,230,0.18)';
        if (i < on) {
          g.shadowColor = col;
          g.shadowBlur = 12;
        }
        g.fillRect(x + 40, 112, 22, 100);
        g.restore();
      }
      s.done();
    }
  }
}
