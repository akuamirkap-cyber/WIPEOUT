import { forwardRef, useMemo, useRef, useImperativeHandle } from "react";
import { Exhaust, ExhaustTrail, type ExhaustHandle } from "./Exhaust";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Team } from "../game/store";

export interface ShipHandle {
  group: THREE.Group;
  setThrust: (t: number, boost: boolean) => void;
  setAirbrake: (l: number, r: number) => void;
}

function extrudeShape(pts: [number, number][], depth: number, bevel: number, mirror = true) {
  const s = new THREE.Shape();
  const all: [number, number][] = [...pts];
  if (mirror) {
    for (let i = pts.length - 2; i > 0; i--) all.push([-pts[i][0], pts[i][1]]);
  }
  s.moveTo(all[0][0], all[0][1]);
  for (let i = 1; i < all.length; i++) s.lineTo(all[i][0], all[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 4,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2); // shape +y -> world -z (forward), extrude depth -> +y
  g.computeVertexNormals();
  return g;
}

// Geometries are shared across all ships
let geos: Record<string, THREE.BufferGeometry> | null = null;
function getGeos() {
  if (geos) return geos;
  geos = {
    hull: extrudeShape(
      [
        [0, 4.1],
        [0.18, 3.5],
        [0.42, 2.0],
        [0.7, 0.4],
        [0.86, -1.2],
        [0.82, -2.4],
        [0.52, -2.85],
        [0, -2.9],
      ],
      0.4,
      0.16
    ),
    hullTop: extrudeShape(
      [
        [0, 2.4],
        [0.24, 1.4],
        [0.42, -0.2],
        [0.44, -1.8],
        [0.26, -2.4],
        [0, -2.45],
      ],
      0.2,
      0.11
    ),
    prong: extrudeShape(
      [
        [0, 4.4],
        [0.16, 4.1],
        [0.28, 2.8],
        [0.34, 0.4],
        [0.32, -1.5],
        [0.18, -2.1],
        [0, -2.15],
      ],
      0.3,
      0.1
    ),
    wing: extrudeShape(
      [
        [0, 1.0],
        [1.95, 0.3],
        [1.95, -0.7],
        [0, -1.1],
      ],
      0.07,
      0.035
    ),
    rearWing: extrudeShape(
      [
        [0, 0.5],
        [2.5, -0.25],
        [2.5, -0.7],
        [0, -0.85],
      ],
      0.06,
      0.035
    ),
    fin: (() => {
      const g = extrudeShape(
        [
          [0, 1.1],
          [1.0, -0.15],
          [1.0, -0.6],
          [0, -0.6],
        ],
        0.05,
        0.02,
        false
      );
      g.rotateZ(Math.PI / 2);
      return g;
    })(),
    airbrake: new THREE.BoxGeometry(0.55, 0.08, 0.7),
    nozzle: new THREE.CylinderGeometry(0.46, 0.56, 0.7, 24, 1, true),
    nozzleInner: new THREE.CylinderGeometry(0.34, 0.42, 0.5, 24),
    smallNozzle: new THREE.CylinderGeometry(0.16, 0.2, 0.3, 16),
    canopy: new THREE.SphereGeometry(1, 24, 16),
    intake: new THREE.BoxGeometry(0.3, 0.28, 1.2),
  };
  return geos;
}

export const Ship = forwardRef<ShipHandle, { team: Team; castShadow?: boolean }>(function Ship(
  { team, castShadow = true },
  ref
) {
  const group = useRef<THREE.Group>(null!);
  const exhaust = useRef<ExhaustHandle>(null!);
  const exhaustL = useRef<ExhaustHandle>(null!);
  const exhaustR = useRef<ExhaustHandle>(null!);
  const boostAmt = useRef(0);
  const abL = useRef<THREE.Mesh>(null!);
  const abR = useRef<THREE.Mesh>(null!);
  const state = useRef({ thrust: 0, boost: false, abl: 0, abr: 0 });
  const g = getGeos();

  const mats = useMemo(() => {
    const paint = (c: string) =>
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: 0.55,
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.2,
      });
    return {
      primary: paint(team.primary),
      secondary: paint(team.secondary),
      accent: paint(team.accent),
      dark: new THREE.MeshStandardMaterial({ color: "#1b1e24", metalness: 0.85, roughness: 0.4 }),
      metal: new THREE.MeshStandardMaterial({ color: "#8d949e", metalness: 0.95, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: "#0b1626",
        metalness: 0.2,
        roughness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 2,
      }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(team.glow).multiplyScalar(4), toneMapped: false }),
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2020").multiplyScalar(3), toneMapped: false }),
    };
  }, [team]);

  useImperativeHandle(ref, () => ({
    group: group.current,
    setThrust: (t, boost) => {
      state.current.thrust = t;
      state.current.boost = boost;
    },
    setAirbrake: (l, r) => {
      state.current.abl = l;
      state.current.abr = r;
    },
  }));

  useFrame((_, dt) => {
    const s = state.current;
    boostAmt.current += ((s.boost ? 1 : 0) - boostAmt.current) * Math.min(1, dt * (s.boost ? 7 : 3.5));
    const b = boostAmt.current;
    exhaust.current?.update(dt, s.thrust, b);
    exhaustL.current?.update(dt, s.thrust * 0.5, b * 0.7);
    exhaustR.current?.update(dt, s.thrust * 0.5, b * 0.7);
    if (abL.current) abL.current.rotation.x += (-s.abl * 0.9 - abL.current.rotation.x) * Math.min(1, dt * 10);
    if (abR.current) abR.current.rotation.x += (-s.abr * 0.9 - abR.current.rotation.x) * Math.min(1, dt * 10);
  });

  const sh = { castShadow, receiveShadow: true };

  return (
    <group ref={group}>
      {/* main hull */}
      <mesh geometry={g.hull} material={mats.primary} position={[0, 0.05, 0]} {...sh} />
      <mesh geometry={g.hullTop} material={mats.secondary} position={[0, 0.48, 0.1]} {...sh} />
      {/* cockpit */}
      <mesh geometry={g.canopy} material={mats.glass} position={[0, 0.7, -0.75]} scale={[0.32, 0.27, 1.35]} {...sh} />
      <mesh geometry={g.canopy} material={mats.dark} position={[0, 0.64, -0.75]} scale={[0.36, 0.23, 1.42]} />
      {/* nose accent stripe */}
      <mesh position={[0, 0.5, -2.8]} material={mats.accent} {...sh}>
        <boxGeometry args={[0.2, 0.05, 2.0]} />
      </mesh>
      {/* side intakes */}
      <mesh geometry={g.intake} material={mats.dark} position={[0.7, 0.3, 0.6]} {...sh} />
      <mesh geometry={g.intake} material={mats.dark} position={[-0.7, 0.3, 0.6]} {...sh} />
      {/* wings connecting hull to prongs */}
      <mesh geometry={g.wing} material={mats.secondary} position={[0, 0.2, -0.3]} {...sh} />
      <mesh geometry={g.wing} material={mats.secondary} position={[0, 0.2, -0.3]} scale={[-1, 1, 1]} {...sh} />
      {/* prongs (outriggers) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.78, 0.12, 0]}>
          <mesh geometry={g.prong} material={mats.primary} {...sh} />
          {/* accent stripe on prong */}
          <mesh position={[0, 0.44, 0.6]} material={mats.accent} {...sh}>
            <boxGeometry args={[0.14, 0.04, 3.2]} />
          </mesh>
          {/* prong tip light */}
          <mesh position={[0, 0.18, -4.3]} material={mats.glow}>
            <sphereGeometry args={[0.07, 8, 8]} />
          </mesh>
          {/* small rear nozzle */}
          <mesh geometry={g.smallNozzle} material={mats.dark} position={[0, 0.18, 2.2]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh position={[0, 0.18, 2.32]} material={mats.glow}>
            <circleGeometry args={[0.14, 16]} />
          </mesh>
          <Exhaust ref={side < 0 ? exhaustL : exhaustR} color={team.glow} radius={0.14} position={[0, 0.18, 2.36]} simple />
          {/* tail light */}
          <mesh position={[side * 0.28, 0.2, 2.15]} material={mats.red}>
            <boxGeometry args={[0.08, 0.06, 0.04]} />
          </mesh>
          {/* airbrake flap */}
          <mesh
            ref={side < 0 ? abL : abR}
            geometry={g.airbrake}
            material={mats.secondary}
            position={[side * 0.5, 0.34, 1.4]}
            {...sh}
          />
        </group>
      ))}
      {/* rear wing */}
      <mesh geometry={g.rearWing} material={mats.primary} position={[0, 0.52, 1.9]} {...sh} />
      <mesh geometry={g.rearWing} material={mats.primary} position={[0, 0.52, 1.9]} scale={[-1, 1, 1]} {...sh} />
      {/* vertical fin */}
      <mesh geometry={g.fin} material={mats.accent} position={[0, 0.68, 1.8]} {...sh} />
      {/* engine */}
      <group position={[0, 0.4, 2.8]}>
        <mesh geometry={g.nozzle} material={mats.metal} rotation={[Math.PI / 2, 0, 0]} {...sh} />
        <mesh geometry={g.nozzleInner} material={mats.dark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.05]} />
        <mesh material={mats.glow} position={[0, 0, 0.2]}>
          <circleGeometry args={[0.33, 24]} />
        </mesh>
        <mesh material={mats.dark} position={[0, 0, 0.21]}>
          <ringGeometry args={[0.1, 0.16, 16]} />
        </mesh>
        {/* afterburner ring (lights up during NOS) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.3]}>
          <torusGeometry args={[0.5, 0.05, 8, 32]} />
          <meshBasicMaterial color={new THREE.Color(team.glow).multiplyScalar(2)} toneMapped={false} />
        </mesh>
        <Exhaust ref={exhaust} color={team.glow} radius={0.36} position={[0, 0, 0.3]} />
      </group>
      <ExhaustTrail ship={group} color={team.glow} offset={[0, 0.4, 3.2]} boostRef={boostAmt} />
      {/* underside hover emitters */}
      {[-1.85, 0, 1.85].map((x, i) => (
        <mesh key={i} position={[x, -0.05, i === 1 ? -1.0 : -0.2]} rotation={[Math.PI / 2, 0, 0]} material={mats.glow}>
          <circleGeometry args={[i === 1 ? 0.22 : 0.14, 16]} />
        </mesh>
      ))}
    </group>
  );
});
