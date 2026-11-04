import * as THREE from "three";
import { mulberry32 } from "./utils";

type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  } else {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

function speckle(g: Ctx, w: number, h: number, n: number, seed: number, amt = 0.1) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const light = r() > 0.5;
    g.fillStyle = light ? `rgba(255,255,255,${r() * amt})` : `rgba(0,0,0,${r() * amt * 1.6})`;
    const s = 1 + r() * 3;
    g.fillRect(x, y, s, s);
  }
}

/** Triangular steel lattice (truss) */
function truss(g: Ctx, x: number, y: number, w: number, h: number, tri: number, line: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const bg = g.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, "#0b0f19");
  bg.addColorStop(1, "#151b2b");
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  const rows = Math.ceil(h / tri) + 1;
  for (let j = 0; j < rows; j++) {
    const y0 = y + j * tri;
    const y1 = y0 + tri;
    // inner depth shading of triangles
    for (let xx = x - tri; xx < x + w + tri; xx += tri) {
      g.fillStyle = "rgba(40,70,140,0.22)";
      g.beginPath();
      g.moveTo(xx, y1);
      g.lineTo(xx + tri / 2, y0);
      g.lineTo(xx + tri, y1);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = "#7d8da6";
    g.lineWidth = line;
    g.lineJoin = "miter";
    g.beginPath();
    g.moveTo(x - tri, y1);
    for (let xx = x - tri; xx < x + w + tri; xx += tri) {
      g.lineTo(xx + tri / 2, y0);
      g.lineTo(xx + tri, y1);
    }
    g.stroke();
    g.strokeStyle = "#c3cfdf";
    g.lineWidth = line * 0.35;
    g.beginPath();
    g.moveTo(x - tri, y1 - line * 0.3);
    for (let xx = x - tri; xx < x + w + tri; xx += tri) {
      g.lineTo(xx + tri / 2, y0 - line * 0.3);
      g.lineTo(xx + tri, y1 - line * 0.3);
    }
    g.stroke();
    // rail
    g.fillStyle = "#6b7a92";
    g.fillRect(x, y1 - line / 2, w, line);
  }
  g.restore();
}

