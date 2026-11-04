import * as THREE from "three";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
}

const cache: Record<string, THREE.Texture> = {};
function memo(key: string, fn: () => THREE.Texture) {
  if (!cache[key]) cache[key] = fn();
  return cache[key];
}

/** Road surface: u across (0..1), v along */
export const roadTexture = () =>
  memo("road", () => {
    const W = 512, H = 512;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#5a5450";
    ctx.fillRect(0, 0, W, H);
    noise(ctx, W, H, 6000, 0.12);
    // subtle lane panels
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 4) * i, 0);
      ctx.lineTo((W / 4) * i, H);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    // edge hazard stripes
    const edge = 26;
    const drawEdge = (x0: number) => {
      ctx.fillStyle = "#d9a21a";
      ctx.fillRect(x0, 0, edge, H);
      ctx.fillStyle = "#15161a";
      for (let y = 0; y < H; y += 64) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + edge, y + 20);
        ctx.lineTo(x0 + edge, y + 52);
        ctx.lineTo(x0, y + 32);
        ctx.closePath();
        ctx.fill();
      }
    };
    drawEdge(0);
    drawEdge(W - edge);
    // center dashed line
    ctx.fillStyle = "rgba(230,230,235,0.55)";
    for (let y = 0; y < H; y += 128) ctx.fillRect(W / 2 - 3, y, 6, 64);
    noise(ctx, W, H, 2500, 0.08);
    return finish(c, 1, 1);
  });

