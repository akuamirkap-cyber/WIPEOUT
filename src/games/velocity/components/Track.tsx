import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  samples,
  SAMPLE_COUNT,
  SEG_LEN,
  TRACK_HALF_WIDTH as HW,
  WALL_HEIGHT as WH,
  PADS,
  START_GRID,
  getTrackInfo,
  TRACK_LENGTH,
  TUNNELS,
  DOME,
  domeValue,
  inTunnel,
  GROUND_Y,
  type TrackSample,
} from "../game/track";
import { Cave } from "./Cave";
import {
  roadTexture,
  wallTexture,
  panelTexture,
  padTexture,
  startStripesTexture,
  finishLineTexture,
  speedPadTexture,
  textTexture,
  facadeTexture,
  crowdTexture,
  ledTexture,
} from "../game/textures";
import { game } from "../game/store";


type UVMode = "across" | "along";
type Prof = (s: TrackSample) => [number, number];
const wallH = (s: TrackSample) => WH * (1 - 0.25 * s.cave);
function buildStrip(a: Prof, b: Prof, mode: UVMode, tile: number, hScale = 1, range?: [number, number]) {
  const N = SAMPLE_COUNT;
  const i0 = range ? range[0] : 0;
  const i1 = range ? range[1] : N;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  let count = 0;
  for (let i = i0; i <= i1; i++) {
    const s = samples[((i % N) + N) % N];
    const dist = i === N && !range ? TRACK_LENGTH : s.dist;
    const pa = a(s);
    const pb = b(s);
    for (const [x, y] of [pa, pb]) {
      v.copy(s.p).addScaledVector(s.r, x).addScaledVector(s.u, y);
      pos.push(v.x, v.y, v.z);
    }
    if (mode === "across") {
      uv.push(0, dist / tile, 1, dist / tile);
    } else {
      const lo = Math.min(pa[1], pb[1]);
      uv.push(dist / tile, (pa[1] - lo) / hScale, dist / tile, (pb[1] - lo) / hScale);
    }
    count++;
  }
  for (let i = 0; i < count - 1; i++) {
    const o = i * 2;
    idx.push(o, o + 1, o + 3, o, o + 3, o + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function frameQuat(i: number, out = new THREE.Quaternion()) {
  const s = samples[i];
  const m = new THREE.Matrix4().makeBasis(s.r, s.u, s.t.clone().negate());
  return out.setFromRotationMatrix(m);
}

function TrackBody() {
  const geos = useMemo(() => {
    const W = 1.4;
    const caveRange: [number, number] = [TUNNELS[0].cross + 10, TUNNELS[1].cross - 10];
    return {
      road: buildStrip((s) => [-s.w, 0], (s) => [s.w, 0], "across", 2 * HW),
      wallsInner: mergeGeometries([
        buildStrip((s) => [-s.w, wallH(s)], (s) => [-s.w, 0], "along", 22, WH),
        buildStrip((s) => [s.w, 0], (s) => [s.w, wallH(s)], "along", 22, WH),
      ])!,
      wallTops: mergeGeometries([
        buildStrip((s) => [-s.w - W, wallH(s) + 0.1], (s) => [-s.w, wallH(s)], "along", 6, 1),
        buildStrip((s) => [s.w, wallH(s)], (s) => [s.w + W, wallH(s) + 0.1], "along", 6, 1),
      ])!,
      neon: mergeGeometries([
        buildStrip((s) => [-s.w - 0.75, wallH(s) + 0.14], (s) => [-s.w - 0.45, wallH(s) + 0.14], "along", 6, 1),
        buildStrip((s) => [s.w + 0.45, wallH(s) + 0.14], (s) => [s.w + 0.75, wallH(s) + 0.14], "along", 6, 1),
      ])!,
      outer: mergeGeometries([
        buildStrip((s) => [-s.w - W, -4.5], (s) => [-s.w - W, wallH(s) + 0.1], "along", 8, 6.6),
        buildStrip((s) => [s.w + W, wallH(s) + 0.1], (s) => [s.w + W, -4.5], "along", 8, 6.6),
      ])!,
      bottom: buildStrip((s) => [s.w + W, -4.5], (s) => [-s.w - W, -4.5], "across", 30),
      caveUnder: mergeGeometries([
        buildStrip((s) => [-s.w - W - 0.2, -4.2], (s) => [-s.w - W - 0.2, -3.2], "along", 6, 1, caveRange),
        buildStrip((s) => [s.w + W + 0.2, -3.2], (s) => [s.w + W + 0.2, -4.2], "along", 6, 1, caveRange),
        buildStrip((s) => [-s.w * 0.5, -4.7], (s) => [-s.w * 0.5 + 0.8, -4.7], "along", 6, 1, caveRange),
        buildStrip((s) => [s.w * 0.5 - 0.8, -4.7], (s) => [s.w * 0.5, -4.7], "along", 6, 1, caveRange),
      ])!,
    };
  }, []);

  const mats = useMemo(
    () => ({
      road: new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.88, metalness: 0.05 }),
      wall: new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.85, metalness: 0.05 }),
      top: new THREE.MeshStandardMaterial({ color: "#2a2d35", roughness: 0.5, metalness: 0.7 }),
      outer: new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.6, metalness: 0.5 }),
      bottom: new THREE.MeshStandardMaterial({ color: "#1d1f26", roughness: 0.7, metalness: 0.5 }),
      neon: new THREE.MeshBasicMaterial({ color: new THREE.Color("#46d2ff").multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide }),
      caveUnder: new THREE.MeshBasicMaterial({ color: new THREE.Color("#5ad7ff").multiplyScalar(3), toneMapped: false, side: THREE.DoubleSide }),
    }),
    []
  );

  return (
    <group>
      <mesh geometry={geos.road} material={mats.road} receiveShadow />
      <mesh geometry={geos.wallsInner} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={geos.wallTops} material={mats.top} castShadow receiveShadow />
      <mesh geometry={geos.outer} material={mats.outer} castShadow receiveShadow />
      <mesh geometry={geos.bottom} material={mats.bottom} />
      <mesh geometry={geos.neon} material={mats.neon} />
      <mesh geometry={geos.caveUnder} material={mats.caveUnder} />
    </group>
  );
}

