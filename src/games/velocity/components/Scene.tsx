import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Sky } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Track } from "./Track";
import { Racers } from "./Racers";
import { SpeedLines } from "./SpeedLines";
import { game } from "../game/store";
import { INNER_SUN } from "../game/track";
import { glowTexture } from "../game/textures";

const HDRI_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr";
const SUN_DIR = new THREE.Vector3(-0.5, 0.72, -0.42).normalize();

class EnvBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FallbackSky() {
  const { scene } = useThree();
  scene.background = new THREE.Color("#8fc3ff");
  return (
    <>
      <Sky sunPosition={[SUN_DIR.x * 100, SUN_DIR.y * 100, SUN_DIR.z * 100]} turbidity={4} rayleigh={1.2} mieCoefficient={0.004} />
      <Environment preset="city" />
    </>
  );
}

const SUN_COLOR = new THREE.Color("#fff3dc");
const CAVE_SUN_COLOR = new THREE.Color("#ffb27a");
const SKY_OUT = new THREE.Color("#bcd8ff");
const GROUND_OUT = new THREE.Color("#5a5a62");
const SKY_CAVE = new THREE.Color("#1e6a7c");
const GROUND_CAVE = new THREE.Color("#2a1246");
const FOG_OUT = new THREE.Color("#c7dbf2");
const FOG_CAVE = new THREE.Color("#07141c");

function Lighting() {
  const light = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const { scene } = useThree();
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), toSun: new THREE.Vector3() }), []);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    const c = l.shadow.camera;
    c.left = -140;
    c.right = 140;
    c.top = 140;
    c.bottom = -140;
    c.near = 10;
    c.far = 700;
    c.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const cave = game.cave;
    const p = game.playerPos;
    const f = game.playerForward;
    l.target.position.set(p.x + f.x * 45, p.y, p.z + f.z * 45);
    l.target.updateMatrixWorld();
    // outside: real sun. inside the hollow earth: light comes from the inner sun
    const { dir, toSun } = tmp;
    toSun.subVectors(INNER_SUN, l.target.position);
    const dSun = toSun.length();
    toSun.normalize();
    dir.lerpVectors(SUN_DIR, toSun, cave).normalize();
    const dist = THREE.MathUtils.lerp(300, THREE.MathUtils.clamp(dSun - 20, 40, 220), cave);
    l.position.copy(l.target.position).addScaledVector(dir, dist);
    l.intensity = THREE.MathUtils.lerp(5.0, 3.6, cave);
    l.color.lerpColors(SUN_COLOR, CAVE_SUN_COLOR, cave);
    const near = THREE.MathUtils.lerp(10, 2, cave);
    const c = l.shadow.camera;
    if (Math.abs(c.near - near) > 0.5) {
      c.near = near;
      c.updateProjectionMatrix();
    }
    if (hemi.current) {
      hemi.current.color.lerpColors(SKY_OUT, SKY_CAVE, cave);
      hemi.current.groundColor.lerpColors(GROUND_OUT, GROUND_CAVE, cave);
      hemi.current.intensity = THREE.MathUtils.lerp(0.35, 1.5, cave);
    }
    // atmosphere
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.lerpColors(FOG_OUT, FOG_CAVE, cave);
      fog.near = THREE.MathUtils.lerp(250, 80, cave);
      fog.far = THREE.MathUtils.lerp(1300, 1100, cave);
    }
    scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.12, cave);
  });
  return (
    <>
      <directionalLight
        ref={light}
        color="#fff3dc"
        intensity={5.0}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.00015}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
      <hemisphereLight ref={hemi} color="#bcd8ff" groundColor="#5a5a62" intensity={0.35} />
    </>
  );
}

function Snow() {
  const ref = useRef<THREE.Points>(null!);
  const COUNT = 2500;
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 220;
      positions[i * 3 + 1] = Math.random() * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 220;
      speeds[i] = 3 + Math.random() * 4;
    }
    return { positions, speeds };
  }, []);
  const tex = useMemo(() => glowTexture(), []);
  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    pts.visible = game.cave < 0.95;
    (pts.material as THREE.PointsMaterial).opacity = 0.8 * (1 - game.cave);
    if (!pts.visible) return;
    const cam = state.camera.position;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = arr[i * 3 + 1] - speeds[i] * dt;
      let x = arr[i * 3] + Math.sin(t * 0.8 + i) * dt * 1.5;
      let z = arr[i * 3 + 2];
      // wrap around camera
      if (y < cam.y - 20) y += 60;
      if (x < cam.x - 110) x += 220;
      if (x > cam.x + 110) x -= 220;
      if (z < cam.z - 110) z += 220;
      if (z > cam.z + 110) z -= 220;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} color="#ffffff" size={0.45} transparent opacity={0.8} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function Effects() {
  const ca = useRef<{ offset: THREE.Vector2 }>(null!);
  useFrame(() => {
    if (ca.current) {
      const a = game.boosting ? 0.0016 : 0.0004 + game.shake * 0.0015;
      ca.current.offset.set(a, a);
    }
  });
  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={1.0} luminanceSmoothing={0.25} radius={0.75} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0.0006, 0.0006)} radialModulation modulationOffset={0.3} />
      <Vignette eskil={false} offset={0.2} darkness={0.75} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  );
}

export function Scene() {
  return (
    <>
      <EnvBoundary fallback={<FallbackSky />}>
        <Suspense fallback={<FallbackSky />}>
          <Environment files={HDRI_URL} background backgroundBlurriness={0} backgroundIntensity={1.25} environmentIntensity={0.55} />
        </Suspense>
      </EnvBoundary>
      <Lighting />
      <fog attach="fog" args={["#c7dbf2", 250, 1300]} />
      <Track />
      <Racers />
      <Snow />
      <SpeedLines />
      <Effects />
    </>
  );
}