function hazard(g: Ctx, x: number, y: number, w: number, h: number, step: number, c1 = "#f3b90a", c2 = "#0e0f12") {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = c2;
  g.fillRect(x, y, w, h);
  g.fillStyle = c1;
  for (let i = -h; i < w + h; i += step * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + step, y + h);
    g.lineTo(x + i + step + h, y);
    g.lineTo(x + i + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

export function roadTexture() {
  const S = 2048;
  const [c, g] = mk(S, S);
  const bg = g.createLinearGradient(0, 0, S, 0);
  bg.addColorStop(0, "#66563a");
  bg.addColorStop(0.5, "#8a7650");
  bg.addColorStop(1, "#66563a");
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 120000, 11, 0.12);

  // large worn patches for natural variation
  const rp = mulberry32(41);
  for (let i = 0; i < 90; i++) {
    const x = S * (0.2 + rp() * 0.6);
    const y = rp() * S;
    const rr = 40 + rp() * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const dark = rp() > 0.5;
    gr.addColorStop(0, dark ? "rgba(30,24,16,0.18)" : "rgba(210,190,140,0.10)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }

  // panel seams
  for (let k = 0; k < 4; k++) {
    const y = (k * S) / 4;
    g.fillStyle = "rgba(10,8,5,0.7)";
    g.fillRect(0, y - 3, S, 6);
    g.fillStyle = "rgba(255,235,190,0.16)";
    g.fillRect(0, y + 3, S, 2);
    for (let x = 60; x < S; x += 120) {
      g.fillStyle = "rgba(200,185,150,0.35)";
      g.beginPath();
      g.arc(x, y + 14, 3, 0, 7);
      g.fill();
    }
  }
  // long tyre scuffs
  const r = mulberry32(23);
  for (let i = 0; i < 80; i++) {
    const x = S * (0.2 + r() * 0.6);
    g.fillStyle = `rgba(15,10,5,${0.05 + r() * 0.08})`;
    g.fillRect(x, 0, 5 + r() * 36, S);
  }

  // side truss strips (blue-steel lattice)
  const sw = S * 0.16;
  truss(g, 0, 0, sw, S, 128, 9);
  truss(g, S - sw, 0, sw, S, 128, 9);
  g.fillStyle = "#b9c3d3";
  g.fillRect(0, 0, 14, S);
  g.fillRect(S - 14, 0, 14, S);
  g.fillStyle = "#d9dfe9";
  g.fillRect(sw - 10, 0, 10, S);
  g.fillRect(S - sw, 0, 10, S);
  hazard(g, sw, 0, 34, S, 34);
  hazard(g, S - sw - 34, 0, 34, S, 34);

  // wide yellow cross bands (like the reference deck)
  g.fillStyle = "rgba(226,170,20,0.88)";
  for (let k = 0; k < 4; k++) {
    g.fillRect(sw + 40, k * (S / 4) + S * 0.1, S - sw * 2 - 80, 96);
  }
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let k = 0; k < 4; k++) g.fillRect(sw + 40, k * (S / 4) + S * 0.1 + 96, S - sw * 2 - 80, 8);

  // lane dashes
  g.fillStyle = "rgba(240,200,40,0.95)";
  for (const u of [0.36, 0.64]) {
    for (let y = 0; y < S; y += 384) {
      g.fillRect(S * u - 9, y + 200, 18, 150);
    }
  }
  g.fillStyle = "rgba(235,235,225,0.5)";
  g.fillRect(S * 0.5 - 18, 0, 6, S);
  g.fillRect(S * 0.5 + 12, 0, 6, S);

  // arrows
  const arrow = (cx: number, cy: number, sc: number, col: string) => {
    g.save();
    g.translate(cx, cy);
    g.scale(sc, sc);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -150);
    g.lineTo(110, 0);
    g.lineTo(52, 0);
    g.lineTo(52, 130);
    g.lineTo(-52, 130);
    g.lineTo(-52, 0);
    g.lineTo(-110, 0);
    g.closePath();
    g.fill();
    g.restore();
  };
  arrow(S * 0.25, S * 0.5, 1.2, "rgba(236,222,150,0.7)");
  arrow(S * 0.75, S * 0.5, 1.2, "rgba(236,222,150,0.7)");

  // wear
  speckle(g, S, S, 50000, 31, 0.1);
  const eg = g.createLinearGradient(0, 0, S, 0);
  eg.addColorStop(0, "rgba(0,0,0,0.3)");
  eg.addColorStop(0.08, "rgba(0,0,0,0)");
  eg.addColorStop(0.92, "rgba(0,0,0,0)");
  eg.addColorStop(1, "rgba(0,0,0,0.3)");
  g.fillStyle = eg;
  g.fillRect(0, 0, S, S);
  return tex(c);
}

/** Wall inner face: x = along track (14 units), y = height (7 units) */
export function wallTexture() {
  const W = 2048;
  const H = 1024;
  const [c, g] = mk(W, H);
  // top band tan concrete (34%)
  const topH = H * 0.34;
  const tg = g.createLinearGradient(0, 0, 0, topH);
  tg.addColorStop(0, "#b3a88f");
  tg.addColorStop(1, "#8d836d");
  g.fillStyle = tg;
  g.fillRect(0, 0, W, topH);
  speckle(g, W, topH, 12000, 5, 0.12);
  // dark blue slots
  for (let x = 90; x < W; x += 256) {
    const sg = g.createLinearGradient(0, 40, 0, topH - 40);
    sg.addColorStop(0, "#1a2060");
    sg.addColorStop(1, "#0b0e30");
    g.fillStyle = sg;
    g.fillRect(x, 50, 120, topH - 110);
    g.strokeStyle = "rgba(160,170,230,0.5)";
    g.lineWidth = 4;
    g.strokeRect(x, 50, 120, topH - 110);
    g.fillStyle = "rgba(120,150,255,0.25)";
    g.fillRect(x + 8, 58, 30, topH - 126);
  }
  g.fillStyle = "#3a352b";
  g.fillRect(0, topH - 14, W, 14);

  // lower chevron zone
  const lh = H - topH;
  g.fillStyle = "#101218";
  g.fillRect(0, topH, W, lh);
  const grd = g.createLinearGradient(0, topH, 0, H);
  grd.addColorStop(0, "rgba(40,45,60,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = grd;
  g.fillRect(0, topH, W, lh);

  // chevrons pointing +x
  g.save();
  g.beginPath();
  g.rect(0, topH + 24, W, lh - 100);
  g.clip();
  for (let cx = 0; cx < W + 400; cx += 512) {
    g.fillStyle = "#f3b30a";
    g.beginPath();
    const y0 = topH + 24;
    const y1 = H - 76;
    const ym = (y0 + y1) / 2;
    g.moveTo(cx, y0);
    g.lineTo(cx + 110, y0);
    g.lineTo(cx + 300, ym);
    g.lineTo(cx + 110, y1);
    g.lineTo(cx, y1);
    g.lineTo(cx + 190, ym);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(cx + 150, y0);
    g.lineTo(cx + 190, y0);
    g.lineTo(cx + 380, ym);
    g.lineTo(cx + 190, y1);
    g.lineTo(cx + 150, y1);
    g.lineTo(cx + 340, ym);
    g.closePath();
    g.fill();
  }
  // scan stripes
  g.fillStyle = "#101218";
  for (let y = topH; y < H; y += 26) g.fillRect(0, y, W, 9);
  g.restore();
  // base rail
  g.fillStyle = "#59627a";
  g.fillRect(0, H - 56, W, 12);
  g.fillStyle = "#1b1f2b";
  g.fillRect(0, H - 44, W, 44);
  speckle(g, W, H, 40000, 9, 0.1);
  return tex(c);
}

/** Pad truss: used on raised launch pads */
export function trussTexture() {
  const S = 1024;
  const [c, g] = mk(S, S);
  g.fillStyle = "#e6e2cf";
  g.fillRect(0, 0, S, S);
  const m = 46;
  truss(g, m, m, S - m * 2, S - m * 2, 128, 10);
  g.strokeStyle = "#b8b39b";
  g.lineWidth = 6;
  g.strokeRect(m, m, S - m * 2, S - m * 2);
  speckle(g, S, S, 30000, 4, 0.12);
  return tex(c);
}

export function facadeTexture() {
  const W = 1024;
  const H = 512; // 16 x 8 units
  const [c, g] = mk(W, H);
  const r = mulberry32(77);
  // glass windows
  const gh = H * 0.5;
  const gg = g.createLinearGradient(0, 0, 0, gh);
  gg.addColorStop(0, "#5b86c9");
  gg.addColorStop(1, "#2d4f93");
  g.fillStyle = gg;
  g.fillRect(0, 0, W, gh);
  // reflections
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
    g.beginPath();
    const x = r() * W;
    g.moveTo(x, 0);
    g.lineTo(x + 80, 0);
    g.lineTo(x - 60, gh);
    g.lineTo(x - 140, gh);
    g.fill();
  }
  g.fillStyle = "#cbd5e6";
  for (let x = 0; x < W; x += 128) g.fillRect(x - 3, 0, 6, gh);
  g.fillRect(0, gh * 0.5 - 2, W, 4);
  // interior lights
  for (let x = 12; x < W; x += 128) {
    g.fillStyle = "rgba(255,240,200,0.35)";
    g.fillRect(x, gh - 18, 100, 10);
  }
  // crowd zone
  const cy0 = gh;
  const ch = H * 0.26;
  g.fillStyle = "#12182a";
  g.fillRect(0, cy0, W, ch);
  const cols = ["#e8453c", "#f2b705", "#3c7be8", "#f2f2f2", "#2fb36b", "#d65bd6", "#ff8a1f", "#222a3a"];
  for (let row = 0; row < 3; row++) {
    for (let x = 4 + (row % 2) * 7; x < W; x += 14) {
      const y = cy0 + 18 + row * 22;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x, y + 6, 11, 14);
      g.fillStyle = r() > 0.5 ? "#e0b393" : "#8a5a3c";
      g.beginPath();
      g.arc(x + 5.5, y + 3, 4.6, 0, 7);
      g.fill();
    }
  }
  // rail
  const ry = cy0 + ch;
  g.fillStyle = "#1b2132";
  g.fillRect(0, ry, W, H * 0.12);
  g.fillStyle = "#e4eaf3";
  g.fillRect(0, ry, W, 6);
  g.fillStyle = "#8da0bd";
  for (let x = 0; x < W; x += 24) g.fillRect(x, ry + 6, 3, H * 0.12 - 6);
  // slab
  const sy = ry + H * 0.12;
  const sg = g.createLinearGradient(0, sy, 0, H);
  sg.addColorStop(0, "#8e96a6");
  sg.addColorStop(1, "#5d6574");
  g.fillStyle = sg;
  g.fillRect(0, sy, W, H - sy);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillRect(0, H - 8, W, 8);
  speckle(g, W, H, 15000, 8, 0.08);
  return tex(c);
}

