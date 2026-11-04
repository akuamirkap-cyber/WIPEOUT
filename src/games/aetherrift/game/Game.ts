import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SUN_DIR, HORIZON, createSkyEnvironment, createCaveEnvironment } from "./sky";
import { Track, buildTrack, newFrame, Frame, TrackBuild } from "./track";
import { buildCave, CaveBuild } from "./cave";
import { GRID_SLOTS, createStartArea, createTerrain, groundHeight, initGround } from "./environment";
import { PALETTES, ShipModel } from "./ship";
import { glowTexture, LedDisplay } from "./textures";
import { AudioFX } from "./audio";
import { clamp, damp, lerp, mulberry32, smoothstep } from "./utils";

export type GameState = "menu" | "countdown" | "racing" | "finished";
export type Quality = "ultra" | "high" | "medium";

export interface MapDot {
  x: number;
  y: number;
  me: boolean;
  color: string;
}
export interface HudData {
  state: GameState;
  speed: number;
  speedN: number;
  lap: number;
  laps: number;
  pos: number;
  total: number;
  time: number;
  lapTime: number;
  bestLap: number;
  lastLap: number;
  energy: number;
  nitro: number;
  nitroActive: boolean;
  boost: number;
  hit: number;
  countdown: number;
  critical: boolean;
  go: number;
  map: MapDot[];
  cam: number;
  lapFlash: number;
  zone: string;
  zoneT: number;
}
export interface ResultRow {
  name: string;
  time: number;
  est: boolean;
  isPlayer: boolean;
  color: string;
  best: number;
}
export interface GameCallbacks {
  onHud(h: HudData): void;
  onFinish(rows: ResultRow[]): void;
}

const VMAX = 168;
const VNITRO = 252;
const VBOOST = 218;
const SUN_COL = new THREE.Color(0xfff1dc);
const CAVE_KEY_COL = new THREE.Color(0xc4e6ff);
const CAVE_DIR = new THREE.Vector3(0.2, 1, 0.12).normalize();
const HEMI_SKY = new THREE.Color(0x9fc4ff);
const HEMI_GROUND = new THREE.Color(0x9a8a72);
const CAVE_HEMI_SKY = new THREE.Color(0x4a8fd0);
const CAVE_HEMI_GROUND = new THREE.Color(0x7a3a90);
const CAVE_FOG = new THREE.Color(0.045, 0.075, 0.2);
const NITRO_USE = 0.27;

interface Input {
  throttle: number;
  brake: number;
  steer: number;
  airL: number;
  airR: number;
  nitro: boolean;
}

export class Racer {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  ship: ShipModel;
  dist = 0;
  d = 0;
  v = 0;
  vd = 0;
  steer = 0;
  energy = 1;
  nitro = 1;
  nitroOn = false;
  nitroF = 0;
  thrSm = 0;
  boostTimer = 0;
  lapsDone = 0;
  lapStart = 0;
  lastLap = 0;
  bestLap = Infinity;
  finished = false;
  finishTime = 0;
  auto = false;
  skill = 1;
  lane = 0;
  aiNitroT = 0;
  reaction = 0;
  yaw = 0;
  roll = 0;
  pitch = 0;
  hitCool = 0;
  worldPos = new THREE.Vector3();
  rank = 1;
  airL = 0;
  airR = 0;
  constructor(id: number, isPlayer: boolean, ship: ShipModel) {
    this.id = id;
    this.isPlayer = isPlayer;
    this.ship = ship;
    this.name = ship.palette.name;
    this.color = ship.palette.primary;
  }
}

