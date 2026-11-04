import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HW, PAD_HALF_LEN, PAD_HALF_WID, Track, makeFrame } from './track';
import { buildScenery } from './scenery';
import { TRACKS } from './trackDefs';
import { Ship, TEAMS, Team, Trail, createShip } from './ship';
import { GameAudio } from './audio';
import { Cockpit, FISHEYE } from './cockpit';
import { RainSystem } from './weather';
import { SUN_DIR, HORIZON, createSkyEnvironment, createCaveEnvironment } from './sky';

export type Phase = 'loading' | 'menu' | 'countdown' | 'racing' | 'finished';

export interface ResultRow {
  name: string;
  team: string;
  time: number | null;
  best: number | null;
  isPlayer: boolean;
  color: number;
}

export interface HudState {
  phase: Phase;
  speed: number;
  energy: number;
  boosting: boolean;
  lap: number;
  laps: number;
  pos: number;
  total: number;
  time: number;
  lapTime: number;
  best: number | null;
  last: number | null;
  countdown: number;
  message: string | null;
  messageId: number;
  results: ResultRow[] | null;
  teamIdx: number;
  paused: boolean;
  muted: boolean;
  music: boolean;
  camMode: 'chase' | 'cockpit';
  raining: boolean;
  boomId: number;
  boomActive: boolean;
  trackIdx: number;
  trackName: string;
}

const LAPS = 3;
const BASE_MAX = 225;
const BOOST_ADD = 115;
const KMH = 2.4;
const WALL = HW - 3.0;
const AI_NAMES = ['RAVEN', 'KIRA', 'TITAN', 'ZEPHYR', 'ORION', 'MAKO', 'VEGA'];

interface Racer {
  name: string;
  team: Team;
  ship: Ship;
  trails: Trail[];
  isPlayer: boolean;
  auto: boolean;
  p: number;
  lat: number;
  latVel: number;
  speed: number;
  yaw: number;
  roll: number;
  pitch: number;
  steer: number;
  hover: number;
  phase: number;
  lapIdx: number;
  lapStart: number;
  bestLap: number;
  lastLap: number;
  finished: boolean;
  finishTime: number;
  energy: number;
  boosting: boolean;
  padTimer: number;
  padLatch: number;
  skill: number;
  lane: number;
  wallCool: number;
  throttle: number;
  boostVis: number;
  aiBoostCd: number;
  slot: number;
  blob: THREE.Mesh;
}

const clamp = THREE.MathUtils.clamp;
const CLEAR_FOG = HORIZON.clone();
const RAIN_FOG = new THREE.Color().copy(HORIZON).multiplyScalar(0.78);

const fxShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAmount: { value: 0 },
    uDistort: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uDistort;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      // barrel / fisheye (corners stay fixed, centre is magnified a little)
      vec2 ca = c * vec2(1.7778, 1.0);
      float r2 = dot(ca, ca);
      vec2 uv = clamp(0.5 + c * (1.0 + uDistort * r2) / (1.0 + uDistort * 1.0399), 0.001, 0.999);
      // Keep every sample inside the render target; extreme NOS blur used to create dark edge artefacts.
      float amt = uAmount;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      if (amt > 0.001) {
        vec2 shift = c * amt;
        col = col * 0.52
          + texture2D(tDiffuse, clamp(uv - shift * 0.34, 0.001, 0.999)).rgb * 0.26
          + texture2D(tDiffuse, clamp(uv - shift * 0.68, 0.001, 0.999)).rgb * 0.14
          + texture2D(tDiffuse, clamp(uv - shift, 0.001, 0.999)).rgb * 0.08;
      }
      gl_FragColor = vec4(clamp(col, 0.0, 10.0), 1.0);
    }`,
};

export class Game {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.4, 7000);
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  fx!: ShaderPass;
  track!: Track;
  trackIdx = 0;
  private sceneryRoot: THREE.Group | null = null;
  private gf = makeFrame();
  audio = new GameAudio();
  rain!: RainSystem;
  raining = true;
  rainLevel = 1;
  minimapCanvas: HTMLCanvasElement | null = null;
  private minimapBase: HTMLCanvasElement | null = null;

  phase: Phase = 'loading';
  racers: Racer[] = [];
  player!: Racer;
  teamIdx = 0;
  paused = false;
  private keys = new Set<string>();
  private time = 0;
  private raceTime = 0;
  private countdownT = 0;
  private lastBeep = -1;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private hudTimer = 0;
  private lastCockpitHud = -Infinity;
  private message: { text: string; id: number; until: number } | null = null;
  private msgId = 0;
  private onHud: (h: HudState) => void;

  private fr = makeFrame();
  private pf = makeFrame();
  private chaseFrame = makeFrame();
  private lookFrame = makeFrame();
  private camOff = new THREE.Vector3(0, 4, -12);
  private chaseLat = 0;
  private lookOff = new THREE.Vector3(0, 0, 20);
  private camUp = new THREE.Vector3(0, 1, 0);
  private shake = 0;
  private boomPulse = 0;
  private boomUntil = 0;
  private boomId = 0;
  private sun!: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  private pLight!: THREE.PointLight;
  private pads: THREE.Texture | null = null;
  private clouds: THREE.Sprite[] = [];
  cockpit!: Cockpit;
  camMode: 'chase' | 'cockpit' = 'chase';
  private tQ = new THREE.Quaternion();
  private flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  private scrapeLevel = 0;
  private nearId = -1;
  private nearDist = 0;
  private rim!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private blobMat!: THREE.MeshBasicMaterial;
  private dust!: THREE.Points;
  private dustVel!: Float32Array;

  // speed lines
  private lines!: THREE.LineSegments;
  private linePos!: Float32Array;
  private lineBase: Float32Array = new Float32Array(0);
  private static LN = 170;
  // sparks
  private sparks!: THREE.Points;
  private sparkPos = new Float32Array(300 * 3);
  private sparkVel = new Float32Array(300 * 3);
  private sparkLife = new Float32Array(300);
  private sparkIdx = 0;

  private tV = new THREE.Vector3();
  private tV2 = new THREE.Vector3();
  private tV3 = new THREE.Vector3();
  private tV4 = new THREE.Vector3();
  private tM = new THREE.Matrix4();
  private tC = new THREE.Color();

  constructor(container: HTMLElement, onHud: (h: HudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = this.renderer.domElement;
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.display = 'block';
    container.appendChild(cv);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onPointer);
    if (location.search.includes('debug')) (window as unknown as { __game: Game }).__game = this;
  }

  setMinimap(c: HTMLCanvasElement | null) {
    this.minimapCanvas = c;
  }

  async init() {
    // ---- HDRI sky & Environment (from Aether Rift) ----
    createSkyEnvironment(this.renderer, this.scene);
    if (this.disposed) return;
    this.sunDir.copy(SUN_DIR);
    this.cockpit = new Cockpit(this.scene.environment as THREE.Texture);
    this.scene.fog = new THREE.FogExp2(HORIZON.getHex(), 0.00012);

    // ---- lights (from Aether Rift) ----
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
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
    this.sun.shadow.radius = 2;
    this.sun.intensity = 3.3;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x9a8a72, 0.55);
    this.scene.add(this.hemi);

    this.rim = new THREE.DirectionalLight(0x9fc4ff, 0.6);
    this.rim.position.set(-120, 60, -90);
    this.scene.add(this.rim, this.rim.target);

    this.renderer.toneMappingExposure = 1.0;
    this.pLight = new THREE.PointLight(0x40c0ff, 300, 45, 2);
    this.scene.add(this.pLight);

    // ---- world ----
    this.buildWorld();

    // ---- fx objects ----
    this.scene.add(this.camera);
    this.buildSpeedLines();
    this.buildDust();
    this.rain = new RainSystem(this.scene);
    this.blobMat = new THREE.MeshBasicMaterial({
      map: this.blobTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0x05070b,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      fog: false,
    });
    this.buildSparks();

    this.buildRacers();
    this.resetRace();

    // ---- post ----
    const rt = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.16, 0.45, 1.55);
    this.composer.addPass(this.bloom);
    this.fx = new ShaderPass(fxShader);
    this.composer.addPass(this.fx);
    this.composer.addPass(new OutputPass());

    this.cockpit.setTeam(TEAMS[this.teamIdx]);
    this.resize();
    window.addEventListener('resize', this.resize);

    this.phase = 'menu';
    this.last = performance.now();
    this.loop();
  }

  // -------------------------------------------------------------- setup
  private disposeTree(o: THREE.Object3D) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) {
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
          const t = (mm as THREE.MeshBasicMaterial).map;
          if (t) t.dispose();
          mm.dispose();
        }
      }
    });
  }

  private buildWorld() {
    if (this.track) {
      this.scene.remove(this.track.group);
      this.disposeTree(this.track.group);
    }
    if (this.sceneryRoot) {
      this.scene.remove(this.sceneryRoot);
      this.disposeTree(this.sceneryRoot);
    }
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.track = new Track(aniso, TRACKS[this.trackIdx]);
    this.track.setWetness(this.rainLevel);
    this.scene.add(this.track.group);
    this.pads = this.track.padTex;
    const sc = buildScenery(this.track, this.scene, aniso, this.trackIdx);
    this.sceneryRoot = sc.root;
    this.clouds = sc.clouds;
    this.buildMinimapBase();
  }

  setTrack(i: number) {
    if (i === this.trackIdx || this.phase !== 'menu') return;
    this.trackIdx = i;
    this.buildWorld();
    this.resetRace();
    this.camOff.set(0, 4, -12);
    this.emitHud();
  }

  private buildMinimapBase() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const pts = this.track.minimap;
    const draw = (w: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      pts.forEach((p, i) => {
        const x = 128 + p.x * 210,
          y = 128 + p.y * 210;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
      g.stroke();
    };
    draw(12, 'rgba(10,20,40,0.85)');
    draw(6, 'rgba(120,200,255,0.9)');
    // start marker
    const p0 = pts[0];
    g.fillStyle = '#ffe14a';
    g.fillRect(128 + p0.x * 210 - 6, 128 + p0.y * 210 - 3, 12, 6);
    this.minimapBase = c;
  }

  private buildSpeedLines() {
    const N = Game.LN;
    this.linePos = new Float32Array(N * 6);
    this.lineBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.respawnLine(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(0.8, 1.3, 2.0),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    this.lines.frustumCulled = false;
    this.camera.add(this.lines);
  }

  private respawnLine(i: number, init = false) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 16;
    this.lineBase[i * 3] = Math.cos(a) * r * 1.7;
    this.lineBase[i * 3 + 1] = Math.sin(a) * r;
    this.lineBase[i * 3 + 2] = init ? -2 - Math.random() * 80 : -80 - Math.random() * 20;
  }

  private blobTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  private buildDust() {
    const N = 300;
    const pos = new Float32Array(N * 3);
    this.dustVel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 1.6;
      this.dustVel[i * 3 + 1] = -0.4 - Math.random() * 1.2;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.5,
        map: this.blobTexture(),
        color: new THREE.Color(0.9, 0.96, 1.0),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  private updateDust(dt: number) {
    const cam = this.camera.position;
    const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const p = a.array as Float32Array;
    for (let i = 0; i < p.length / 3; i++) {
      p[i * 3] += this.dustVel[i * 3] * dt;
      p[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      p[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
      for (let k = 0; k < 3; k++) {
        const lim = k === 1 ? 26 : 60;
        const d = p[i * 3 + k] - (k === 0 ? cam.x : k === 1 ? cam.y : cam.z);
        if (d > lim) p[i * 3 + k] -= lim * 2;
        else if (d < -lim) p[i * 3 + k] += lim * 2;
      }
    }
    a.needsUpdate = true;
  }

  private buildSparks() {
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < 300; i++) this.sparkPos[i * 3 + 1] = -1e5;
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.55,
        color: new THREE.Color(3, 1.9, 0.6),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  private emitSparks(origin: THREE.Vector3, vel: THREE.Vector3, n: number, spread = 8) {
    for (let k = 0; k < n; k++) {
      const i = this.sparkIdx++ % 300;
      this.sparkPos[i * 3] = origin.x;
      this.sparkPos[i * 3 + 1] = origin.y;
      this.sparkPos[i * 3 + 2] = origin.z;
      this.sparkVel[i * 3] = vel.x + (Math.random() - 0.5) * spread;
      this.sparkVel[i * 3 + 1] = vel.y + Math.random() * spread * 0.7;
      this.sparkVel[i * 3 + 2] = vel.z + (Math.random() - 0.5) * spread;
      this.sparkLife[i] = 0.3 + Math.random() * 0.5;
    }
  }

  private makeRacer(name: string, team: Team, isPlayer: boolean, slot: number): Racer {
    const ship = createShip(team);
    this.scene.add(ship.group);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 11), this.blobMat);
    blob.renderOrder = 1;
    this.scene.add(blob);
    const trails = ship.nozzles.map(() => {
      const t = new Trail(ship.glowColor);
      this.scene.add(t.mesh);
      return t;
    });
    return {
      name,
      team,
      ship,
      trails,
      isPlayer,
      auto: false,
      p: 0,
      lat: 0,
      latVel: 0,
      speed: 0,
      yaw: 0,
      roll: 0,
      pitch: 0,
      steer: 0,
      hover: 1.7,
      phase: Math.random() * 6,
      lapIdx: -1,
      lapStart: 0,
      bestLap: Infinity,
      lastLap: Infinity,
      finished: false,
      finishTime: 0,
      energy: 100,
      boosting: false,
      padTimer: 0,
      padLatch: -1,
      skill: 0.9 + Math.random() * 0.09,
      lane: (Math.random() - 0.5) * 22,
      wallCool: 0,
      throttle: 0,
      boostVis: 0,
      aiBoostCd: 6 + Math.random() * 10,
      slot,
      blob,
    };
  }

  private disposeRacer(r: Racer) {
    this.scene.remove(r.ship.group, r.blob);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    r.ship.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
      const mesh = object as THREE.Mesh;
      if (object instanceof THREE.Mesh && mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    // The glow texture is shared across teams, so only dispose per-ship geometry and materials.
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    r.trails.forEach((trail) => {
      this.scene.remove(trail.mesh);
      trail.mesh.geometry.dispose();
      (trail.mesh.material as THREE.Material).dispose();
    });
    r.blob.geometry.dispose();
  }

  private buildRacers() {
    for (const r of this.racers) this.disposeRacer(r);
    this.racers = [];
    const playerSlot = 5;
    const others = TEAMS.map((_, i) => i).filter((i) => i !== this.teamIdx);
    let ai = 0;
    for (let slot = 0; slot < 8; slot++) {
      if (slot === playerSlot) {
        this.player = this.makeRacer('PLAYER', TEAMS[this.teamIdx], true, slot);
        this.racers.push(this.player);
      } else {
        this.racers.push(this.makeRacer(AI_NAMES[ai], TEAMS[others[ai]], false, slot));
        ai++;
      }
    }
  }

  private resetRace() {
    this.raceTime = 0;
    this.countdownT = 0;
    this.lastBeep = -1;
    this.message = null;
    this.boomPulse = 0;
    this.boomUntil = 0;
    this.lastCockpitHud = -Infinity;
    this.racers.forEach((r) => {
      const row = Math.floor(r.slot / 2);
      r.p = -(16 + row * 14);
      r.lat = r.slot % 2 === 0 ? -7 : 7;
      r.latVel = 0;
      r.speed = 0;
      r.yaw = r.roll = r.pitch = r.steer = 0;
      r.lapIdx = -1;
      r.lapStart = 0;
      r.bestLap = Infinity;
      r.lastLap = Infinity;
      r.finished = false;
      r.finishTime = 0;
      r.energy = 100;
      r.boosting = false;
      r.padTimer = 0;
      r.padLatch = -1;
      r.auto = false;
      r.boostVis = 0;
      r.aiBoostCd = 6 + Math.random() * 10;
      this.placeRacer(r);
      r.trails.forEach((t, i) => t.reset(this.nozzleWorld(r, i)));
    });
    this.camOff.set(0, 4, -12);
    this.chaseLat = this.player.lat * 0.65;
  }

  // -------------------------------------------------------------- public api
  startRace() {
    this.audio.start();
    this.resetRace();
    this.phase = 'countdown';
    this.paused = false;
    this.audio.resume();
    this.emitHud();
  }

  restart() {
    this.startRace();
  }

  toMenu() {
    this.resetRace();
    this.phase = 'menu';
    this.emitHud();
  }

  setTeam(i: number) {
    this.teamIdx = i;
    this.cockpit?.setTeam(TEAMS[i]);
    this.buildRacers();
    this.resetRace();
    this.emitHud();
  }

  togglePause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.paused = !this.paused;
      if (this.paused) this.audio.suspend();
      else this.audio.resume();
      this.emitHud();
    }
  }

  toggleMusic() {
    this.audio.toggleMusic();
    this.emitHud();
  }

  toggleCam() {
    this.setCamMode(this.camMode === 'chase' ? 'cockpit' : 'chase');
  }

  setCamMode(m: 'chase' | 'cockpit') {
    this.camMode = m;
    this.lastCockpitHud = -Infinity;
    if (m === 'chase' && this.player) this.chaseLat = this.player.lat * 0.65;
    if (m === 'chase' && this.player) this.player.ship.group.visible = true;
    this.emitHud();
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.emitHud();
  }

  toggleRain() {
    this.raining = !this.raining;
    if (!this.raining) this.cockpit?.easeRain();
    this.emitHud();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('resize', this.resize);
    this.audio.stop();
    if (this.rain) this.rain.dispose(this.scene);
    this.cockpit?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -------------------------------------------------------------- input
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    this.audio.start();
    if (e.repeat) return;
    if (e.code === 'KeyR' && (this.phase === 'racing' || this.phase === 'finished' || this.phase === 'countdown'))
      this.restart();
    if (e.code === 'Enter') {
      if (this.phase === 'menu' || this.phase === 'finished') this.startRace();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
    if (e.code === 'KeyM') this.toggleMute();
    if (e.code === 'KeyN') this.toggleMusic();
    if (e.code === 'KeyH') this.toggleRain();
    if (e.code === 'KeyC' || e.code === 'KeyV') this.toggleCam();
    if (this.phase === 'menu') {
      if (e.code === 'ArrowLeft') this.setTeam((this.teamIdx + TEAMS.length - 1) % TEAMS.length);
      if (e.code === 'ArrowRight') this.setTeam((this.teamIdx + 1) % TEAMS.length);
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') this.setTrack((this.trackIdx + 1) % TRACKS.length);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
  };
  private onPointer = () => {
    this.audio.start();
  };

  private resize = () => {
    const w = Math.max(2, this.container.clientWidth);
    const h = Math.max(2, this.container.clientHeight);
    // Cap the actual render target, not the CSS viewport: bloom and MSAA allocate several full-size buffers.
    const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, 1920 / w, 1080 / h));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cockpit?.resize(w / h);
  };

  doResize() {
    this.resize();
  }

  // -------------------------------------------------------------- loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
    }
    this.composer.render();
    if (this.camMode === 'cockpit' && this.phase !== 'menu' && this.phase !== 'loading') {
      // Draw the near-field cockpit after HDR bloom/blur, so it never inherits world depth or boost artefacts.
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(null);
      this.renderer.clearDepth();
      this.renderer.render(this.cockpit.scene, this.cockpit.camera);
      this.renderer.autoClear = autoClear;
    }
  };

  private update(dt: number) {
    const time = this.time;
    this.scrapeLevel = 0;
    this.boomPulse = Math.max(0, this.boomPulse - dt * 2.4);
    this.updateWeather(dt);

    // phase handling
    if (this.phase === 'countdown') {
      this.countdownT += dt;
      const n = Math.floor(this.countdownT);
      if (n !== this.lastBeep && n <= 3) {
        this.lastBeep = n;
        if (n < 3) this.audio.beep(440, 0.25, 0.25);
        else {
          this.audio.beep(880, 0.6, 0.3);
          this.phase = 'racing';
          this.say('GO!', 1.2);
        }
      }
    }
    const live = this.phase === 'racing' || this.phase === 'finished';
    if (live) this.raceTime += dt;

    if (this.pads) this.pads.offset.y -= dt * 0.9;

    for (const r of this.racers) {
      if (live) this.updateRacer(r, dt);
      else {
        r.speed = 0;
        r.throttle = 0;
      }
    }
    if (live) this.collide(dt);
    for (const r of this.racers) this.placeRacer(r);
    this.visuals(dt);
    this.updateCamera(dt);
    this.rain.update(dt, this.camera, this.rainLevel, this.player.speed);
    if (this.camMode === 'cockpit' && this.phase !== 'menu') this.cockpit.updateRain(dt, this.rainLevel, this.player.speed);
    this.updateFx(dt);

    // hud
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.05;
      this.emitHud();
    }
    void time;
  }

  private say(text: string, dur = 2) {
    this.message = { text, id: ++this.msgId, until: this.time + dur };
  }

  private updateWeather(dt: number) {
    const target = this.raining ? 1 : 0.055;
    this.rainLevel += (target - this.rainLevel) * (1 - Math.exp(-2.2 * dt));
    this.track.setWetness(this.rainLevel);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(CLEAR_FOG).lerp(RAIN_FOG, this.rainLevel);
    fog.density = THREE.MathUtils.lerp(0.00011, 0.00023, this.rainLevel);
    this.scene.backgroundIntensity = THREE.MathUtils.lerp(1, 0.83, this.rainLevel);
    this.sun.intensity = THREE.MathUtils.lerp(3.3, 2.7, this.rainLevel);
    this.hemi.intensity = THREE.MathUtils.lerp(0.55, 0.65, this.rainLevel);
  }

  // -------------------------------------------------------------- physics
  private updateRacer(r: Racer, dt: number) {
    if (r.isPlayer && !r.auto) this.drivePlayer(r, dt);
    else this.driveAI(r, dt);

    r.speed = Math.max(0, r.speed - this.track.frameAt(r.p, this.gf).t.y * 42 * dt);
    r.p += r.speed * dt;

    const idx = Math.floor(r.p / this.track.L);
    if (idx > r.lapIdx) {
      r.lapIdx = idx;
      if (idx === 0) r.lapStart = this.raceTime;
      else {
        const lt = this.raceTime - r.lapStart;
        r.lastLap = lt;
        r.bestLap = Math.min(r.bestLap, lt);
        r.lapStart = this.raceTime;
      }
      if (idx >= LAPS && !r.finished) {
        r.finished = true;
        r.finishTime = this.raceTime;
        if (r.isPlayer) {
          r.auto = true;
          this.phase = 'finished';
          this.say('FINISH!', 3);
          this.audio.beep(660, 0.7, 0.3);
        }
      } else if (r.isPlayer && !r.finished && idx > 0) {
        this.say(idx === LAPS - 1 ? 'FINAL LAP' : `LAP ${idx + 1}`, 2);
      }
    }
  }

  private drivePlayer(r: Racer, dt: number) {
    const k = this.keys;
    const throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    const brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    // Positive track lateral is screen-right; D/E steer right and A/Q steer left.
    const steerIn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ab = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    const nitro = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space');

    const want = nitro && r.energy > 0.5 && (r.boosting || r.energy > 12);
    if (want && !r.boosting) this.audio.boostStart();
    r.boosting = want;
    if (r.boosting) r.energy = Math.max(0, r.energy - 30 * dt);
    else r.energy = Math.min(100, r.energy + 6 * dt);
    if (r.padTimer > 0) r.padTimer -= dt;
    const boostActive = r.boosting || r.padTimer > 0;

    // pads
    const L = this.track.L;
    const sR = this.track.wrap(r.p);
    let onPad = false;
    for (let i = 0; i < this.track.pads.length; i++) {
      const pd = this.track.pads[i];
      const d = ((sR - pd.s + L * 1.5) % L) - L / 2;
      if (Math.abs(d) < PAD_HALF_LEN + r.speed * dt * 0.25 && Math.abs(r.lat - pd.lat) < PAD_HALF_WID + 1.5) {
        onPad = true;
        if (r.padLatch === i) continue;
        r.padLatch = i;
        r.padTimer = 2.4;
        r.energy = Math.min(100, r.energy + 20);
        r.speed = Math.min(r.speed + 42, BASE_MAX + BOOST_ADD + 20);
        this.audio.sonicBoom();
        this.shake = Math.max(this.shake, 0.52);
        this.boomPulse = 1;
        this.boomUntil = this.time + 1.05;
        this.boomId++;
        if (this.camMode === 'cockpit') this.cockpit.rain.blast();
      }
    }
    if (!onPad) r.padLatch = -1;

    r.throttle = throttle;
    this.drive(r, dt, throttle, brake, steerIn, ab, boostActive);
  }

  private drive(r: Racer, dt: number, throttle: number, brake: number, steerIn: number, ab: number, boostActive: boolean) {
    // speed
    const target = boostActive ? BASE_MAX + BOOST_ADD : throttle ? BASE_MAX : 0;
    const rate = boostActive ? 1.5 : throttle ? (r.speed > BASE_MAX ? 0.8 : 1.1) : 0.3;
    r.speed += (target - r.speed) * (1 - Math.exp(-rate * dt));
    if (throttle && r.speed < 60) r.speed += 40 * dt;
    if (brake) r.speed = Math.max(0, r.speed - 170 * dt);
    if (ab !== 0) r.speed = Math.max(0, r.speed - 48 * Math.abs(ab) * dt);

    // lateral
    const kc = this.track.curvatureAt(r.p);
    const response = steerIn !== 0 && steerIn * r.steer < 0 ? 27 : 15;
    r.steer += (steerIn - r.steer) * (1 - Math.exp(-response * dt));
    const steerEff = clamp(r.steer + ab * 1.05, -2.05, 2.05);
    // Ease steering into a barrier, but keep full authority when turning back towards the road.
    const edge = clamp((Math.abs(r.lat) - (WALL - 8)) / 8, 0, 1);
    const edgeGrip = r.lat * steerEff > 0 ? 1 - edge * 0.55 : 1;
    const countersteer = steerEff * r.latVel < 0 ? 1.35 : 1;
    const latAccel = steerEff * 140 * clamp(r.speed / 100, 0.18, 1) * edgeGrip * countersteer;
    // A turn must be steerable at racing speed; boost still requires airbraking in tight bends.
    const cf = -kc * r.speed * r.speed * 0.17;
    r.latVel += (latAccel + cf) * dt;
    r.latVel *= Math.exp(-(steerIn === 0 && ab === 0 ? 4.2 : 3.0) * dt);
    const maxLatSpeed = ab !== 0 ? 78 : 52;
    r.latVel = clamp(r.latVel, -maxLatSpeed, maxLatSpeed);
    r.lat += r.latVel * dt;
    this.wallCollide(r, dt);

    // visuals
    const yawT = clamp((r.latVel / Math.max(r.speed, 80)) * 1.35 + steerEff * 0.11, -0.48, 0.48);
    r.yaw += (yawT - r.yaw) * (1 - Math.exp(-11 * dt));
    const rollT = clamp(steerEff * 0.32 + r.latVel * 0.004, -0.72, 0.72);
    r.roll += (rollT - r.roll) * (1 - Math.exp(-9 * dt));
    const pitchT = (brake ? 0.07 : 0) + (boostActive ? -0.02 : 0) + 0.012 * Math.sin(this.time * 2.1 + r.phase);
    r.pitch += (pitchT - r.pitch) * (1 - Math.exp(-5 * dt));
  }

  private wallCollide(r: Racer, dt: number) {
    r.wallCool -= dt;
    if (Math.abs(r.lat) <= WALL) return;
    const sign = Math.sign(r.lat);
    if (r.isPlayer && r.speed > 30) this.scrapeLevel = clamp(r.speed / 220, 0, 1);
    const into = r.latVel * sign;
    r.lat = sign * WALL;
    const f = this.track.frameAt(r.p, this.fr);
    const origin = this.tV.copy(f.pos).addScaledVector(f.r, sign * (WALL + 2.2)).addScaledVector(f.u, 1.2);
    if (into > 0) {
      r.latVel = -into * 0.4;
      if (into > 6 && r.wallCool <= 0) {
        r.speed *= 1 - Math.min(0.22, 0.04 + into * 0.003);
        r.wallCool = 0.25;
        const vel = this.tV2.copy(f.t).multiplyScalar(r.speed * 0.5).addScaledVector(f.r, -sign * 6);
        this.emitSparks(origin, vel, 22, 10);
        if (r.isPlayer) {
          this.shake = Math.max(this.shake, clamp(into * 0.025, 0.2, 1));
          this.audio.thud(into);
        }
      }
    }
    r.speed *= Math.exp(-0.35 * dt);
    if (r.speed > 40 && Math.random() < 0.7) {
      const vel = this.tV2.copy(f.t).multiplyScalar(r.speed * 0.4).addScaledVector(f.r, -sign * 3);
      this.emitSparks(origin, vel, 2, 6);
    }
  }

  private driveAI(r: Racer, dt: number) {
    const track = this.track;
    const kAhead = track.curvatureAt(r.p + 70);
    let target = BASE_MAX * r.skill * (1 - Math.min(0.12, Math.abs(kAhead) * 30));
    const diff = this.player.p - r.p;
    target *= 1 + clamp(diff / 2500, -0.04, 0.06);
    r.aiBoostCd -= dt;
    if (r.aiBoostCd <= 0 && !r.finished) {
      r.padTimer = 1.8;
      r.aiBoostCd = 12 + Math.random() * 12;
    }
    if (r.padTimer > 0) r.padTimer -= dt;
    const boosting = r.padTimer > 0;
    if (boosting) target += 50;
    if (r.finished) target = BASE_MAX * 0.65;
    r.throttle = 1;
    r.speed += (target - r.speed) * (1 - Math.exp(-1.0 * dt));

    let laneT = r.lane + clamp(kAhead * 2600, -10, 10) * 0.6 + Math.sin(this.time * 0.35 + r.phase) * 3;
    for (const o of this.racers) {
      if (o === r) continue;
      const dp = o.p - r.p;
      if (dp > 0 && dp < 28 && Math.abs(o.lat - r.lat) < 5.5) laneT = r.lat + (o.lat >= r.lat ? -9 : 9);
    }
    laneT = clamp(laneT, -WALL + 2, WALL - 2);
    const dl = laneT - r.lat;
    r.latVel += (clamp(dl * 1.4, -22, 22) - r.latVel) * (1 - Math.exp(-4 * dt));
    r.lat += r.latVel * dt;
    if (Math.abs(r.lat) > WALL) {
      r.lat = Math.sign(r.lat) * WALL;
      r.latVel = 0;
    }
    r.yaw += (clamp((r.latVel / Math.max(r.speed, 70)) * 1.1, -0.5, 0.5) - r.yaw) * (1 - Math.exp(-8 * dt));
    r.roll += (clamp(r.latVel * 0.012 - kAhead * 60, -0.8, 0.8) - r.roll) * (1 - Math.exp(-5 * dt));
    r.pitch += (0.012 * Math.sin(this.time * 2.1 + r.phase) - r.pitch) * (1 - Math.exp(-5 * dt));
  }

  private collide(dt: number) {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i],
          b = rs[j];
        const dp = a.p - b.p;
        if (Math.abs(dp) > 6) continue;
        const dl = a.lat - b.lat;
        if (Math.abs(dl) > 3.8) continue;
        const sgn = dl === 0 ? (i % 2 ? 1 : -1) : Math.sign(dl);
        const push = (3.8 - Math.abs(dl)) * 0.5 * sgn;
        a.lat += push;
        b.lat -= push;
        const rear = dp < 0 ? a : b;
        rear.speed *= Math.exp(-1.6 * dt);
        if (a.isPlayer || b.isPlayer) {
          const pl = a.isPlayer ? a : b;
          pl.latVel += (pl === a ? 1 : -1) * sgn * 8;
          this.shake = Math.max(this.shake, 0.3);
          if (this.time % 0.4 < dt) this.audio.thud(8);
        }
      }
  }

  // -------------------------------------------------------------- placement
  private nozzleWorld(r: Racer, i: number) {
    const g = r.ship.group;
    return this.tV3.copy(r.ship.nozzles[i]).applyQuaternion(g.quaternion).add(g.position).clone();
  }

  private placeRacer(r: Racer) {
    const f = this.track.frameAt(r.p, this.fr);
    const fwd = this.tV.copy(f.t).multiplyScalar(Math.cos(r.yaw)).addScaledVector(f.r, Math.sin(r.yaw));
    fwd.multiplyScalar(Math.cos(r.pitch)).addScaledVector(f.u, Math.sin(r.pitch)).normalize();
    const right = this.tV2.crossVectors(fwd, f.u).normalize();
    const up = this.tV3.crossVectors(right, fwd).normalize();
    const cr = Math.cos(r.roll),
      sr = Math.sin(r.roll);
    const up2 = this.tV4.copy(up).multiplyScalar(cr).addScaledVector(right, sr);
    right.crossVectors(fwd, up2).normalize();
    right.negate(); // left
    this.tM.makeBasis(right, up2, fwd);
    const g = r.ship.group;
    g.quaternion.setFromRotationMatrix(this.tM);
    const hover = 1.7 + 0.14 * Math.sin(this.time * 3 + r.phase) + r.speed * 0.0012;
    r.hover = hover;
    g.position.copy(f.pos).addScaledVector(f.r, r.lat).addScaledVector(f.u, hover);
    r.blob.position.copy(f.pos).addScaledVector(f.r, r.lat).addScaledVector(f.u, 0.06);
    r.blob.quaternion.setFromRotationMatrix(this.tM);
    r.blob.rotateX(-Math.PI / 2);
    const bs = 1 + r.speed * 0.0006;
    r.blob.scale.set(bs, bs, 1);
    r.blob.visible = !(r.isPlayer && this.camMode === 'cockpit');
    if (r.isPlayer) {
      this.pf.pos.copy(f.pos);
      this.pf.t.copy(f.t);
      this.pf.u.copy(f.u);
      this.pf.r.copy(f.r);
    }
  }

  // -------------------------------------------------------------- visuals
  private visuals(dt: number) {
    const time = this.time;
    for (const r of this.racers) {
      const boostOn = r.isPlayer && !r.auto ? r.boosting || r.padTimer > 0 : r.padTimer > 0;
      r.boostVis += ((boostOn ? 1 : 0) - r.boostVis) * (1 - Math.exp(-7 * dt));
      const speedN = clamp(r.speed / BASE_MAX, 0, 1.6);
      const power = clamp(r.throttle * 0.6 + speedN * 0.4, 0, 1);
      r.ship.setFlame(this.phase === 'menu' ? 0.15 : power, r.boostVis, time);
      // trails
      const g = r.ship.group;
      const rightW = this.tV2.set(1, 0, 0).applyQuaternion(g.quaternion);
      const col = this.tC.copy(r.ship.glowColor).lerp(new THREE.Color(1, 0.4, 0.1), r.boostVis);
      r.trails.forEach((t, i) => {
        const p = this.nozzleWorld(r, i);
        t.push(p, rightW, clamp(0.06 + speedN * 0.25 + r.boostVis * 1.0, 0, 1.4), r.boostVis, col);
      });
    }
    // player lights
    const p = this.player;
    const pg = p.ship.group;
    this.pLight.position.copy(pg.position).addScaledVector(this.pf.u, -0.5);
    this.pLight.color.copy(p.ship.glowColor).lerp(this.tC.setRGB(1, 0.45, 0.15), p.boostVis);
    this.pLight.intensity = 260 + p.boostVis * 280 + this.boomPulse * 160;
    this.sun.target.position.copy(pg.position);
    this.sun.position.copy(pg.position).addScaledVector(this.sunDir, 200);
    this.rim.position.copy(pg.position).addScaledVector(this.sunDir, -140).add(new THREE.Vector3(0, 80, 0));
    this.rim.target.position.copy(pg.position);
    this.rim.target.updateMatrixWorld();
    this.updateDust(dt);

    // sparks
    for (let i = 0; i < 300; i++) {
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= dt;
        this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
        this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
        this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
        this.sparkVel[i * 3 + 1] -= 25 * dt;
        if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -1e5;
      }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;

    // speed lines
    const N = Game.LN;
    const sp = p.speed;
    const len = 1.5 + sp * 0.025 + p.boostVis * 3;
    for (let i = 0; i < N; i++) {
      this.lineBase[i * 3 + 2] += sp * dt * 1.0;
      if (this.lineBase[i * 3 + 2] > -1) this.respawnLine(i);
      const x = this.lineBase[i * 3],
        y = this.lineBase[i * 3 + 1],
        z = this.lineBase[i * 3 + 2];
      this.linePos.set([x, y, z, x, y, z - len], i * 6);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    (this.lines.material as THREE.LineBasicMaterial).opacity =
      this.phase === 'menu' ? 0 : (clamp((sp - 120) / 220, 0, 1) * 0.24 + p.boostVis * 0.1) * (1 - this.rainLevel * 0.38) + this.boomPulse * 0.15;

    // slow cloud drift
    for (const c of this.clouds) c.position.x += dt * 4;
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const pg = p.ship.group;
    const cam = this.camera;
    const pf = this.pf;
    const speedN = clamp(p.speed / BASE_MAX, 0, 1.5);

    const cockpitOn = this.camMode === 'cockpit' && this.phase !== 'menu' && this.phase !== 'loading';
    pg.visible = !cockpitOn;
    if (cockpitOn) {
      this.cockpitCamera(dt);
      return;
    }

    if (this.phase !== 'menu' && this.phase !== 'loading') {
      // Riding the track behind the craft keeps the camera above the road through tight vertical loops.
      const dist = 12 + speedN * 1.8 + p.boostVis * 1.4;
      const back = this.track.frameAt(p.p - dist, this.chaseFrame);
      const ahead = this.track.frameAt(p.p + 15, this.lookFrame);
      // Let the craft move across the screen; a camera locked to its lane hides steering feedback.
      this.chaseLat += (p.lat * 0.65 - this.chaseLat) * (1 - Math.exp(-5 * dt));
      const cameraLat = clamp(this.chaseLat - p.latVel * 0.02, -WALL + 3, WALL - 3);
      const chasePos = this.tV.copy(back.pos).addScaledVector(back.r, cameraLat).addScaledVector(back.u, 4.9);
      if (this.phase === 'countdown') cam.position.lerp(chasePos, 1 - Math.exp(-6 * dt));
      else cam.position.copy(chasePos);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const sh = this.shake * 0.22 + p.boostVis * 0.012;
      cam.position.add(this.tV2.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
      cam.up.copy(back.u).addScaledVector(back.r, -p.steer * 0.045).normalize();
      cam.lookAt(this.tV3.copy(ahead.pos).addScaledVector(ahead.r, p.lat * 0.25).addScaledVector(ahead.u, 2.3));
      if (cam.view && cam.view.enabled) cam.clearViewOffset();
      cam.near = 0.4;
      const fovT = 66 + speedN * 9 + p.boostVis * 8 + this.boomPulse * 3.5;
      cam.fov += (fovT - cam.fov) * (1 - Math.exp(-5 * dt));
      cam.updateProjectionMatrix();
      return;
    }

    const kv = this.track.kvAt(p.p);
    const omega = Math.abs(kv) * p.speed;
    const upRate = Math.min(30, 5 + omega * 4);
    let desiredOff: THREE.Vector3;
    let desiredLook: THREE.Vector3;
    let rate: number;
    if (this.phase === 'menu' || this.phase === 'loading') {
      const a = this.time * 0.35 + 0.7;
      desiredOff = new THREE.Vector3()
        .addScaledVector(pf.t, Math.cos(a) * 11)
        .addScaledVector(pf.r, Math.sin(a) * 11)
        .addScaledVector(pf.u, 3.0);
      desiredLook = new THREE.Vector3().addScaledVector(pf.u, 0.4);
      rate = 5;
    } else {
      const fwdC = new THREE.Vector3()
        .addScaledVector(pf.t, Math.cos(p.yaw * 0.4))
        .addScaledVector(pf.r, Math.sin(p.yaw * 0.4))
        .normalize();
      const dist = 11.5 + speedN * 2.2 + p.boostVis * 3.5;
      const height = 3.6 - speedN * 0.3;
      desiredOff = new THREE.Vector3()
        .addScaledVector(fwdC, -dist)
        .addScaledVector(pf.u, height)
        .addScaledVector(pf.r, -p.latVel * 0.025);
      const lookUp = 1.4 + clamp(kv, -0.03, 0.03) * 28 * 28 * 0.5 * 0.85;
      desiredLook = new THREE.Vector3().addScaledVector(fwdC, 28).addScaledVector(pf.u, lookUp);
      rate = this.phase === 'countdown' ? 2.2 : Math.min(40, 9 + omega * 6);
    }
    const k = 1 - Math.exp(-rate * dt);
    this.camOff.lerp(desiredOff, k);
    this.lookOff.lerp(desiredLook, 1 - Math.exp(-(rate + 2) * dt));
    this.camUp.lerp(pf.u, 1 - Math.exp(-upRate * dt)).normalize();

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * 0.35 + (p.boostVis * 0.03 + speedN * 0.012);
    cam.position
      .copy(pg.position)
      .add(this.camOff)
      .add(this.tV.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.up.copy(this.camUp);
    cam.lookAt(this.tV2.copy(pg.position).add(this.lookOff));

    if (this.phase === 'menu') {
      const w = this.container.clientWidth,
        h = this.container.clientHeight;
      cam.setViewOffset(w, h, -w * 0.17, 0, w, h);
    } else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    const fovT = 66 + speedN * 9 + p.boostVis * 8;
    cam.fov += (fovT - cam.fov) * (1 - Math.exp(-5 * dt));
    cam.updateProjectionMatrix();
  }

  private cockpitCamera(dt: number) {
    const p = this.player;
    const g = p.ship.group;
    const cam = this.camera;
    if (cam.view && cam.view.enabled) cam.clearViewOffset();
    this.tQ.copy(g.quaternion).multiply(this.flipY);
    const speedN = clamp(p.speed / BASE_MAX, 0, 1.5);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * 0.22 + p.boostVis * 0.018 + speedN * 0.005;
    cam.position
      .set(0, 0.82, 1.1)
      .applyQuaternion(g.quaternion)
      .add(g.position)
      .add(this.tV.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    // A lagging orientation can aim the cockpit camera into the road in a fast vertical loop.
    cam.quaternion.copy(this.tQ);
    cam.near = 0.25;
    const fovT = 90 + speedN * 6 + p.boostVis * 5 + this.boomPulse * 3;
    cam.fov += (fovT - cam.fov) * (1 - Math.exp(-5 * dt));
    cam.updateProjectionMatrix();

    // cockpit shell inertia
    const dx = clamp(-p.latVel * 0.0011, -0.035, 0.035);
    const dy =
      Math.sin(this.time * 37) * 0.0015 * speedN +
      (Math.random() - 0.5) * 0.004 * p.boostVis +
      (this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.02 : 0);
    this.cockpit.setMotion(dx, dy, dt);
    const sunView = this.tV2.copy(this.sunDir).applyQuaternion(this.tQ.copy(cam.quaternion).invert());
    this.cockpit.setLighting(sunView, cam.quaternion);
  }

  private updateFx(dt: number) {
    const p = this.player;
    const speedN = clamp(p.speed / BASE_MAX, 0, 1.6);
    const live = this.phase !== 'menu';
    const cockpitOn = this.camMode === 'cockpit';
    this.fx.uniforms.uAmount.value = live && !cockpitOn
      ? p.boostVis * 0.018 + Math.max(0, speedN - 0.8) * 0.004
      : 0;
    const cockActive = cockpitOn && this.phase !== 'menu' && this.phase !== 'loading';
    this.fx.uniforms.uDistort.value = cockActive ? FISHEYE : 0;
    this.bloom.strength = 0.16 + p.boostVis * (cockpitOn ? 0.015 : 0.035);
    this.audio.update(
      clamp(p.speed / (BASE_MAX + BOOST_ADD), 0, 1),
      p.throttle,
      p.boostVis,
      this.phase === 'racing' || this.phase === 'finished' || this.phase === 'countdown'
    );
    this.audio.setScrape(this.scrapeLevel);
    this.audio.setRain(this.rainLevel);

    // nearest rival: stereo + doppler
    let best: Racer | null = null;
    let bd = Infinity;
    const pp = p.ship.group.position;
    for (const r of this.racers) {
      if (r === p) continue;
      const d = r.ship.group.position.distanceTo(pp);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best && this.phase !== 'menu') {
      const id = best.slot;
      const closing = id === this.nearId && dt > 0 ? (this.nearDist - bd) / dt : 0;
      this.nearId = id;
      this.nearDist = bd;
      const rel = this.tV.copy(best.ship.group.position).sub(this.camera.position).normalize();
      const right = this.tV2.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.audio.updateOther(bd, rel.dot(right) * 1.2, closing, clamp(best.speed / BASE_MAX, 0, 1.4));
    } else this.audio.updateOther(999, 0, 0, 0);
  }

  // -------------------------------------------------------------- hud
  private rank(): Racer[] {
    return this.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.p - a.p;
    });
  }

  private emitHud() {
    const p = this.player;
    if (!p) return;
    const order = this.rank();
    let results: ResultRow[] | null = null;
    if (this.phase === 'finished') {
      results = order.map((r) => ({
        name: r.name,
        team: r.team.name,
        time: r.finished ? r.finishTime : null,
        best: isFinite(r.bestLap) ? r.bestLap : null,
        isPlayer: r.isPlayer,
        color: r.team.primary,
      }));
    }
    if (this.message && this.time > this.message.until) this.message = null;
    const cd = this.phase === 'countdown' ? (this.countdownT < 3 ? 3 - Math.floor(this.countdownT) : 0) : -1;
    this.onHud({
      phase: this.phase,
      speed: Math.round(p.speed * KMH),
      energy: p.energy,
      boosting: p.boosting || p.padTimer > 0,
      lap: clamp(p.lapIdx + 1, 1, LAPS),
      laps: LAPS,
      pos: order.indexOf(p) + 1,
      total: this.racers.length,
      time: this.raceTime,
      lapTime: p.finished ? p.lastLap : Math.max(0, this.raceTime - p.lapStart),
      best: isFinite(p.bestLap) ? p.bestLap : null,
      last: isFinite(p.lastLap) ? p.lastLap : null,
      countdown: cd,
      message: this.message ? this.message.text : null,
      messageId: this.message ? this.message.id : 0,
      results,
      teamIdx: this.teamIdx,
      paused: this.paused,
      muted: this.audio.muted,
      music: this.audio.musicOn,
      camMode: this.camMode,
      raining: this.raining,
      boomId: this.boomId,
      boomActive: this.time < this.boomUntil,
      trackIdx: this.trackIdx,
      trackName: TRACKS[this.trackIdx].name,
    });
    if (this.camMode === 'cockpit' && this.cockpit && this.time - this.lastCockpitHud >= 0.09) {
      this.lastCockpitHud = this.time;
      this.cockpit.setScreens({
        speed: Math.round(p.speed * KMH),
        energy: p.energy,
        boosting: p.boosting || p.padTimer > 0,
        lap: clamp(p.lapIdx + 1, 1, LAPS),
        laps: LAPS,
        pos: order.indexOf(p) + 1,
        total: this.racers.length,
        best: isFinite(p.bestLap) ? p.bestLap : null,
        last: isFinite(p.lastLap) ? p.lastLap : null,
        lapTime: p.finished ? p.lastLap : Math.max(0, this.raceTime - p.lapStart),
      });
    }
    this.drawMinimap();
  }

  private drawMinimap() {
    const c = this.minimapCanvas;
    if (!c || !this.minimapBase) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.minimapBase, 0, 0, c.width, c.height);
    const sc = c.width / 256;
    const L = this.track.L;
    for (const r of this.racers) {
      const f = this.track.wrap(r.p) / L;
      const i = Math.floor(f * this.track.N) % this.track.N;
      const m = this.track.minimap[i];
      g.beginPath();
      g.fillStyle = r.isPlayer ? '#ffe14a' : '#' + r.team.glow.toString(16).padStart(6, '0');
      g.arc((128 + m.x * 210) * sc, (128 + m.y * 210) * sc, (r.isPlayer ? 9 : 6) * sc, 0, Math.PI * 2);
      g.fill();
      if (r.isPlayer) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2 * sc;
        g.stroke();
      }
    }
  }
}