export function crowdTexture() {
  const S = 512;
  const [c, g] = mk(S, S);
  g.fillStyle = "#151b2c";
  g.fillRect(0, 0, S, S);
  const r = mulberry32(5);
  const cols = ["#e8453c", "#f2b705", "#3c7be8", "#f2f2f2", "#2fb36b", "#d65bd6", "#ff8a1f", "#8892a6"];
  for (let row = 0; row < 16; row++) {
    g.fillStyle = row % 2 ? "#1d2538" : "#222b41";
    g.fillRect(0, row * 32, S, 32);
    for (let x = 3 + (row % 2) * 8; x < S; x += 16) {
      if (r() < 0.12) continue;
      const y = row * 32 + 4;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x, y + 12, 12, 16);
      g.fillStyle = r() > 0.5 ? "#e6bc9b" : "#8d5d40";
      g.beginPath();
      g.arc(x + 6, y + 8, 5.4, 0, 7);
      g.fill();
    }
  }
  return tex(c);
}

export function adTexture(kind: number) {
  const W = 2048;
  const H = 512;
  const [c, g] = mk(W, H);
  const themes = [
    { t: "SYNCHRO", sub: "KINETIC SYSTEMS", a: "#ffffff", b: "#d9dde6", f: "#1b2335", acc: "#e7352b" },
    { t: "VEKTOR", sub: "HYPER-ALLOY DRIVES", a: "#101828", b: "#1c2b4d", f: "#ffffff", acc: "#12d0ff" },
    { t: "AETHER", sub: "ANTI-GRAVITY RACING LEAGUE", a: "#f3b90a", b: "#e29b00", f: "#101218", acc: "#101218" },
    { t: "NOVA-G", sub: "ENERGY CELLS", a: "#5b1fa8", b: "#2a0f5e", f: "#ffffff", acc: "#ff3df0" },
    { t: "QIREX", sub: "FLUX DYNAMICS", a: "#0e6f5a", b: "#063d33", f: "#e9fff9", acc: "#7dffd0" },
  ];
  const th = themes[kind % themes.length];
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, th.a);
  bg.addColorStop(1, th.b);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // stripes
  g.fillStyle = th.acc;
  g.globalAlpha = 0.9;
  g.fillRect(0, 0, W, 22);
  g.fillRect(0, H - 22, W, 22);
  g.globalAlpha = 0.15;
  for (let x = -200; x < W; x += 90) {
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + 60, H);
    g.lineTo(x + 360, 0);
    g.lineTo(x + 300, 0);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = th.f;
  g.font = "italic 900 300px Impact, 'Arial Black', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(th.t, 140, H / 2 - 14);
  g.font = "700 62px 'Arial Black', Arial, sans-serif";
  g.fillStyle = th.acc;
  g.fillText(th.sub, 150, H - 80);
  // arrow glyph
  g.fillStyle = th.acc;
  g.beginPath();
  g.moveTo(W - 330, 100);
  g.lineTo(W - 150, H / 2);
  g.lineTo(W - 330, H - 100);
  g.lineTo(W - 280, H - 100);
  g.lineTo(W - 100, H / 2);
  g.lineTo(W - 280, 100);
  g.fill();
  speckle(g, W, H, 20000, 6, 0.06);
  return tex(c, false);
}