function Pillars() {
  const items = useMemo(() => {
    const out: { pos: THREE.Vector3; h: number }[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 45) {
      const s = samples[i];
      if (s.cave > 0.01 || inTunnel(i, 12) || s.p.y < -22) continue;
      const h = s.p.y - 4.5 - GROUND_Y;
      out.push({ pos: new THREE.Vector3(s.p.x, GROUND_Y + h / 2, s.p.z), h });
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a3e4a", roughness: 0.6, metalness: 0.6 }), []);
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.pos}>
          <mesh material={mat} castShadow>
            <boxGeometry args={[3.5, it.h, 3.5]} />
          </mesh>
          <mesh material={mat} position={[0, it.h / 2 - 1.5, 0]}>
            <boxGeometry args={[2 * HW + 2, 3, 4.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SpeedPads() {
  const refs = useRef<THREE.MeshStandardMaterial[]>([]);
  const items = useMemo(
    () =>
      PADS.map((p) => {
        const s = samples[p.index];
        const pos = s.p.clone().addScaledVector(s.r, p.lateral).addScaledVector(s.u, 0.06);
        return { pos, q: frameQuat(p.index), type: p.type };
      }),
    []
  );
  const texBlue = useMemo(() => speedPadTexture("#39c7ff"), []);
  const texYellow = useMemo(() => speedPadTexture("#ffd23a"), []);
  useFrame((_, dt) => {
    texBlue.offset.y -= dt * 1.6;
    texYellow.offset.y -= dt * 1.0;
  });
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.pos} quaternion={it.q}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[6, 11]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) refs.current[i] = m;
              }}
              map={it.type === "speed" ? texBlue : texYellow}
              emissive={it.type === "speed" ? "#1a9fff" : "#ffb300"}
              emissiveMap={it.type === "speed" ? texBlue : texYellow}
              emissiveIntensity={1.6}
              roughness={0.4}
              toneMapped={false}
            />
          </mesh>
          {/* frame */}
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0, 1, 4]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StartPad({ x, z }: { x: number; z: number }) {
  const info = getTrackInfo(new THREE.Vector3(x, 0, z), SAMPLE_COUNT - 30);
  const y = info.height;
  const padMat = useMemo(() => new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.55, metalness: 0.35 }), []);
  const white = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#e8e9ec", roughness: 0.35, metalness: 0.6, clearcoat: 0.6 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b2f3b", roughness: 0.6, metalness: 0.6 }), []);
  const blue = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#3aa0ff").multiplyScalar(3), toneMapped: false }), []);
  return (
    <group position={[x, y, z]}>
      {/* base slab */}
      <RoundedBox args={[6.2, 0.55, 12.5]} radius={0.12} smoothness={3} position={[0, 0.27, 0]} material={dark} castShadow receiveShadow />
      {/* top deck */}
      <mesh position={[0, 0.56, 0]} rotation={[-Math.PI / 2, 0, 0]} material={padMat} receiveShadow>
        <planeGeometry args={[5.6, 12]} />
      </mesh>
      {/* side rails */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox args={[0.55, 0.5, 12.2]} radius={0.08} smoothness={2} position={[s * 3.0, 0.78, 0]} material={white} castShadow receiveShadow />
          <mesh position={[s * 3.0, 1.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blue}>
            <planeGeometry args={[0.1, 11.5]} />
          </mesh>
        </group>
      ))}
      {/* front lip */}
      <mesh position={[0, 0.65, -6.2]} material={white} castShadow>
        <boxGeometry args={[6.4, 0.25, 0.4]} />
      </mesh>
      <mesh position={[0, 0.8, -6.2]} material={blue}>
        <boxGeometry args={[5.4, 0.06, 0.1]} />
      </mesh>
      {/* glow underneath */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 13]} />
        <meshBasicMaterial color={new THREE.Color("#2b7dff").multiplyScalar(1.2)} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function StartZone() {
  const stripes = useMemo(() => {
    const t = startStripesTexture();
    t.repeat.set(1, 4.2);
    return t;
  }, []);
  const finish = useMemo(() => finishLineTexture(), []);
  const y0 = getTrackInfo(new THREE.Vector3(0, 0, 60), SAMPLE_COUNT - 30).height;
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2a2d39", roughness: 0.5, metalness: 0.7 }), []);
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3b5bd9", roughness: 0.4, metalness: 0.5, emissive: "#1a2a7a", emissiveIntensity: 0.4 }), []);
  const yellowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e2b21a", roughness: 0.5 }), []);
  return (
    <group>
      {/* floor yellow stripes */}
      <mesh position={[0, y0 + 0.03, 62]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2 * HW - 2, 112]} />
        <meshStandardMaterial map={stripes} transparent roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {/* finish line */}
      <mesh position={[0, y0 + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * HW, 2.6]} />
        <meshStandardMaterial map={finish} roughness={0.7} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {START_GRID.map((g, i) => (
        <StartPad key={i} x={g.x} z={g.z} />
      ))}
      {/* side decoration panels along start straight (left & right walls) */}
      {[-1, 1].map((side) =>
        Array.from({ length: 10 }).map((_, i) => (
          <group key={`${side}-${i}`} position={[side * (HW - 0.4), y0, 8 + i * 12]}>
            <mesh material={blueMat} position={[0, WH * 0.55, 0]} castShadow>
              <boxGeometry args={[0.5, 1.3, 7]} />
            </mesh>
            <mesh material={yellowMat} position={[0, WH * 0.55, 0]}>
              <boxGeometry args={[0.55, 0.25, 7.2]} />
            </mesh>
            <mesh material={wallMat} position={[side * 0.6, WH + 0.9, 0]} castShadow>
              <boxGeometry args={[1.2, 1.4, 2.5]} />
            </mesh>
            <mesh position={[side * 0.6, WH + 1.7, 0]}>
              <boxGeometry args={[0.8, 0.12, 2.2]} />
              <meshBasicMaterial color={new THREE.Color("#5ab4ff").multiplyScalar(3)} toneMapped={false} />
            </mesh>
          </group>
        ))
      )}
      <Gantry y={y0} />
    </group>
  );
}