class Particles {
  max: number;
  pos: Float32Array;
  vel: Float32Array;
  base: Float32Array;
  col: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  head = 0;
  drag: number;
  constructor(max: number, size: number, tex: THREE.Texture, drag = 1.2) {
    this.max = max;
    this.drag = drag;
    this.pos = new Float32Array(max * 3).fill(-99999);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size,
      map: tex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, r: number, g: number, b: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.base[i * 3] = r;
    this.base[i * 3 + 1] = g;
    this.base[i * 3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
  }
  update(dt: number) {
    const k = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -99999;
        continue;
      }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] *= k;
      this.vel[i * 3 + 2] *= k;
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBoost: { value: 0 },
    uAspect: { value: 16 / 9 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // Runs AFTER tone-mapping (display-referred): sharpen, light radial blur on boost, grade, vignette.
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBoost;
    uniform float uAspect;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 blurSample(vec2 uv, vec2 c, float strength){
      vec3 acc = vec3(0.0);
      for(int i = 0; i < 5; i++){
        float t = float(i) / 4.0;
        acc += texture2D(tDiffuse, uv - c * (t * strength)).rgb;
      }
      return acc / 5.0;
    }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 ca2 = c * vec2(uAspect, 1.0);
      float r2 = dot(ca2, ca2);
      float strength = uBoost * 0.02 * smoothstep(0.12, 0.55, r2);
      vec3 col;
      if(strength < 0.0004){
        col = texture2D(tDiffuse, vUv).rgb;
      } else {
        col = blurSample(vUv, c, strength);
      }
      // sharpen (unsharp mask) for crisp HD detail
      vec2 px = 1.0 / uRes;
      vec3 nb = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb
              + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      col += (col - nb * 0.25) * 0.55 * (1.0 - uBoost * 0.6);
      col = max(col, 0.0);
      // grade: slightly richer colour + gentle S-curve contrast
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.14);
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      float vig = 1.0 - smoothstep(0.30, 0.85, r2) * 0.20;
      col *= vig;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Game {
  container: HTMLElement;
  cb: GameCallbacks;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finalPass: ShaderPass;
  sun: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  cave!: CaveBuild;
  envSky!: THREE.Texture;
  envCave!: THREE.Texture;
  cf = 0;
  zoneT = 0;
  wasInCave = false;
  lightDir = SUN_DIR.clone();
  engineLight: THREE.PointLight;
  track: Track;
  trackBuild: TrackBuild;
  led: LedDisplay;
  audio = new AudioFX();
  racers: Racer[] = [];
  player!: Racer;
  sparks: Particles;
  embers: Particles;
  snow: THREE.Points;
  snowPos: Float32Array;
  streaks: THREE.LineSegments;
  streakData: Float32Array;
  pickups: { group: THREE.Group; s: number; d: number; timer: number; core: THREE.Mesh }[] = [];

  state: GameState = "menu";
  paused = false;
  laps = 3;
  quality: Quality = "ultra";
  time = 0;
  raceTime = 0;
  cdElapsed = 0;
  goTimer = 0;
  lapFlash = 0;
  camMode = 0;
  keys = new Set<string>();
  raf = 0;
  lastT = 0;
  hudT = 0;
  finishReported = false;
  finishDelay = 0;
  rnd = mulberry32(555);

  // camera state
  camD = 0;
  camLookD = 0;
  camFov = 72;
  camRoll = 0;
  camPos = new THREE.Vector3();
  shake = 0;
  hitFlash = 0;
  boostFlash = 0;
  fxBoost = 0;
  mapPath = "";
  mapProj: (x: number, z: number) => [number, number] = () => [0, 0];

  private f1 = newFrame();
  private f2 = newFrame();
  private f3 = newFrame();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private resizeObs: ResizeObserver;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onBlur: () => void;
  private disposed = false;
  private shadowSize = 4096;

  constructor(container: HTMLElement, cb: GameCallbacks) {
    this.container = container;
    this.cb = cb;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    this.scene.fog = new THREE.FogExp2(HORIZON.getHex(), 0.00042);
    this.scene.fog.color.copy(HORIZON);
    this.envSky = createSkyEnvironment(renderer, this.scene);
    this.envCave = createCaveEnvironment(renderer);

    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.3, 7000);
    this.scene.add(this.camera);

    // ---- Lights
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    const R = 140;
    const sc = this.sun.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    sc.near = 1;
    sc.far = 700;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.12;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x9a8a72, 0.55);
    this.scene.add(this.hemi);
    this.engineLight = new THREE.PointLight(0x4db8ff, 0, 60, 2);
    this.scene.add(this.engineLight);

    // ---- World
    this.track = new Track();
    initGround(this.track);
    this.cave = buildCave(this.track, (x, z) => groundHeight(x, z));
    this.scene.add(this.cave.group);
    this.scene.add(createTerrain(this.track, this.cave.contains));
    const start = createStartArea();
    this.led = start.led;
    this.scene.add(start.group);
    this.trackBuild = buildTrack(this.track, (x, z) => groundHeight(x, z));
    this.scene.add(this.trackBuild.group);

    // ---- Racers
    this.createRacers();
    this.createPickups();

    // ---- FX
    const glow = glowTexture("255,255,255", 1.4);
    this.sparks = new Particles(500, 0.45, glow, 0.8);
    this.embers = new Particles(600, 0.35, glow, 1.5);
    this.scene.add(this.sparks.points, this.embers.points);

    const SN = 900;
    this.snowPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      this.snowPos[i * 3] = (this.rnd() - 0.5) * 160;
      this.snowPos[i * 3 + 1] = (this.rnd() - 0.5) * 80;
      this.snowPos[i * 3 + 2] = (this.rnd() - 0.5) * 160;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.snowPos.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    const sm = new THREE.PointsMaterial({
      size: 0.42,
      map: glow,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
      color: 0xffffff,
    });
    this.snow = new THREE.Points(sg, sm);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    const NS = 220;
    this.streakData = new Float32Array(NS * 6);
    const stg = new THREE.BufferGeometry();
    stg.setAttribute("position", new THREE.BufferAttribute(this.streakData, 3).setUsage(THREE.DynamicDrawUsage));
    const stm = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    stm.color.setRGB(0.9, 1.1, 1.5);
    this.streaks = new THREE.LineSegments(stg, stm);
    this.streaks.frustumCulled = false;
    this.camera.add(this.streaks);
    for (let i = 0; i < NS; i++) this.resetStreak(i, true);