export function bigLetterTexture(text: string) {
  const W = 2048;
  const H = 512;
  const [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  g.font = "900 470px Impact, 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // outline layers
  g.lineJoin = "round";
  g.strokeStyle = "#0a1a4a";
  g.lineWidth = 38;
  g.strokeText(text, W / 2, H / 2 + 10);
  g.strokeStyle = "#8fb4ff";
  g.lineWidth = 18;
  g.strokeText(text, W / 2, H / 2 + 10);
  const lg = g.createLinearGradient(0, 40, 0, H - 40);
  lg.addColorStop(0, "#3f78e8");
  lg.addColorStop(1, "#1d44b4");
  g.fillStyle = lg;
  g.fillText(text, W / 2, H / 2 + 10);
  // tile pattern inside letters
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(10,25,90,0.45)";
  for (let y = 0; y < H; y += 10) g.fillRect(0, y, W, 2);
  for (let x = 0; x < W; x += 10) g.fillRect(x, 0, 2, H);
  g.globalCompositeOperation = "source-over";
  return tex(c, false);
}

export function hazardTexture() {
  const S = 512;
  const [c, g] = mk(S, S);
  hazard(g, 0, 0, S, S, 64, "#e8b50a", "#1a1a1d");
  speckle(g, S, S, 8000, 2, 0.1);
  return tex(c);
}

export function towerTexture() {
  const W = 512;
  const H = 1024;
  const [c, g] = mk(W, H);
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, "#74829a");
  bg.addColorStop(0.5, "#a4b0c4");
  bg.addColorStop(1, "#6a7890");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#1e3c80";
  for (let y = 20; y < H; y += 64) {
    for (let x = 12; x < W; x += 64) {
      g.fillRect(x, y, 44, 34);
    }
  }
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let y = 20; y < H; y += 64) g.fillRect(0, y - 6, W, 3);
  speckle(g, W, H, 20000, 12, 0.1);
  return tex(c);
}

