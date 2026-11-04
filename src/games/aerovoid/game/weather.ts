import * as THREE from 'three';

const COUNT = 620;
const RADIUS = 56;

const rainVertex = /* glsl */ `
attribute float aFade;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const rainFragment = /* glsl */ `
uniform float uRain;
varying vec2 vUv;
varying float vFade;
void main() {
  float side = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
  float tip = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
  float alpha = side * tip * vFade * uRain * 0.7;
  gl_FragColor = vec4(0.78, 0.9, 1.0, alpha);
}`;

/** One dynamic draw call for camera-local rain streaks; no per-drop meshes or shadows. */
export class RainSystem {
  readonly mesh: THREE.Mesh;
  private centers = new Float32Array(COUNT * 3);
  private fall = new Float32Array(COUNT);
  private width = new Float32Array(COUNT);
  private length = new Float32Array(COUNT);
  private positions = new Float32Array(COUNT * 12);
  private fades = new Float32Array(COUNT * 4);
  private ready = false;
  private right = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const uv = new Float32Array(COUNT * 8);
    const indices: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      uv.set([0, 1, 1, 1, 0, 0, 1, 0], i * 8);
      const b = i * 4;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      this.fall[i] = 57 + Math.random() * 31;
      this.width[i] = 0.035 + Math.random() * 0.055;
      this.length[i] = 1.4 + Math.random() * 1.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.fades, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(indices);
    const mat = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      uniforms: { uRain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }

  private respawn(i: number, camera: THREE.Camera) {
    const j = i * 3;
    this.centers[j] = camera.position.x + (Math.random() - 0.5) * RADIUS * 2;
    this.centers[j + 1] = camera.position.y + (Math.random() - 0.35) * 38;
    this.centers[j + 2] = camera.position.z + (Math.random() - 0.5) * RADIUS * 2;
  }

  update(dt: number, camera: THREE.Camera, intensity: number, speed: number) {
    const material = this.mesh.material as THREE.ShaderMaterial;
    material.uniforms.uRain.value = intensity;
    this.mesh.visible = intensity > 0.025;
    if (!this.mesh.visible) {
      this.ready = false;
      return;
    }
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const rx = this.right.x, ry = this.right.y, rz = this.right.z;
    const stretch = Math.min(1.1, speed / 300);
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      if (!this.ready) this.respawn(i, camera);
      else {
        this.centers[j] += dt * 4.5;
        this.centers[j + 1] -= this.fall[i] * dt;
        this.centers[j + 2] -= dt * 2.2;
        if (
          Math.abs(this.centers[j] - camera.position.x) > RADIUS ||
          Math.abs(this.centers[j + 2] - camera.position.z) > RADIUS ||
          this.centers[j + 1] < camera.position.y - 20 ||
          this.centers[j + 1] > camera.position.y + 28
        ) this.respawn(i, camera);
      }
      const x = this.centers[j], y = this.centers[j + 1], z = this.centers[j + 2];
      const len = this.length[i] + stretch * 0.75;
      const w = this.width[i];
      const k = i * 12;
      this.positions.set([
        x - rx * w, y - ry * w, z - rz * w,
        x + rx * w, y + ry * w, z + rz * w,
        x + len * 0.12 - rx * w, y - len - ry * w, z - len * 0.04 - rz * w,
        x + len * 0.12 + rx * w, y - len + ry * w, z - len * 0.04 + rz * w,
      ], k);
      const dx = x - camera.position.x, dz = z - camera.position.z;
      const fade = Math.max(0, 1 - Math.hypot(dx, dz) / (RADIUS + 8));
      const strength = fade * (0.55 + this.width[i] * 4);
      this.fades.fill(strength, i * 4, i * 4 + 4);
    }
    this.ready = true;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aFade.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}