import { forwardRef, useImperativeHandle, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { glowTexture } from "../game/textures";

export interface ExhaustHandle {
  update: (dt: number, thrust: number, boost: number) => void;
}

/* ---------------- shared geometries ---------------- */
let _geo: { cone: THREE.ConeGeometry; ring: THREE.TorusGeometry; diamond: THREE.ConeGeometry } | null = null;
function geo() {
  if (_geo) return _geo;
  const cone = new THREE.ConeGeometry(1, 1, 24, 6, true);
  cone.translate(0, -0.5, 0); // apex at origin? no: base at y=0, apex at y=-1
  cone.rotateX(Math.PI / 2); // extend along +z (backwards)
  const ring = new THREE.TorusGeometry(1, 0.08, 6, 24);
  const diamond = new THREE.ConeGeometry(1, 1, 12, 1, true);
  diamond.rotateX(Math.PI / 2);
  _geo = { cone, ring, diamond };
  return _geo;
}

/* ---------------- flame material with procedural gradient ---------------- */
function flameMaterial(color: string, core: boolean) {
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: core ? new THREE.Color("#ffffff") : c },
      uColor2: { value: core ? c.clone().lerp(new THREE.Color("#ffffff"), 0.4) : c.clone().multiplyScalar(0.4) },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uColor2; uniform float uTime; uniform float uIntensity;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float along = vUv.y; // 0 at nozzle (base), 1 at tip
        float n = noise(vec2(vUv.x*6.0, along*4.0 - uTime*9.0));
        float n2 = noise(vec2(vUv.x*14.0+3.0, along*9.0 - uTime*16.0));
        float flick = 0.75 + 0.25*n + 0.15*n2;
        // shock diamonds: periodic bright bands near nozzle
        float diamonds = pow(0.5+0.5*sin(along*28.0 - uTime*2.0), 8.0) * (1.0-along) * 0.9;
        float fade = pow(1.0-along, 1.6) * flick + diamonds;
        vec3 col = mix(uColor, uColor2, along);
        gl_FragColor = vec4(col * uIntensity * (1.2 + diamonds*2.0), clamp(fade,0.0,1.0));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return mat;
}