export class LedDisplay {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  texture: THREE.CanvasTexture;
  private last = "";
  constructor() {
    const [c, g] = mk(1024, 256);
    this.canvas = c;
    this.ctx = g;
    this.texture = tex(c, false);
    this.draw(-1);
  }
  /** step: -1 idle, 3,2,1 countdown, 0 GO */
  draw(step: number, text?: string) {
    const key = step + (text ?? "");
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx;
    g.fillStyle = "#06070a";
    g.fillRect(0, 0, 1024, 256);
    g.font = "900 220px 'Courier New', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const digits = ["3", "2", "1"];
    if (step === 0) {
      g.fillStyle = "#38ff7a";
      g.shadowColor = "#38ff7a";
      g.shadowBlur = 40;
      g.fillText("GO", 512, 138);
      g.shadowBlur = 0;
    } else if (text) {
      g.fillStyle = "#ff3b2e";
      g.shadowColor = "#ff3b2e";
      g.shadowBlur = 30;
      g.font = "900 150px 'Courier New', monospace";
      g.fillText(text, 512, 138);
      g.shadowBlur = 0;
    } else {
      digits.forEach((d, i) => {
        const on = step > 0 && Number(d) >= step;
        g.fillStyle = on ? "#ff2a1d" : "#3a0d0b";
        if (on) {
          g.shadowColor = "#ff2a1d";
          g.shadowBlur = 36;
        }
        g.fillText(d, 220 + i * 292, 138);
        g.shadowBlur = 0;
      });
    }
    // dot-matrix overlay
    g.fillStyle = "rgba(0,0,0,0.55)";
    for (let y = 0; y < 256; y += 8) g.fillRect(0, y, 1024, 2);
    for (let x = 0; x < 1024; x += 8) g.fillRect(x, 0, 2, 256);
    this.texture.needsUpdate = true;
  }
}

export function boostTexture() {
  const W = 256;
  const H = 512;
  const [c, g] = mk(W, H);
  g.fillStyle = "#04121c";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#31e8ff";
  g.lineWidth = 26;
  g.lineJoin = "miter";
  for (let k = 0; k < 3; k++) {
    const y = 90 + k * 140;
    g.beginPath();
    g.moveTo(24, y + 90);
    g.lineTo(W / 2, y - 20);
    g.lineTo(W - 24, y + 90);
    g.stroke();
  }
  g.strokeStyle = "#a6f6ff";
  g.lineWidth = 8;
  g.strokeRect(6, 6, W - 12, H - 12);
  return tex(c);
}

export function checkerTexture() {
  const [c, g] = mk(1024, 128);
  const n = 8;
  const s = 128 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < 1024 / s; x++) {
      g.fillStyle = (x + y) % 2 ? "#0c0d10" : "#f2f2f2";
      g.fillRect(x * s, y * s, s, s);
    }
  }
  return tex(c, false);
}

