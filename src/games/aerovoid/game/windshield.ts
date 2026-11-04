import * as THREE from 'three';

interface Drop { x: number; y: number; r: number; age: number; moving: boolean; trail: number }
const W = 768, H = 432;

/** A glass-fixed water height map. The final post-process refracts the world through it. */
export class WindshieldRain {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private drops: Drop[] = [];
  private budget = 0;
  private wipe = 0;
  private shock = 0;

  constructor(_camera: THREE.PerspectiveCamera) {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    for (let i = 0; i < 100; i++) this.add();
    this.draw();
  }
  private add() {
    const r = Math.random() < 0.16 ? 2.1 + Math.random() * 2.5 : 0.65 + Math.random() * 1.6;
    this.drops.push({ x: Math.random() * W, y: Math.random() * H, r, age: 3 + Math.random() * 9, moving: r > 2.1 && Math.random() > 0.35, trail: 0 });
  }
  easeRain() { this.wipe = 0.85; }
  blast() { this.shock = 0.75; }
  update(dt: number, level: number, speed: number, steer = 0, braking = 0) {
    this.budget = Math.min(3, this.budget + dt * (level > 0.12 ? 8 + level * 32 : 0));
    while (this.budget >= 1 && this.drops.length < 190) { this.add(); this.budget--; }
    const sweep = W * (1 - this.wipe / 0.85);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const velocity = d.moving ? 8 + d.r * 4 + speed * 0.08 + braking * 14 : 0;
      d.y += velocity * dt;
      d.x += ((d.x - W / 2) * speed * 0.00008 - steer * (d.moving ? 12 : 2)) * dt;
      if (this.shock > 0) {
        const x = d.x - W / 2, y = d.y - H / 2, len = Math.max(20, Math.hypot(x, y));
        d.x += x / len * 300 * this.shock * dt; d.y += y / len * 300 * this.shock * dt;
      }
      d.trail = Math.min(d.r * 5, d.trail + velocity * dt * 0.35);
      d.age -= dt * (level < 0.12 ? 1.6 : 0.2);
      if (d.age <= 0 || d.y > H + 30 || d.x < -30 || d.x > W + 30 || (this.wipe > 0 && Math.abs(d.x - sweep) < 16)) { this.drops.splice(i, 1); continue; }
      // Larger sliding drops collect small beads in their path.
      if (d.moving) for (let j = i - 1; j >= 0; j--) {
        const b = this.drops[j];
        if (b.r < d.r && Math.abs(b.x - d.x) < d.r * 0.7 && Math.abs(b.y - d.y) < d.r) {
          d.r = Math.min(5, Math.sqrt(d.r * d.r + b.r * b.r * 0.35));
          this.drops.splice(j, 1); i--;
        }
      }
    }
    this.wipe = Math.max(0, this.wipe - dt); this.shock = Math.max(0, this.shock - dt);
    this.draw();
  }
  private draw() {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    for (const d of this.drops) {
      const fade = Math.min(1, d.age);
      if (d.trail > 2) {
        const trail = g.createLinearGradient(d.x, d.y - d.trail, d.x, d.y);
        trail.addColorStop(0, 'rgba(255,255,255,0)'); trail.addColorStop(1, `rgba(255,255,255,${0.22 * fade})`);
        g.strokeStyle = trail; g.lineWidth = Math.max(1, d.r * 0.5);
        g.beginPath(); g.moveTo(d.x, d.y - d.trail); g.lineTo(d.x, d.y); g.stroke();
      }
      g.save(); g.translate(d.x, d.y); g.scale(1, d.moving ? 1.25 : 0.9);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, d.r);
      grad.addColorStop(0, `rgba(255,255,255,${fade})`);
      grad.addColorStop(0.65, `rgba(255,255,255,${0.82 * fade})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(0, 0, d.r, 0, Math.PI * 2); g.fill(); g.restore();
    }
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); }
}
