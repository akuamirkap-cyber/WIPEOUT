import * as THREE from 'three';

interface Drop {
  x: number;
  y: number;
  radius: number;
  speed: number;
  tail: number;
  age: number;
  maxAge: number;
}

const W = 768;
const H = 432;
const MAX_DROPS = 110;

/** Transparent rain layer behind the cockpit instruments, fixed to the windscreen. */
export class WindshieldRain {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private drops: Drop[] = [];
  private spawnBudget = 0;
  private drawTimer = 0;
  private wipeTime = 0;
  private blastTime = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const distance = 1.48;
    const height = distance * 2 * Math.tan(THREE.MathUtils.degToRad(39)) * 1.03;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(height * 16 / 9, height),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      })
    );
    this.mesh.position.z = -distance;
    this.mesh.renderOrder = 43;
    this.camera.add(this.mesh);
    for (let i = 0; i < 65; i++) this.addDrop(true);
    this.draw();
  }

  private addDrop(initial = false) {
    const radius = Math.random() < 0.14 ? 5 + Math.random() * 5 : 1.2 + Math.random() * 3.2;
    const age = 1.4 + Math.random() * 4;
    this.drops.push({
      x: Math.random() * W,
      y: initial ? Math.random() * H : -radius * 2 + Math.random() * H * 0.6,
      radius,
      speed: 22 + Math.random() * 70 + radius * 3,
      tail: radius * (1.5 + Math.random() * 3),
      age,
      maxAge: age,
    });
  }

  easeRain() {
    this.wipeTime = 0.85;
  }

  blast() {
    this.blastTime = 0.75;
  }

  update(dt: number, level: number, speed: number) {
    this.spawnBudget += dt * (level > 0.12 ? 15 + level * 42 : 0.9);
    while (this.spawnBudget >= 1 && this.drops.length < MAX_DROPS) {
      this.addDrop();
      this.spawnBudget--;
    }
    this.spawnBudget = Math.min(this.spawnBudget, 2);
    const wiping = this.wipeTime > 0;
    const sweepX = wiping ? W * (0.05 + (1 - this.wipeTime / 0.85) * 0.94) : -100;
    const shock = this.blastTime / 0.75;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += (d.speed + speed * 0.1) * dt;
      d.x += (d.x - W * 0.5) * speed * 0.00007 * dt;
      if (shock > 0) {
        const ox = d.x - W * 0.5, oy = d.y - H * 0.5;
        const radius = Math.max(12, Math.hypot(ox, oy));
        d.x += ox / radius * dt * 380 * shock;
        d.y += oy / radius * dt * 300 * shock;
      }
      d.tail = Math.min(80, d.tail + dt * (d.speed + speed * 0.08) * 0.26);
      d.age -= dt * (level < 0.12 ? 1.6 : 0.26);
      if (d.y > H + 30 || d.x < -30 || d.x > W + 30 || d.age <= 0 || (wiping && Math.abs(d.x - sweepX) < 18)) this.drops.splice(i, 1);
    }
    this.wipeTime = Math.max(0, this.wipeTime - dt);
    this.blastTime = Math.max(0, this.blastTime - dt);
    this.mesh.visible = level > 0.025 || this.drops.length > 0;
    this.drawTimer += dt;
    if (this.drawTimer >= 1 / 20) {
      this.drawTimer %= 1 / 20;
      this.draw();
    }
  }

  private draw() {
    const g = this.context;
    g.clearRect(0, 0, W, H);
    for (const d of this.drops) {
      const fade = Math.min(1, d.age / Math.min(1, d.maxAge));
      const r = d.radius;
      if (d.tail > 5) {
        const trail = g.createLinearGradient(d.x, d.y - d.tail, d.x, d.y);
        trail.addColorStop(0, 'rgba(215,240,255,0)');
        trail.addColorStop(1, `rgba(218,240,255,${0.19 * fade})`);
        g.strokeStyle = trail;
        g.lineWidth = Math.max(0.8, r * 0.27);
        g.beginPath();
        g.moveTo(d.x - r * 0.16, d.y - d.tail);
        g.quadraticCurveTo(d.x - r * 0.4, d.y - d.tail * 0.5, d.x, d.y);
        g.stroke();
      }
      const lens = g.createRadialGradient(d.x - r * 0.3, d.y - r * 0.4, 0, d.x, d.y, r * 1.65);
      lens.addColorStop(0, `rgba(246,252,255,${0.46 * fade})`);
      lens.addColorStop(0.34, `rgba(175,222,248,${0.15 * fade})`);
      lens.addColorStop(0.7, `rgba(28,62,89,${0.22 * fade})`);
      lens.addColorStop(1, 'rgba(30,65,90,0)');
      g.fillStyle = lens;
      g.beginPath();
      g.ellipse(d.x, d.y, r * 1.1, r * 1.45, -0.12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(240,252,255,${0.38 * fade})`;
      g.lineWidth = Math.max(0.8, r * 0.2);
      g.beginPath();
      g.ellipse(d.x - r * 0.08, d.y - r * 0.04, r * 0.77, r * 1.14, -0.12, 3.85, 5.6);
      g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.56 * fade})`;
      g.beginPath();
      g.ellipse(d.x - r * 0.42, d.y - r * 0.51, Math.max(0.5, r * 0.19), Math.max(0.8, r * 0.32), -0.3, 0, Math.PI * 2);
      g.fill();
    }
    if (this.wipeTime > 0) {
      const x = W * (0.05 + (1 - this.wipeTime / 0.85) * 0.94);
      g.strokeStyle = `rgba(205,240,255,${0.15 * this.wipeTime / 0.85})`;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x - 38, H + 10);
      g.quadraticCurveTo(x + 55, H * 0.5, x + 20, -10);
      g.stroke();
    }
    if (this.blastTime > 0) {
      const phase = 1 - this.blastTime / 0.75;
      g.strokeStyle = `rgba(220,245,255,${0.22 * (1 - phase)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.5, 22 + phase * W * 0.68, 14 + phase * H * 0.8, 0, 0, Math.PI * 2);
      g.stroke();
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.camera.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}