/* ---------------- Exhaust: layered afterburner ---------------- */
export const Exhaust = forwardRef<ExhaustHandle, { color: string; radius: number; position?: [number, number, number]; simple?: boolean }>(
  function Exhaust({ color, radius, position = [0, 0, 0], simple = false }, ref) {
    const g = geo();
    const root = useRef<THREE.Group>(null!);
    const core = useRef<THREE.Mesh>(null!);
    const outer = useRef<THREE.Mesh>(null!);
    const haze = useRef<THREE.Mesh>(null!);
    const flare = useRef<THREE.Sprite>(null!);
    const rings = useRef<THREE.Mesh[]>([]);
    const time = useRef(Math.random() * 10);
    const cur = useRef({ len: 1, boost: 0, thrust: 0 });

    const mats = useMemo(() => {
      const c = new THREE.Color(color);
      return {
        core: flameMaterial(color, true),
        outer: flameMaterial(color, false),
        haze: new THREE.MeshBasicMaterial({
          color: c.clone().multiplyScalar(0.8),
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
        ring: new THREE.MeshBasicMaterial({
          color: c.clone().lerp(new THREE.Color("#ffffff"), 0.5).multiplyScalar(3),
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
        flare: new THREE.SpriteMaterial({
          map: glowTexture(),
          color: c.clone().lerp(new THREE.Color("#ffffff"), 0.3).multiplyScalar(2),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      };
    }, [color]);

    useImperativeHandle(ref, () => ({
      update: (dt, thrust, boost) => {
        const s = cur.current;
        s.boost = boost;
        s.thrust = thrust;
        time.current += dt * (1 + boost * 1.5);
        const targetLen = (1.2 + thrust * 1.6 + boost * 7.0) * radius * 2.2;
        s.len += (targetLen - s.len) * Math.min(1, dt * 10);
        const flick = 1 + (Math.random() - 0.5) * 0.12;
        const len = s.len * flick;
        const width = radius * (1 + boost * 0.55);
        mats.core.uniforms.uTime.value = time.current;
        mats.outer.uniforms.uTime.value = time.current;
        mats.core.uniforms.uIntensity.value = 1.3 + boost * 1.1;
        mats.outer.uniforms.uIntensity.value = 1.0 + boost * 1.2;
        if (core.current) core.current.scale.set(width * 0.55, width * 0.55, len * 0.85);
        if (outer.current) outer.current.scale.set(width, width, len);
        if (haze.current) {
          haze.current.scale.set(width * 1.5, width * 1.5, len * 0.5);
          (haze.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + boost * 0.14;
        }
        if (flare.current) {
          const fs = radius * (2.2 + thrust * 0.8 + boost * 2.6) * flick;
          flare.current.scale.set(fs, fs, 1);
        }
        mats.ring.opacity = boost * 0.55;
        rings.current.forEach((r, i) => {
          if (!r) return;
          const f = (i + 1) / (rings.current.length + 1);
          r.position.z = len * f * 0.55;
          const rs = width * (0.55 - f * 0.3) * (1 + 0.12 * Math.sin(time.current * 20 + i));
          r.scale.set(rs, rs, 1);
        });
      },
    }));

    return (
      <group ref={root} position={position}>
        {/* wide heat haze */}
        {!simple && <mesh ref={haze} geometry={g.cone} material={mats.haze} />}
        {/* outer colored flame */}
        <mesh ref={outer} geometry={g.cone} material={mats.outer} />
        {/* hot white core */}
        <mesh ref={core} geometry={g.cone} material={mats.core} />
        {/* shock diamond rings – appear during NOS */}
        {(simple ? [] : [0, 1, 2]).map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) rings.current[i] = m;
            }}
            geometry={g.ring}
            material={mats.ring}
          />
        ))}
        <sprite ref={flare} material={mats.flare} position={[0, 0, 0.1]} />
      </group>
    );
  }
);

/* ---------------- ExhaustTrail: world-space ribbon behind the ship ---------------- */
const TRAIL_N = 48;
export function ExhaustTrail({
  ship,
  color,
  offset,
  boostRef,
}: {
  ship: MutableRefObject<THREE.Group>;
  color: string;
  offset: [number, number, number];
  boostRef: MutableRefObject<number>;
}) {
  const mesh = useRef<THREE.Mesh>(null!);
  const scene = useThree((st) => st.scene);
  const pts = useMemo(() => Array.from({ length: TRAIL_N }, () => new THREE.Vector3()), []);
  const initialized = useRef(false);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), side: new THREE.Vector3(), dir: new THREE.Vector3(), toCam: new THREE.Vector3() }), []);
  const widthAmt = useRef(0);

  const geometry = useMemo(() => {
    const gm = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_N * 2 * 3);
    const uv = new Float32Array(TRAIL_N * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N; i++) {
      uv[(i * 2) * 2] = 0;
      uv[(i * 2) * 2 + 1] = i / (TRAIL_N - 1);
      uv[(i * 2 + 1) * 2] = 1;
      uv[(i * 2 + 1) * 2 + 1] = i / (TRAIL_N - 1);
      if (i < TRAIL_N - 1) {
        const o = i * 2;
        idx.push(o, o + 1, o + 3, o, o + 3, o + 2);
      }
    }
    gm.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    gm.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    gm.setIndex(idx);
    return gm;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
          void main(){
            float edge = 1.0 - abs(vUv.x*2.0-1.0);
            edge = pow(edge, 1.5);
            float along = 1.0 - vUv.y;
            float a = edge * along * along * uAlpha;
            vec3 col = mix(uColor*2.2, vec3(1.0), edge*0.6*along);
            gl_FragColor = vec4(col, a);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [color]
  );

  useFrame((state, dt) => {
    const g = ship.current;
    if (!g || !mesh.current) return;
    const { v, side, dir, toCam } = tmp;
    v.set(offset[0], offset[1], offset[2]);
    g.localToWorld(v);
    if (!initialized.current) {
      pts.forEach((p) => p.copy(v));
      initialized.current = true;
    }
    // shift history each frame with distance-based spacing
    const moved = pts[0].distanceTo(v);
    if (moved > 0.25) {
      for (let i = TRAIL_N - 1; i > 0; i--) pts[i].copy(pts[i - 1]);
    }
    pts[0].copy(v);
    // if ship is nearly stationary, let trail collapse
    if (moved < 0.05) {
      for (let i = 1; i < TRAIL_N; i++) pts[i].lerp(pts[i - 1], Math.min(1, dt * 6));
    }
    const boost = boostRef.current;
    const speedFactor = Math.min(1, moved / 1.5);
    const target = 0.25 * speedFactor + boost * 1.0;
    widthAmt.current += (target - widthAmt.current) * Math.min(1, dt * 6);
    material.uniforms.uAlpha.value = widthAmt.current;

    const arr = geometry.attributes.position.array as Float32Array;
    const cam = state.camera.position;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = pts[i];
      const n = pts[Math.min(TRAIL_N - 1, i + 1)];
      const pr = pts[Math.max(0, i - 1)];
      dir.subVectors(pr, n);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      toCam.subVectors(cam, p).normalize();
      side.crossVectors(dir, toCam).normalize();
      const w = (0.18 + boost * 0.55) * (1 - i / TRAIL_N) + 0.02;
      arr[(i * 2) * 3] = p.x + side.x * w;
      arr[(i * 2) * 3 + 1] = p.y + side.y * w;
      arr[(i * 2) * 3 + 2] = p.z + side.z * w;
      arr[(i * 2 + 1) * 3] = p.x - side.x * w;
      arr[(i * 2 + 1) * 3 + 1] = p.y - side.y * w;
      arr[(i * 2 + 1) * 3 + 2] = p.z - side.z * w;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  // world-space ribbon: render directly into the scene, not under the ship transform
  return createPortal(<mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />, scene);
}