function Gantry({ y }: { y: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const texs = useMemo(
    () => ({
      3: ledTexture("3", "#ff2a2a"),
      2: ledTexture("2", "#ff2a2a"),
      1: ledTexture("1", "#ff2a2a"),
      go: ledTexture("GO", "#36ff6a"),
      blank: ledTexture("LAP", "#52a8ff"),
    }),
    []
  );
  useFrame(() => {
    if (!mat.current) return;
    let t = texs.blank;
    if (game.phase === "countdown") {
      const c = Math.ceil(game.countdown);
      t = (texs as Record<number, THREE.Texture>)[c] ?? texs.blank;
    } else if (game.phase === "racing" && game.time < 1.5) t = texs.go;
    if (mat.current.map !== t) {
      mat.current.map = t;
      mat.current.needsUpdate = true;
    }
  });
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c9ccd3", roughness: 0.35, metalness: 0.9 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#23252c", roughness: 0.5, metalness: 0.7 }), []);
  const hazard = useMemo(() => {
    const t = textTexture("▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼", "#e2b21a", "#15161a", 1024, 128);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }, []);
  return (
    <group position={[0, y, -3]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (HW + 2.2), 0, 0]}>
          <mesh material={steel} position={[0, 6, 0]} castShadow>
            <boxGeometry args={[1.4, 12, 1.4]} />
          </mesh>
          <mesh material={dark} position={[0, 0.5, 0]}>
            <boxGeometry args={[2.4, 1, 2.4]} />
          </mesh>
        </group>
      ))}
      {/* beam */}
      <mesh material={steel} position={[0, 12.3, 0]} castShadow>
        <boxGeometry args={[2 * HW + 6, 1.2, 1.6]} />
      </mesh>
      <mesh material={hazard} position={[0, 11.4, 0.0]}>
        <boxGeometry args={[2 * HW + 5, 0.6, 1.7]} />
      </mesh>
      {/* LED board */}
      <group position={[0, 8.6, 0]}>
        <mesh material={dark} castShadow>
          <boxGeometry args={[9.5, 3.8, 0.8]} />
        </mesh>
        <mesh position={[0, 0, 0.42]}>
          <planeGeometry args={[8.8, 3.2]} />
          <meshBasicMaterial ref={mat} map={texs.blank} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.42]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[8.8, 3.2]} />
          <meshBasicMaterial map={texs.blank} toneMapped={false} />
        </mesh>
        <mesh material={steel} position={[0, 2.8, 0]}>
          <boxGeometry args={[0.4, 2, 0.4]} />
        </mesh>
      </group>
      {/* flood lights under beam */}
      {[-8, -3, 3, 8].map((x) => (
        <mesh key={x} position={[x, 11.6, 0.9]}>
          <boxGeometry args={[1.2, 0.3, 0.2]} />
          <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(4)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Buildings() {
  const facade = useMemo(() => {
    const t = facadeTexture();
    t.repeat.set(8, 3);
    return t;
  }, []);
  const crowd = useMemo(() => {
    const t = crowdTexture();
    t.repeat.set(6, 1);
    return t;
  }, []);
  const sign1 = useMemo(() => textTexture("SEBENCO", "#132a6b", "#6fb4ff"), []);
  const sign2 = useMemo(() => textTexture("FEISAR", "#f3f4f6", "#1d4fc8"), []);
  const sign3 = useMemo(() => textTexture("SYNCHRO", "#ffffff", "#e23b3b"), []);
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9bcc4", roughness: 0.8 }), []);
  const steelDark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3c414d", roughness: 0.5, metalness: 0.6 }), []);
  const top = 0;
  const h = top - GROUND_Y;
  return (
    <group>
      {/* LEFT: pit building */}
      <group position={[-(HW + 24), GROUND_Y + h / 2 + 6, 60]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[24, h + 12, 200]} />
          <meshStandardMaterial map={facade} roughness={0.6} metalness={0.2} />
        </mesh>
        {/* big sign on side facing track */}
        <mesh position={[12.2, h / 2 - 2, 40]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[110, 22]} />
          <meshStandardMaterial map={sign1} emissive="#2a66ff" emissiveMap={sign1} emissiveIntensity={0.6} roughness={0.5} />
        </mesh>
        {/* roof details */}
        <mesh position={[0, h / 2 + 9, -20]} material={steelDark} castShadow>
          <boxGeometry args={[10, 6, 30]} />
        </mesh>
        <mesh position={[0, h / 2 + 7, 60]} material={steelDark}>
          <cylinderGeometry args={[6, 8, 2, 24]} />
        </mesh>
      </group>
      {/* LEFT: tower */}
      <group position={[-120, GROUND_Y + 50, -300]}>
        <mesh castShadow>
          <cylinderGeometry args={[14, 18, 100, 12]} />
          <meshStandardMaterial map={facade} roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, 56, 0]} material={steelDark}>
          <cylinderGeometry args={[18, 12, 12, 12]} />
        </mesh>
        <mesh position={[0, 46, 15]} rotation={[0, 0, 0]}>
          <planeGeometry args={[26, 8]} />
          <meshStandardMaterial map={sign2} emissive="#ffffff" emissiveMap={sign2} emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* RIGHT: grandstand */}
      <group position={[HW + 16, 0, 60]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} position={[i * 6, -2 + i * 4, 0]}>
            <mesh material={concrete} castShadow receiveShadow position={[0, 0, 0]}>
              <boxGeometry args={[6, 4 + i * 0, 150]} />
            </mesh>
            <mesh position={[-3.01, 0.8, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[150, 2.4]} />
              <meshStandardMaterial map={crowd} roughness={1} />
            </mesh>
          </group>
        ))}
        {/* roof */}
        <mesh position={[10, 22, 0]} rotation={[0, 0, 0.12]} material={steelDark} castShadow>
          <boxGeometry args={[34, 0.8, 160]} />
        </mesh>
        {[-60, -20, 20, 60].map((z) => (
          <mesh key={z} position={[22, 10, z]} material={steelDark}>
            <boxGeometry args={[1.2, 26, 1.2]} />
          </mesh>
        ))}
        {/* sponsor boards on front */}
        {[-50, 0, 50].map((z, i) => (
          <mesh key={z} position={[-3.2, 1.8, z]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[28, 5]} />
            <meshStandardMaterial map={i === 1 ? sign3 : sign2} emissive="#ffffff" emissiveMap={i === 1 ? sign3 : sign2} emissiveIntensity={0.3} />
          </mesh>
        ))}
        {/* base down to ground */}
        <mesh material={steelDark} position={[9, GROUND_Y / 2 - 2, 0]}>
          <boxGeometry args={[24, -GROUND_Y - 4, 150]} />
        </mesh>
      </group>
    </group>
  );
}