export function slotTexture() {
  const W = 256;
  const H = 384;
  const [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(245,245,245,0.9)";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(10, 60);
  g.lineTo(10, 10);
  g.lineTo(W - 10, 10);
  g.lineTo(W - 10, 60);
  g.moveTo(10, H - 60);
  g.lineTo(10, H - 10);
  g.lineTo(W - 10, H - 10);
  g.lineTo(W - 10, H - 60);
  g.stroke();
  g.fillStyle = "rgba(243,185,10,0.8)";
  g.beginPath();
  g.moveTo(W / 2, 110);
  g.lineTo(W / 2 + 50, 190);
  g.lineTo(W / 2 + 18, 190);
  g.lineTo(W / 2 + 18, 280);
  g.lineTo(W / 2 - 18, 280);
  g.lineTo(W / 2 - 18, 190);
  g.lineTo(W / 2 - 50, 190);
  g.fill();
  return tex(c, false);
}

export function bigArrowTexture() {
  const W = 512;
  const H = 512;
  const [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgba(240,224,150,0.92)";
  g.beginPath();
  g.moveTo(W / 2, 30);
  g.lineTo(W - 40, 270);
  g.lineTo(W / 2 + 90, 270);
  g.lineTo(W / 2 + 90, H - 30);
  g.lineTo(W / 2 - 90, H - 30);
  g.lineTo(W / 2 - 90, 270);
  g.lineTo(40, 270);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = "destination-out";
  const r = mulberry32(9);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.5})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 8, 2 + r() * 8);
  }
  return tex(c, false);
}

export function glowTexture(inner = "255,255,255", falloff = 2) {
  const S = 256;
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, `rgba(${inner},1)`);
  gr.addColorStop(0.25 / falloff, `rgba(${inner},0.55)`);
  gr.addColorStop(0.6, `rgba(${inner},0.12)`);
  gr.addColorStop(1, `rgba(${inner},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return tex(c, false);
}

export function blobShadowTexture() {
  const S = 256;
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(0,0,0,0.75)");
  gr.addColorStop(0.5, "rgba(0,0,0,0.35)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return tex(c, false);
}

export function grainTexture() {
  const S = 512;
  const [c, g] = mk(S, S);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  const r = mulberry32(99);
  for (let i = 0; i < 90000; i++) {
    const v = 190 + Math.floor(r() * 65);
    g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * S, r() * S, s, s);
  }
  return tex(c);
}

export function liveryTexture(primary: string, accent: string, number: string) {
  const W = 256;
  const H = 512;
  const [c, g] = mk(W, H);
  g.fillStyle = primary;
  g.fillRect(0, 0, W, H);
  // top (u = 0.5) racing stripes
  g.fillStyle = accent;
  g.fillRect(W * 0.42, 0, W * 0.16, H);
  g.fillStyle = "#f4f6fa";
  g.fillRect(W * 0.395, 0, W * 0.015, H);
  g.fillRect(W * 0.59, 0, W * 0.015, H);
  // cross band
  g.fillStyle = "rgba(10,12,18,0.85)";
  g.fillRect(0, H * 0.08, W, H * 0.03);
  g.fillRect(0, H * 0.88, W, H * 0.04);
  // number
  g.save();
  g.translate(W * 0.5, H * 0.58);
  g.rotate(-Math.PI / 2);
  g.fillStyle = "#0b0e16";
  g.font = "900 70px Impact, 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(number, 0, 0);
  g.restore();
  speckle(g, W, H, 3000, 2, 0.06);
  return tex(c, true);
}

export function portalSignTexture(title: string, sub: string) {
  const W = 2048;
  const H = 256;
  const [c, g] = mk(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1b2236");
  bg.addColorStop(1, "#0c101c");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  hazard(g, 0, 0, W, 26, 26, "#f3b90a", "#0e0f12");
  hazard(g, 0, H - 26, W, 26, 26, "#f3b90a", "#0e0f12");
  g.font = "900 150px Impact, 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#0a0f1c";
  g.fillText(title, W / 2 + 4, H / 2 - 10 + 4);
  const tg = g.createLinearGradient(0, 50, 0, 200);
  tg.addColorStop(0, "#9ff3ff");
  tg.addColorStop(1, "#2fb8ff");
  g.fillStyle = tg;
  g.fillText(title, W / 2, H / 2 - 10);
  g.font = "700 36px 'Arial Black', Arial, sans-serif";
  g.fillStyle = "#f3d34a";
  g.fillText(sub, W / 2, H - 52);
  // arrows
  g.fillStyle = "#f3b90a";
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = W / 2 + sx * (760 + k * 60);
      g.beginPath();
      g.moveTo(x - sx * 24, 70);
      g.lineTo(x + sx * 24, H / 2);
      g.lineTo(x - sx * 24, H - 70);
      g.lineTo(x - sx * 4, H - 70);
      g.lineTo(x + sx * 44, H / 2);
      g.lineTo(x - sx * 4, 70);
      g.fill();
    }
  }
  return tex(c, false);
}