/** Side wall with yellow chevrons pointing forward (+v) */
export const wallTexture = () =>
  memo("wall", () => {
    const W = 512, H = 256;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#b9a98e";
    ctx.fillRect(0, 0, W, H);
    noise(ctx, W, H, 3000, 0.1);
    // dark band bottom
    ctx.fillStyle = "#2a2b30";
    ctx.fillRect(0, H - 40, W, 40);
    // chevrons
    ctx.fillStyle = "#e3b020";
    for (let x = -64; x < W + 64; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x + 40, 20);
      ctx.lineTo(x + 90, H / 2 - 20);
      ctx.lineTo(x + 40, H - 60);
      ctx.lineTo(x, H - 60);
      ctx.lineTo(x + 50, H / 2 - 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#1f2026";
    ctx.fillRect(0, 0, W, 14);
    return finish(c, 1, 1);
  });

/** Blue tech panel for track understructure */
export const panelTexture = () =>
  memo("panel", () => {
    const W = 256, H = 256;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#2b2f3d";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#171a24";
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.fillStyle = "#3a4ea8";
    ctx.fillRect(24, 24, W - 48, 30);
    ctx.fillStyle = "#1b1f2b";
    ctx.fillRect(24, 70, W - 48, H - 94);
    noise(ctx, W, H, 1200, 0.1);
    return finish(c, 1, 1);
  });

/** Start pad top: hex pattern blue-grey with yellow arrow */
export const padTexture = () =>
  memo("pad", () => {
    const W = 256, H = 512;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#6e7892";
    ctx.fillRect(0, 0, W, H);
    // hex grid
    ctx.strokeStyle = "#3d4660";
    ctx.lineWidth = 3;
    const r = 22;
    for (let row = -1; row < H / (r * 1.5) + 1; row++) {
      for (let col = -1; col < W / (r * 1.73) + 1; col++) {
        const cx = col * r * 1.73 + (row % 2 ? r * 0.866 : 0);
        const cy = row * r * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    // white center lane
    ctx.fillStyle = "#d8dbe2";
    ctx.fillRect(W * 0.36, 0, W * 0.28, H);
    ctx.fillStyle = "#b8bcc6";
    ctx.fillRect(W * 0.36, 0, 6, H);
    ctx.fillRect(W * 0.64 - 6, 0, 6, H);
    // yellow arrows (pointing up = forward)
    ctx.fillStyle = "#e6c21a";
    for (let y = 60; y < H; y += 150) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.lineTo(W / 2 + 34, y + 44);
      ctx.lineTo(W / 2 + 12, y + 44);
      ctx.lineTo(W / 2 + 12, y + 80);
      ctx.lineTo(W / 2 - 12, y + 80);
      ctx.lineTo(W / 2 - 12, y + 44);
      ctx.lineTo(W / 2 - 34, y + 44);
      ctx.closePath();
      ctx.fill();
    }
    // side yellow hazard
    ctx.fillStyle = "#e6c21a";
    ctx.fillRect(10, 0, 14, H);
    ctx.fillRect(W - 24, 0, 14, H);
    ctx.fillStyle = "#222";
    for (let y = 0; y < H; y += 40) {
      ctx.fillRect(10, y, 14, 16);
      ctx.fillRect(W - 24, y + 20, 14, 16);
    }
    noise(ctx, W, H, 1500, 0.08);
    return finish(c, 1, 1);
  });

/** Transverse yellow stripes decal for start zone (transparent) */
export const startStripesTexture = () =>
  memo("stripes", () => {
    const W = 512, H = 512;
    const { c, ctx } = canvas(W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(230,190,20,0.85)";
    for (let y = 0; y < H; y += 64) ctx.fillRect(0, y, W, 26);
    // worn
    for (let i = 0; i < 400; i++) {
      ctx.clearRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    return finish(c, 1, 1);
  });

/** Start/finish line */
export const finishLineTexture = () =>
  memo("finish", () => {
    const W = 512, H = 64;
    const { c, ctx } = canvas(W, H);
    const n = 16;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#f5f5f5" : "#121212";
        ctx.fillRect((W / n) * i, (H / 2) * j, W / n, H / 2);
      }
    }
    return finish(c, 1, 1);
  });

/** Speed pad arrows (animated via offset) */
export const speedPadTexture = (color = "#39c7ff") =>
  memo("speedpad" + color, () => {
    const W = 256, H = 256;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#0b1a2a";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    for (let y = -60; y < H + 60; y += 80) {
      ctx.beginPath();
      ctx.moveTo(10, y + 40);
      ctx.lineTo(W / 2, y);
      ctx.lineTo(W - 10, y + 40);
      ctx.lineTo(W - 10, y + 70);
      ctx.lineTo(W / 2, y + 30);
      ctx.lineTo(10, y + 70);
      ctx.closePath();
      ctx.fill();
    }
    return finish(c, 1, 1);
  });

/** Billboard with text */
export const textTexture = (text: string, bg: string, fg: string, w = 1024, h = 256) =>
  memo("txt" + text + bg, () => {
    const { c, ctx } = canvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = `italic 900 ${Math.floor(h * 0.62)}px Orbitron, "Arial Black", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    const t = finish(c, 1, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });

/** Building facade with windows */
export const facadeTexture = () =>
  memo("facade", () => {
    const W = 512, H = 512;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#9aa3b5";
    ctx.fillRect(0, 0, W, H);
    for (let y = 16; y < H; y += 48) {
      for (let x = 12; x < W; x += 40) {
        const lit = Math.random() > 0.5;
        ctx.fillStyle = lit ? "#cfe4ff" : "#30405a";
        ctx.fillRect(x, y, 26, 28);
      }
      ctx.fillStyle = "#6e7789";
      ctx.fillRect(0, y + 36, W, 6);
    }
    noise(ctx, W, H, 1500, 0.08);
    return finish(c, 1, 1);
  });

/** Crowd texture */
export const crowdTexture = () =>
  memo("crowd", () => {
    const W = 512, H = 128;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#3a3f4f";
    ctx.fillRect(0, 0, W, H);
    const cols = ["#e74c3c", "#3498db", "#f1c40f", "#ecf0f1", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c"];
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 5);
    }
    return finish(c, 1, 1);
  });

/** Soft radial glow */
export const glowTexture = () =>
  memo("glow", () => {
    const S = 128;
    const { c, ctx } = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = finish(c, 1, 1, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });

/** Blob shadow */
export const blobTexture = () =>
  memo("blob", () => {
    const S = 128;
    const { c, ctx } = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(0.5, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = finish(c, 1, 1, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });

/** Cave rock: dark stone + glowing bioluminescent veins. Returns map + emissive map. */
export const caveRockTextures = () => {
  if (cache["caverock"] && cache["caverock_e"]) return { map: cache["caverock"], emissive: cache["caverock_e"] };
  const W = 1024, H = 1024;
  const { c, ctx } = canvas(W, H);
  const { c: ce, ctx: ctxE } = canvas(W, H);
  // base rock
  ctx.fillStyle = "#2a2434";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const v = 25 + Math.random() * 45;
    const t = Math.random();
    ctx.fillStyle = `rgba(${v + t * 20},${v - 5},${v + 25},${0.25 + Math.random() * 0.3})`;
    const r = 4 + Math.random() * 26;
    ctx.beginPath();
    ctx.ellipse(Math.random() * W, Math.random() * H, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // strata lines
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    let y = Math.random() * H;
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) {
      y += (Math.random() - 0.5) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctxE.fillStyle = "#000";
  ctxE.fillRect(0, 0, W, H);
  // veins (random walks) drawn on both
  const cols = ["#38e6ff", "#c35cff", "#41ffc9", "#5b8cff"];
  for (let v = 0; v < 16; v++) {
    const col = cols[v % cols.length];
    let x = Math.random() * W;
    let y = Math.random() * H;
    let a = Math.random() * Math.PI * 2;
    const steps = 60 + Math.random() * 160;
    const lw = 1.5 + Math.random() * 3;
    for (const [g, cxx] of [
      [ctx, col],
      [ctxE, col],
    ] as [CanvasRenderingContext2D, string][]) {
      g.strokeStyle = cxx;
      g.lineWidth = lw;
      g.shadowColor = cxx;
      g.shadowBlur = 16;
    }
    let px = x, py = y;
    for (let s = 0; s < steps; s++) {
      a += (Math.random() - 0.5) * 1.1;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      for (const g of [ctx, ctxE]) {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(x, y);
        g.stroke();
      }
      px = x;
      py = y;
      if (x < 0 || x > W || y < 0 || y > H) break;
    }
  }
  ctx.shadowBlur = 0;
  ctxE.shadowBlur = 0;
  noise(ctx, W, H, 5000, 0.08);
  cache["caverock"] = finish(c, 1, 1);
  cache["caverock_e"] = finish(ce, 1, 1);
  return { map: cache["caverock"], emissive: cache["caverock_e"] };
};

/** Soft water caustic cells */
export const causticTexture = () =>
  memo("caustic", () => {
    const S = 512;
    const { c, ctx } = canvas(S, S);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 6;
    for (let i = 0; i < 160; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const r = 14 + Math.random() * 30;
      ctx.ellipse(Math.random() * S, Math.random() * S, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const t = finish(c, 1, 1, false);
    return t;
  });

/** Countdown LED board */
export const ledTexture = (label: string, color: string) =>
  memo("led" + label + color, () => {
    const W = 512, H = 192;
    const { c, ctx } = canvas(W, H);
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    let fs = Math.floor(H * 0.75);
    ctx.font = `900 ${fs}px Orbitron, "Arial Black", Impact, sans-serif`;
    while (fs > 20 && ctx.measureText(label).width > W * 0.92) {
      fs -= 4;
      ctx.font = `900 ${fs}px Orbitron, "Arial Black", Impact, sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillText(label, W / 2, H / 2 + 4);
    ctx.shadowBlur = 0;
    // led grid overlay
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    const t = finish(c, 1, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