function Mountains() {
  const items = useMemo(() => {
    const out: { pos: [number, number, number]; r: number; h: number; rot: number }[] = [];
    // outer ring
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rad = 760 + Math.random() * 220;
      const r = 150 + Math.random() * 120;
      const mx = Math.cos(a) * rad - 180;
      const mz = Math.sin(a) * rad - 60;
      if (Math.hypot(mx - DOME.c.x, mz - DOME.c.z) < DOME.r.x + r + 30) continue;
      out.push({ pos: [mx, GROUND_Y, mz], r, h: 160 + Math.random() * 180, rot: Math.random() * Math.PI });
    }
    // flanking hills near track
    for (let i = 0; i < SAMPLE_COUNT; i += 70) {
      const s = samples[i];
      if (s.cave > 0.01 || inTunnel(i, 70) || s.p.y < -22) continue;
      const side = i % 140 === 0 ? 1 : -1;
      const off = 75 + Math.random() * 60;
      const p = s.p.clone().addScaledVector(s.r, side * off);
      const r = 35 + Math.random() * 30;
      if (domeValue(new THREE.Vector3(p.x, GROUND_Y, p.z)) < 1.6) continue;
      if (TUNNELS.some((t) => t.crossPos.distanceTo(new THREE.Vector3(p.x, t.crossPos.y, p.z)) < r + 120)) continue;
      out.push({ pos: [p.x, GROUND_Y, p.z], r, h: 25 + Math.random() * 30, rot: Math.random() * Math.PI });
    }
    return out;
  }, []);
  const snow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6dde8", roughness: 1, flatShading: true }), []);
  // ground plane with holes: the hollow-earth dome and the tunnel pits
  const ground = useMemo(() => {
    const shape = new THREE.Shape();
    const S = 2200;
    shape.moveTo(-S - 180, -S + 60);
    shape.lineTo(S - 180, -S + 60);
    shape.lineTo(S - 180, S + 60);
    shape.lineTo(-S - 180, S + 60);
    shape.closePath();
    // one star-shaped hole = dome disk  U  tunnel pits (overlapping holes would break triangulation)
    const pits: { x: number; z: number; r: number }[] = [];
    for (const t of TUNNELS) {
      const outsideIdx = t.entering ? t.start : t.end;
      const a = samples[((outsideIdx % SAMPLE_COUNT) + SAMPLE_COUNT) % SAMPLE_COUNT].p;
      const b = t.crossPos;
      pits.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: a.distanceTo(b) / 2 + 50 });
    }
    const hole = new THREE.Path();
    const STEPS = 360;
    for (let k = 0; k < STEPS; k++) {
      const th = (k / STEPS) * Math.PI * 2;
      const dx = Math.cos(th);
      const dz = Math.sin(th);
      let r = 332;
      for (const p of pits) {
        const px = p.x - DOME.c.x;
        const pz = p.z - DOME.c.z;
        const tc = px * dx + pz * dz;
        const perp2 = px * px + pz * pz - tc * tc;
        const disc = p.r * p.r - perp2;
        if (disc >= 0) r = Math.max(r, tc + Math.sqrt(disc));
      }
      const wx = DOME.c.x + dx * r;
      const wz = DOME.c.z + dz * r;
      if (k === 0) hole.moveTo(wx, -wz);
      else hole.lineTo(wx, -wz);
    }
    hole.closePath();
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <group>
      {items.map((m, i) => (
        <mesh key={i} position={m.pos} rotation={[0, m.rot, 0]} material={snow} castShadow receiveShadow>
          <coneGeometry args={[m.r, m.h, 7, 1]} />
        </mesh>
      ))}
      <mesh geometry={ground} position={[0, GROUND_Y, 0]} receiveShadow>
        <meshStandardMaterial color="#dfe6f0" roughness={1} />
      </mesh>
    </group>
  );
}