    // ---- Post
    const rt = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.2, 0.4, 1.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);

    this.buildMap();

    // ---- Events
    this.onKeyDown = (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      this.keys.add(e.code);
      if (e.code === "KeyC") this.camMode = (this.camMode + 1) % 3;
      if (e.code === "KeyM") this.audio.setMuted(!this.audio.muted);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.setQuality("ultra");
    this.resize();

    this.resetRace();
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------ */
  private createRacers() {
    const skills = [0.95, 0.93, 0.915, 0.9, 0.885, 0.87, 0.86];
    for (let k = 0; k < 8; k++) {
      const isPlayer = k === 7;
      const pal = isPlayer ? PALETTES[0] : PALETTES[k + 1];
      const ship = new ShipModel(pal);
      this.scene.add(ship.root);
      const r = new Racer(k, isPlayer, ship);
      if (isPlayer) this.player = r;
      else {
        r.skill = skills[k];
        r.lane = (this.rnd() - 0.5) * 8;
        r.reaction = this.rnd() * 0.45;
      }
      this.racers.push(r);
    }
  }

  private createPickups() {
    const tex = glowTexture("120,220,255", 1.5);
    const count = Math.floor(this.track.length / 360);
    for (let k = 0; k < count; k++) {
      const s = this.track.wrapS(this.track.startS + 280 + (k + 0.5) * ((this.track.length - 400) / count));
      const d = (this.rnd() - 0.5) * 2 * (this.track.halfAt(s) - 8);
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial();
      mat.color.setRGB(0.3, 1.4, 2.2);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), mat);
      core.scale.set(0.8, 1.5, 0.8);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 28), mat);
      ring.rotation.x = Math.PI / 2;
      core.add(ring);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      sprite.scale.set(7, 7, 1);
      group.add(core, sprite);
      this.track.worldPoint(s, d, 2.6, this.f1, group.position);
      this.scene.add(group);
      this.pickups.push({ group, s, d, timer: 0, core });
    }
  }

  private buildMap() {
    const pts: [number, number][] = [];
    let minX = 1e9,
      maxX = -1e9,
      minZ = 1e9,
      maxZ = -1e9;
    for (let i = 0; i < this.track.n; i += 10) {
      const p = this.track.pos[i];
      pts.push([p.x, p.z]);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const sc = 84 / Math.max(maxX - minX, maxZ - minZ);
    const ox = (100 - (maxX - minX) * sc) / 2;
    const oz = (100 - (maxZ - minZ) * sc) / 2;
    this.mapProj = (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
    this.mapPath =
      pts
        .map((p, i) => {
          const [x, y] = this.mapProj(p[0], p[1]);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ") + " Z";
  }

  private resetStreak(i: number, randomZ = false) {
    const a = this.rnd() * Math.PI * 2;
    const r = 2.6 + Math.pow(this.rnd(), 0.7) * 20;
    const x = Math.cos(a) * r * 1.5;
    const y = Math.sin(a) * r * 0.85;
    const z = randomZ ? -2 - this.rnd() * 110 : -110 - this.rnd() * 20;
    this.streakData[i * 6] = x;
    this.streakData[i * 6 + 1] = y;
    this.streakData[i * 6 + 2] = z;
    this.streakData[i * 6 + 3] = x;
    this.streakData[i * 6 + 4] = y;
    this.streakData[i * 6 + 5] = z - 1;
  }

  /* ------------------------------------------------------------ */
  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === "ultra" ? Math.min(dpr, 2) : q === "high" ? Math.min(dpr, 1.5) : 1;
    const ss = q === "ultra" ? 4096 : q === "high" ? 2048 : 1024;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    if (ss !== this.shadowSize) {
      this.shadowSize = ss;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(ss, ss);
    }
    this.bloom.strength = q === "medium" ? 0.14 : 0.2;
    this.resize();
  }

  resize() {
    const w = Math.max(2, this.container.clientWidth);
    const h = Math.max(2, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.finalPass.uniforms.uAspect.value = w / h;
    const pr = this.renderer.getPixelRatio();
    (this.finalPass.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr);
  }

  /* ------------------------------------------------------------ */
  startRace(laps: number) {
    this.audio.init();
    this.laps = laps;
    this.resetRace();
    this.state = "countdown";
    this.cdElapsed = 0;
    this.finishReported = false;
  }

  returnToMenu() {
    this.resetRace();
    this.state = "menu";
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.audio.update(0, 0, 0, false);
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    return this.audio.muted;
  }

  resetRace() {
    this.raceTime = 0;
    this.cdElapsed = 0;
    this.goTimer = 0;
    this.finishReported = false;
    this.finishDelay = 0;
    this.lapFlash = 0;
    this.racers.forEach((r, k) => {
      const slot = GRID_SLOTS[k];
      r.dist = -slot.back;
      r.d = slot.d;
      r.v = 0;
      r.vd = 0;
      r.steer = 0;
      r.energy = 1;
      r.nitro = 1;
      r.nitroOn = false;
      r.nitroF = 0;
      r.boostTimer = 0;
      r.lapsDone = 0;
      r.lapStart = 0;
      r.lastLap = 0;
      r.bestLap = Infinity;
      r.finished = false;
      r.finishTime = 0;
      r.auto = !r.isPlayer;
      r.aiNitroT = 0;
      r.yaw = r.roll = r.pitch = 0;
    });
    this.pickups.forEach((p) => {
      p.timer = 0;
      p.group.visible = true;
    });
    this.camD = this.player.d;
    this.camLookD = this.player.d;
    this.led.draw(-1);
    this.updateVisuals(0, true);
    this.snapCamera();
  }

  /* ------------------------------------------------------------ */
  private frame(dt: number) {
    this.time += dt;
    if (!this.paused) this.update(dt);
    this.render(dt);
    this.hudT += dt;
    if (this.hudT > 1 / 30) {
      this.hudT = 0;
      this.cb.onHud(this.makeHud());
    }
  }

  private playerInput(): Input {
    const k = this.keys;
    const up = k.has("KeyW") || k.has("ArrowUp");
    const down = k.has("KeyS") || k.has("ArrowDown");
    const left = k.has("KeyA") || k.has("ArrowLeft");
    const right = k.has("KeyD") || k.has("ArrowRight");
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      airL: k.has("KeyQ") ? 1 : 0,
      airR: k.has("KeyE") ? 1 : 0,
      nitro: k.has("ShiftLeft") || k.has("ShiftRight") || k.has("Space"),
    };
  }

  private update(dt: number) {
    this.trackBuild.update(dt);
    const sub = 2;
    const h = dt / sub;

    // state machine
    if (this.state === "countdown") {
      const prev = this.cdElapsed;
      this.cdElapsed += dt;
      const t = this.cdElapsed;
      const stepOf = (x: number) => (x < 1.2 ? -1 : x < 2.2 ? 3 : x < 3.2 ? 2 : x < 4.2 ? 1 : 0);
      const s = stepOf(t);
      if (s !== stepOf(prev)) {
        if (s > 0) this.audio.beep(520, 0.22, 0.25);
        if (s === 0) {
          this.audio.beep(1040, 0.5, 0.3);
          this.state = "racing";
          this.raceTime = 0;
          this.goTimer = 2.2;
          this.racers.forEach((r) => (r.lapStart = 0));
        }
      }
      this.led.draw(s);
    } else if (this.state === "racing" || this.state === "finished") {
      if (this.goTimer > 0) {
        this.goTimer -= dt;
        if (this.goTimer <= 0) this.led.draw(-2, "AETHER");
      }
    }

    const racing = this.state === "racing" || this.state === "finished";
    if (racing) {
      this.raceTime += dt;
      for (let s = 0; s < sub; s++) {
        for (const r of this.racers) {
          const inp = r.auto ? this.aiInput(r, h) : this.playerInput();
          this.stepRacer(r, inp, h);
        }
        this.collide(h);
      }
      this.updatePickups(dt);
      // ranks
      const sorted = this.sortedRacers();
      sorted.forEach((r, i) => (r.rank = i + 1));
      // finish
      const p = this.player;
      if (p.finished && this.state === "racing") {
        this.state = "finished";
        p.auto = true;
        this.finishDelay = 1.6;
      }
      if (this.state === "finished" && !this.finishReported) {
        this.finishDelay -= dt;
        if (this.finishDelay <= 0) {
          this.finishReported = true;
          this.cb.onFinish(this.results());
        }
      }
    } else {
      // idle on grid
      for (const r of this.racers) r.thrSm = damp(r.thrSm, 0.12, 4, dt);
    }

    // countdown: rev engine visuals for player
    if (this.state === "countdown") {
      const inp = this.playerInput();
      this.player.thrSm = damp(this.player.thrSm, inp.throttle * 0.9 + 0.1, 8, dt);
      this.racers.forEach((r) => {
        if (!r.isPlayer) r.thrSm = damp(r.thrSm, this.cdElapsed > 2.6 ? 0.8 : 0.2, 4, dt);
      });
    }

    this.updateVisuals(dt, false);
    this.updateCamera(dt);
    this.updateFx(dt);

    // audio
    const p = this.player;
    const active = racing && !this.paused;
    this.audio.update(clamp(p.v / VNITRO, 0, 1), p.thrSm, p.nitroF, active || this.state === "countdown");
  }

  private sortedRacers() {
    return this.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
  }

  private results(): ResultRow[] {
    const L = this.track.length;
    return this.sortedRacers().map((r) => {
      const est = !r.finished;
      const rem = Math.max(0, this.laps * L - r.dist);
      const time = r.finished ? r.finishTime : this.raceTime + rem / Math.max(110, r.v);
      return { name: r.isPlayer ? "YOU · " + r.name : r.name, time, est, isPlayer: r.isPlayer, color: r.color, best: r.bestLap };
    });
  }

  /* ---------------------- AI ---------------------- */
  private aiInput(r: Racer, dt: number): Input {
    const tr = this.track;
    const s = tr.wrapS(tr.startS + r.dist);
    const look = 60 + r.v * 0.55;
    const k1 = tr.kappaAt(s + look * 0.4);
    const k2 = tr.kappaAt(s + look * 0.8);
    const k3 = tr.kappaAt(s + look * 1.3);
    let kL = k1;
    if (Math.abs(k2) > Math.abs(kL)) kL = k2;
    if (Math.abs(k3) > Math.abs(kL)) kL = k3;
    const kNow = tr.kappaAt(s);
    let mul = r.skill;
    if (r.finished) mul = 0.8;
    else if (!r.isPlayer) {
      const gap = r.dist - this.player.dist;
      if (gap > 160) mul *= 0.955;
      else if (gap < -160) mul *= 1.045;
    }
    const f = 1 / (1 + 70 * Math.max(0, Math.abs(kL) - 0.0045));
    let nitro = false;
    if (!r.finished) {
      if (r.aiNitroT > 0) {
        r.aiNitroT -= dt;
        nitro = true;
      } else if (r.nitro > 0.6 && Math.abs(kL) < 0.0016 && this.rnd() < dt * 0.35) {
        r.aiNitroT = 1.4 + this.rnd() * 1.2;
      }
    }

    const vt = VMAX * mul * f * (nitro ? 1.25 : 1);
    const throttle = r.v < vt ? 1 : 0;
    const over = r.v - vt * 1.06;
    const brake = over > 0 ? clamp(over / 25, 0, 0.9) : 0;

    let dTarget = r.lane * 0.8 + clamp(kL * 1800, -7, 7);
    for (const o of this.racers) {
      if (o === r) continue;
      const ahead = o.dist - r.dist;
      if (ahead > 0 && ahead < 26 && Math.abs(o.d - r.d) < 3.6) {
        dTarget = o.d + (r.d >= o.d ? 4.4 : -4.4);
      }
    }
    const hw = tr.halfAt(s) - 5.5;
    dTarget = clamp(dTarget, -hw, hw);
    const vdT = clamp((dTarget - r.d) * 0.9, -11, 11);
    const sf = 0.35 + 0.65 * Math.min(1, r.v / 90);
    const ff = (kNow * r.v * r.v * 0.3) / (70 * sf);
    const steer = clamp(ff + (vdT - r.vd) * 0.2, -1, 1);
    if (this.raceTime < r.reaction) {
      return { throttle: 0, brake: 0, steer: 0, airL: 0, airR: 0, nitro: false };
    }
    return { throttle, brake, steer, airL: 0, airR: 0, nitro };
  }

  /* ---------------------- Physics ---------------------- */
  private stepRacer(r: Racer, inp: Input, dt: number) {
    const tr = this.track;
    const L = tr.length;
    const s = tr.wrapS(tr.startS + r.dist);
    const fr = tr.sample(s, this.f3);
    const crit = r.energy <= 0.001 && r.isPlayer;
    let vmax = VMAX * (crit ? 0.6 : 1) * (r.isPlayer ? 1 : 1);
    const wantNitro = inp.nitro && r.nitro > 0.02 && !crit && !r.finished;
    if (wantNitro) {
      r.nitro = Math.max(0, r.nitro - NITRO_USE * dt);
      vmax = r.isPlayer ? VNITRO : VMAX * 1.28;
    } else {
      r.nitro = Math.min(1, r.nitro + 0.022 * dt);
    }
    r.nitroOn = wantNitro;
    if (r.boostTimer > 0) {
      r.boostTimer -= dt;
      vmax = Math.max(vmax, VBOOST);
    }
    // longitudinal
    if (inp.throttle > 0) {
      if (r.v < vmax) r.v += ((vmax - r.v) * (wantNitro ? 1.5 : 0.8) + 6) * inp.throttle * dt;
      else r.v += (vmax - r.v) * 0.9 * dt;
    } else {
      r.v -= r.v * 0.26 * dt;
    }
    r.v -= inp.brake * 100 * dt;
    r.v -= (inp.airL + inp.airR) * 48 * dt;
    r.v = Math.max(0, r.v);
    r.airL = inp.airL;
    r.airR = inp.airR;
    r.thrSm = damp(r.thrSm, inp.throttle > 0 ? 1 : 0.1, 7, dt);

    // lateral
    const sf = 0.35 + 0.65 * Math.min(1, r.v / 90);
    r.steer += (inp.steer - r.steer) * Math.min(1, dt * 9);
    let a = r.steer * 70 * sf + (inp.airR - inp.airL) * 38 * sf;
    a -= fr.kappa * r.v * r.v * 0.3;
    a -= r.vd * 3.0;
    r.vd += a * dt;
    r.d += r.vd * dt;
    // steering scrub
    r.v -= Math.abs(r.vd) * r.v * 0.0006 * dt * 60 * 0.1;

    // walls
    r.hitCool = Math.max(0, r.hitCool - dt);
    const wallLim = fr.half - 2.05;
    if (Math.abs(r.d) > wallLim) {
      const sd = Math.sign(r.d);
      r.d = sd * wallLim;
      if (r.vd * sd > 0) {
        const impact = Math.abs(r.vd);
        r.vd = -r.vd * 0.25;
        r.v *= 1 - Math.min(0.28, impact * 0.007);
        if (impact > 2.2 && r.hitCool <= 0) {
          r.hitCool = 0.25;
          this.onWallHit(r, impact, sd, fr);
        }
      }
      r.v -= r.v * 0.22 * dt;
      if (r.isPlayer && r.v > 40 && this.rnd() < 0.6) this.emitSparks(r, sd, fr, 1);
    }

    r.dist += r.v * dt;

    // boost pads
    for (const pad of tr.pads) {
      let ds = s - pad.s;
      ds = ((ds + L / 2) % L + L) % L - L / 2;
      if (Math.abs(ds) < 14 && Math.abs(r.d - pad.d) < 6.5 && r.boostTimer < 1.0) {
        r.boostTimer = 1.5;
        r.v = Math.max(r.v, Math.min(VBOOST, r.v + 22));
        if (r.isPlayer) {
          this.boostFlash = 1;
          this.audio.boost();
        }
      }
    }

    // laps
    const lapsDone = Math.floor(r.dist / L);
    if (lapsDone > r.lapsDone && !r.finished) {
      r.lapsDone = lapsDone;
      const lt = this.raceTime - r.lapStart;
      r.lastLap = lt;
      r.bestLap = Math.min(r.bestLap, lt);
      r.lapStart = this.raceTime;
      if (lapsDone >= this.laps) {
        r.finished = true;
        r.finishTime = this.raceTime;
      } else if (r.isPlayer) {
        this.lapFlash = 3;
        this.audio.beep(880, 0.25, 0.2, "sine");
      }
    }

    // energy regen slowly
    if (r.isPlayer && r.energy < 1) r.energy = Math.min(1, r.energy + 0.004 * dt);
  }

  private onWallHit(r: Racer, impact: number, side: number, fr: Frame) {
    if (!r.isPlayer) return;
    const dmg = impact * 0.011;
    r.energy = Math.max(0, r.energy - dmg);
    this.shake = Math.min(1.2, this.shake + impact * 0.04);
    this.hitFlash = Math.min(1, this.hitFlash + impact * 0.04);
    this.audio.hit(impact / 22);
    this.emitSparks(r, side, fr, 16);
  }

  private emitSparks(r: Racer, side: number, fr: Frame, n: number) {
    const p = this.tmpV.copy(fr.pos).addScaledVector(fr.R, side * (fr.half - 0.6)).addScaledVector(fr.N, 1.1);
    for (let i = 0; i < n; i++) {
      const v = this.tmpV2
        .copy(fr.T)
        .multiplyScalar(r.v * (0.35 + this.rnd() * 0.5))
        .addScaledVector(fr.R, -side * (4 + this.rnd() * 14))
        .addScaledVector(fr.N, 4 + this.rnd() * 12);
      v.x += (this.rnd() - 0.5) * 8;
      v.z += (this.rnd() - 0.5) * 8;
      this.sparks.emit(p, v, 0.35 + this.rnd() * 0.5, 2.6, 1.2 + this.rnd() * 0.6, 0.35);
    }
  }

  private collide(dt: number) {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const dd = a.dist - b.dist;
        const ad = Math.abs(dd);
        if (ad < 5 && Math.abs(a.d - b.d) < 3.1) {
          const sgn = a.d >= b.d ? 1 : -1;
          const overlap = 3.1 - Math.abs(a.d - b.d);
          a.d += sgn * overlap * 0.5;
          b.d -= sgn * overlap * 0.5;
          a.vd += sgn * 6 * overlap * dt * 8;
          b.vd -= sgn * 6 * overlap * dt * 8;
          const front = dd > 0 ? a : b;
          const back = dd > 0 ? b : a;
          if (back.v > front.v) back.v = back.v + (front.v - back.v) * Math.min(1, dt * 4);
          if ((a.isPlayer || b.isPlayer) && overlap > 0.6 && (a.isPlayer ? a : b).hitCool <= 0) {
            const pl = a.isPlayer ? a : b;
            pl.hitCool = 0.3;
            pl.energy = Math.max(0, pl.energy - 0.015);
            this.shake = Math.min(1, this.shake + 0.25);
            this.hitFlash = Math.min(1, this.hitFlash + 0.2);
            this.audio.hit(0.4);
          }
        }
      }
    }
  }

  private updatePickups(dt: number) {
    const L = this.track.length;
    const p = this.player;
    const ps = this.track.wrapS(this.track.startS + p.dist);
    for (const pk of this.pickups) {
      if (pk.timer > 0) {
        pk.timer -= dt;
        if (pk.timer <= 0) pk.group.visible = true;
        continue;
      }
      let ds = ps - pk.s;
      ds = ((ds + L / 2) % L + L) % L - L / 2;
      if (Math.abs(ds) < 5 && Math.abs(p.d - pk.d) < 4.2) {
        pk.timer = 7;
        pk.group.visible = false;
        p.nitro = Math.min(1, p.nitro + 0.45);
        this.audio.pickup();
      }
    }
  }

  /* ---------------------- Visuals ---------------------- */
  private updateVisuals(dt: number, snap: boolean) {
    const tr = this.track;
    const f = this.f1;
    for (const r of this.racers) {
      const s = tr.wrapS(tr.startS + r.dist);
      tr.sample(s, f);
      const ship = r.ship;
      const bob = Math.sin(this.time * 2.2 + r.id * 1.7) * 0.06;
      r.worldPos.copy(f.pos).addScaledVector(f.R, r.d).addScaledVector(f.N, ship.hover + bob);
      ship.root.position.copy(r.worldPos);
      this.tmpM.makeBasis(this.tmpV.copy(f.R).negate(), f.N, f.T);
      ship.root.quaternion.setFromRotationMatrix(this.tmpM);

      const yawT = -Math.atan2(r.vd, Math.max(r.v, 40)) * 1.0 - r.steer * 0.1;
      const rollT = r.steer * 0.55 + (r.airR - r.airL) * 0.22 + clamp(-r.vd * 0.006, -0.15, 0.15) * 0;
      const pitchT = -r.nitroF * 0.05 + (r.thrSm < 0.2 && r.v > 20 ? 0.03 : 0) + Math.sin(this.time * 1.3 + r.id) * 0.01;
      if (snap) {
        r.yaw = yawT;
        r.roll = rollT;
        r.pitch = pitchT;
      } else {
        r.yaw = damp(r.yaw, yawT, 8, dt);
        r.roll = damp(r.roll, rollT, 7, dt);
        r.pitch = damp(r.pitch, pitchT, 5, dt);
      }
      ship.model.rotation.set(r.pitch, r.yaw, r.roll, "YXZ");
      const nTarget = r.nitroOn || r.boostTimer > 0.2 ? 1 : 0;
      r.nitroF = snap ? 0 : damp(r.nitroF, nTarget, nTarget > r.nitroF ? 10 : 4, dt);
      ship.updateFlames(r.thrSm, r.nitroF, this.time);
      const blink = Math.sin(this.time * 6 + r.id) > 0.3 ? 1 : 0.15;
      ship.navLeft.visible = blink > 0.5;
      ship.navRight.visible = blink > 0.5;

      // nitro embers
      if (r.nitroF > 0.4 && !snap) {
        const n = Math.round(dt * 70 * r.nitroF);
        for (let i = 0; i < n; i++) {
          const side = this.rnd() < 0.5 ? -1 : 1;
          const p = this.tmpV
            .set(side * 1.08, 0.2, -2.7)
            .applyQuaternion(ship.model.quaternion)
            .applyQuaternion(ship.root.quaternion)
            .add(ship.root.position);
          const v = this.tmpV2.copy(f.T).multiplyScalar(-r.v * 0.35 - 6).addScaledVector(f.R, (this.rnd() - 0.5) * 7);
          v.y += (this.rnd() - 0.3) * 4;
          const c = ship.palette.flame;
          this.embers.emit(p.clone(), v.clone(), 0.35 + this.rnd() * 0.35, c[0] * 0.8 + 0.3, c[1] * 0.8 + 0.3, c[2] * 0.8 + 0.3);
        }
      }
    }
    // pickups
    for (const pk of this.pickups) {
      pk.core.rotation.y += dt * 2.2;
      pk.core.position.y = Math.sin(this.time * 2 + pk.s) * 0.25;
    }
  }

  private snapCamera() {
    const p = this.player;
    this.updateCamera(0.016, true);
    this.camPos.copy(this.camera.position);
    void p;
  }

  private updateCamera(dt: number, snap = false) {
    const tr = this.track;
    const p = this.player;
    const cam = this.camera;
    const L = tr.length;
    const s = tr.wrapS(tr.startS + p.dist);

    if (this.state === "menu") {
      const t = this.time;
      const a = Math.PI + Math.sin(t * 0.16) * 1.25;
      const R = 17 + Math.sin(t * 0.11) * 4;
      const c = p.worldPos;
      const f = tr.sample(s, this.f2);
      const pos = this.tmpV
        .copy(c)
        .addScaledVector(f.T, Math.cos(a) * R)
        .addScaledVector(f.R, Math.sin(a) * R);
      pos.addScaledVector(f.N, 4.2 + Math.sin(t * 0.23) * 1.6);
      if (snap) this.camPos.copy(pos);
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.camPos);
      const look = this.tmpV2.copy(c).addScaledVector(f.T, 6).addScaledVector(f.N, 2.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
      this.camFov = damp(this.camFov, 52, 3, dt);
      cam.fov = this.camFov;
      cam.updateProjectionMatrix();
      return;
    }

    const modes = [
      { back: 10.5, up: 3.7, look: 24, fov: 70 },
      { back: 6.8, up: 2.5, look: 22, fov: 74 },
      { back: 2.0, up: 1.55, look: 28, fov: 80 },
    ];
    const m = modes[this.camMode];
    const nit = p.nitroF;
    const back = m.back + nit * 2.6 + clamp(p.v / VNITRO, 0, 1) * 1.2;
    const lam = this.state === "countdown" ? 2.2 : 9;
    this.camD = snap ? p.d * 0.8 : damp(this.camD, p.d * 0.82, lam * 0.6, dt);
    this.camLookD = snap ? p.d * 0.7 : damp(this.camLookD, p.d * 0.7, lam * 0.8, dt);
    const fc = tr.sample(s - back, this.f2);
    const target = this.tmpV.copy(fc.pos).addScaledVector(fc.R, this.camD).addScaledVector(fc.N, ship_hover() + m.up);
    // camera descending to chase in countdown
    if (this.state === "countdown") {
      const k = clamp((this.cdElapsed - 0.0) / 2.4, 0, 1);
      const e = k * k * (3 - 2 * k);
      const hi = new THREE.Vector3().copy(target).addScaledVector(fc.N, (1 - e) * 5).addScaledVector(fc.T, -(1 - e) * 10);
      target.copy(hi);
    }
    if (snap) this.camPos.copy(target);
    else this.camPos.lerp(target, 1 - Math.exp(-dt * (this.state === "countdown" ? 3 : 60)));
    cam.position.copy(this.camPos);
    const fl = tr.sample(s + m.look, this.f3);
    const look = this.tmpV2.copy(fl.pos).addScaledVector(fl.R, this.camLookD).addScaledVector(fl.N, 1.3);
    // shake
    if (this.shake > 0.001) {
      const sk = this.shake * 0.35;
      cam.position.x += (this.rnd() - 0.5) * sk;
      cam.position.y += (this.rnd() - 0.5) * sk;
      cam.position.z += (this.rnd() - 0.5) * sk;
    }
    const nitroShake = p.nitroF * 0.05 * clamp(p.v / VNITRO, 0.3, 1);
    cam.position.x += (this.rnd() - 0.5) * nitroShake;
    cam.position.y += (this.rnd() - 0.5) * nitroShake;
    cam.up.copy(fc.N).lerp(new THREE.Vector3(0, 1, 0), 0.4).normalize();
    cam.lookAt(look);
    this.camRoll = damp(this.camRoll, -p.steer * 0.035 - p.vd * 0.0016, 5, dt);
    cam.rotateZ(this.camRoll);
    const targetFov = m.fov + clamp(p.v / VNITRO, 0, 1) * 9 + nit * 15 + (p.boostTimer > 0 ? 4 : 0);
    this.camFov = snap ? targetFov : damp(this.camFov, targetFov, 4, dt);
    cam.fov = this.camFov;
    cam.updateProjectionMatrix();
    void L;
  }

  /** hollow-earth zone blending: lights, fog, environment map, particles */
  private updateZone(dt: number) {
    const tr = this.track;
    const p = this.player;
    const sP = tr.wrapS(tr.startS + p.dist);
    const target =
      this.state === "menu"
        ? 0
        : smoothstep(sP, tr.caveS0 + 40, tr.caveS0 + 210) * (1 - smoothstep(sP, tr.caveS1 - 210, tr.caveS1 - 40));
    this.cf = damp(this.cf, target, 6, dt);
    if (Math.abs(this.cf - target) < 0.0005) this.cf = target;
    const cf = this.cf;
    const inside = cf > 0.5;
    if (inside && !this.wasInCave) this.zoneT = 3.6;
    this.wasInCave = inside;
    this.zoneT = Math.max(0, this.zoneT - dt);

    this.sun.intensity = lerp(3.3, 1.2, cf);
    this.sun.color.lerpColors(SUN_COL, CAVE_KEY_COL, cf);
    this.lightDir.lerpVectors(SUN_DIR, CAVE_DIR, cf).normalize();
    this.hemi.color.lerpColors(HEMI_SKY, CAVE_HEMI_SKY, cf);
    this.hemi.groundColor.lerpColors(HEMI_GROUND, CAVE_HEMI_GROUND, cf);
    this.hemi.intensity = lerp(0.55, 0.5, cf);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.lerpColors(HORIZON, CAVE_FOG, cf);
    fog.density = lerp(0.00042, 0.00052, cf);
    this.scene.environment = inside ? this.envCave : this.envSky;
    this.scene.environmentIntensity = inside ? lerp(0.35, 0.55, (cf - 0.5) * 2) : lerp(1.0, 0.35, cf * 2);
    this.renderer.toneMappingExposure = lerp(1.0, 1.0, cf);
    this.trackBuild.roadMat.emissive.setScalar(0.03 * cf);
    this.trackBuild.wallMat.emissive.setScalar(0.08 * cf);

    // falling snow turns into drifting spores
    const sm = this.snow.material as THREE.PointsMaterial;
    sm.color.setRGB(lerp(1, 0.55, cf), lerp(1, 1, cf), lerp(1, 0.9, cf));
    sm.size = lerp(0.42, 0.85, cf);
    sm.opacity = lerp(0.85, 0.75, cf);
    this.cave.group.visible = sP > tr.caveS0 - 450 && sP < tr.caveS1 + 450;
    this.cave.update(this.time, cf);
  }

  private updateFx(dt: number) {
    const p = this.player;
    const cam = this.camera;
    this.shake = damp(this.shake, 0, 6, dt);
    this.hitFlash = damp(this.hitFlash, 0, 3, dt);
    this.boostFlash = damp(this.boostFlash, 0, 2.2, dt);
    this.lapFlash = Math.max(0, this.lapFlash - dt);
    this.updateZone(dt);
    const speedN = clamp(p.v / VNITRO, 0, 1);
    const targetBoost = clamp(p.nitroF * 0.85 + Math.max(0, speedN - 0.85) * 0.6 + (p.boostTimer > 0 ? 0.25 : 0), 0, 1);
    this.fxBoost = damp(this.fxBoost, this.state === "menu" ? 0 : targetBoost, 5, dt);
    this.finalPass.uniforms.uBoost.value = this.fxBoost;
    this.finalPass.uniforms.uTime.value = this.time;
    this.bloom.strength = (this.quality === "medium" ? 0.14 : 0.2) + this.fxBoost * 0.07 + this.cf * 0.04;

    // streaks
    const stMat = this.streaks.material as THREE.LineBasicMaterial;
    const sk = clamp((p.v - 70) / 170, 0, 1);
    stMat.opacity = this.state === "menu" ? 0 : sk * 0.05 + p.nitroF * 0.12;
    const NS = this.streakData.length / 6;
    const len = 1 + sk * 14 + p.nitroF * 12;
    for (let i = 0; i < NS; i++) {
      let z = this.streakData[i * 6 + 2] + p.v * 0.9 * dt;
      if (z > -3) {
        this.resetStreak(i);
        z = this.streakData[i * 6 + 2];
      }
      this.streakData[i * 6 + 2] = z;
      this.streakData[i * 6 + 5] = z - len * (0.6 + (i % 5) * 0.2);
    }
    (this.streaks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // snow
    const sp = this.snow.geometry.attributes.position as THREE.BufferAttribute;
    const arr = sp.array as Float32Array;
    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    const SN = arr.length / 3;
    for (let i = 0; i < SN; i++) {
      let x = this.snowPos[i * 3] - Math.sin(this.time * 0.3 + i) * dt * 1.2 + dt * 2;
      let y = this.snowPos[i * 3 + 1] - dt * (3 + (i % 7) * 0.5) * lerp(1, -0.28, this.cf);
      const z = this.snowPos[i * 3 + 2];
      if (y < -40) y += 80;
      if (y > 40) y -= 80;
      if (x > 80) x -= 160;
      this.snowPos[i * 3] = x;
      this.snowPos[i * 3 + 1] = y;
      // wrap around camera
      let rx = x - cx;
      let rz = z - cz;
      rx = ((((rx + 80) % 160) + 160) % 160) - 80;
      rz = ((((rz + 80) % 160) + 160) % 160) - 80;
      x = cx + rx;
      arr[i * 3] = x;
      arr[i * 3 + 1] = cy + y;
      arr[i * 3 + 2] = cz + rz;
    }
    sp.needsUpdate = true;

    this.sparks.update(dt);
    this.embers.update(dt);

    // engine light on player
    this.engineLight.position.copy(p.worldPos).addScaledVector(this.f2.T, -3.5).addScaledVector(this.f2.N, 0.8);
    this.engineLight.intensity = p.nitroF * 70 + p.thrSm * 6;
    const c = p.ship.palette.flame;
    this.engineLight.color.setRGB(Math.min(1, c[0] / 2 + 0.2), Math.min(1, c[1] / 2 + 0.2), Math.min(1, c[2] / 2 + 0.2));

    // sun shadow follows player
    const focus = this.tmpV.copy(p.worldPos).addScaledVector(this.f2.T, 40);
    const zA = this.lightDir;
    const xA = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), zA).normalize();
    const yA = new THREE.Vector3().crossVectors(zA, xA);
    const texel = 280 / this.shadowSize;
    const fx = Math.floor(focus.dot(xA) / texel) * texel;
    const fy = Math.floor(focus.dot(yA) / texel) * texel;
    const fz = focus.dot(zA);
    const snapped = new THREE.Vector3().addScaledVector(xA, fx).addScaledVector(yA, fy).addScaledVector(zA, fz);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.lightDir, 320);
    this.sun.target.updateMatrixWorld();
  }

  private render(_dt: number) {
    void _dt;
    this.composer.render();
  }

  private makeHud(): HudData {
    const p = this.player;
    const L = this.track.length;
    const map: MapDot[] = this.racers.map((r) => {
      const [x, y] = this.mapProj(r.worldPos.x, r.worldPos.z);
      return { x, y, me: r.isPlayer, color: r.color };
    });
    const cdStep = this.state === "countdown" ? (this.cdElapsed < 1.2 ? -1 : this.cdElapsed < 2.2 ? 3 : this.cdElapsed < 3.2 ? 2 : 1) : -1;
    void L;
    return {
      state: this.state,
      speed: Math.round(p.v * 2.3),
      speedN: clamp(p.v / VNITRO, 0, 1),
      lap: Math.min(this.laps, p.lapsDone + 1),
      laps: this.laps,
      pos: p.rank,
      total: this.racers.length,
      time: this.raceTime,
      lapTime: this.state === "racing" ? this.raceTime - p.lapStart : p.lastLap,
      bestLap: isFinite(p.bestLap) ? p.bestLap : 0,
      lastLap: p.lastLap,
      energy: p.energy,
      nitro: p.nitro,
      nitroActive: p.nitroOn,
      boost: this.boostFlash,
      hit: this.hitFlash,
      countdown: this.state === "countdown" ? cdStep : this.goTimer > 0 ? 0 : -1,
      critical: p.energy <= 0.001,
      go: this.goTimer,
      map,
      cam: this.camMode,
      lapFlash: this.lapFlash,
      zone: "HOLLOW EARTH",
      zoneT: this.zoneT,
    };
  }

  getMapPath() {
    return this.mapPath;
  }

  toggleFullscreen() {
    const el = this.container.parentElement ?? this.container;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.resizeObs.disconnect();
    this.audio.update(0, 0, 0, false);
    this.audio.ctx?.close();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function ship_hover() {
  return 1.25;
}