function LightPoles() {
  const items = useMemo(() => {
    const out: { pos: THREE.Vector3; q: THREE.Quaternion }[] = [];
    for (let i = 20; i < SAMPLE_COUNT; i += 100) {
      const s = samples[i];
      if (s.cave > 0.01 || inTunnel(i, 15) || s.p.y < -22) continue;
      const side = i % 200 === 20 ? 1 : -1;
      out.push({ pos: s.p.clone().addScaledVector(s.r, side * (HW + 3)).addScaledVector(s.u, -4.5), q: frameQuat(i) });
    }
    return out;
  }, []);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8e939c", roughness: 0.4, metalness: 0.9 }), []);
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.pos} quaternion={it.q}>
          <mesh material={steel} position={[0, 12, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.5, 24, 10]} />
          </mesh>
          <mesh position={[0, 24, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[3, 0.25, 10, 32]} />
            <meshBasicMaterial color={new THREE.Color("#ffd36a").multiplyScalar(2.5)} toneMapped={false} />
          </mesh>
          <mesh position={[0, 24, 0]} material={steel}>
            <boxGeometry args={[6.5, 0.3, 0.3]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Track() {
  return (
    <group>
      <TrackBody />
      <Pillars />
      <SpeedPads />
      <StartZone />
      <Buildings />
      <Mountains />
      <LightPoles />
      <Cave />
    </group>
  );
}

export { SEG_LEN };
