import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { game } from "../game/store";

const COUNT = 220;

/** Streaks rushing past the camera during NOS boost – attached to the camera */
export function SpeedLines() {
  const ref = useRef<THREE.LineSegments>(null!);
  const amt = useRef(0);
  const data = useMemo(() => {
    const pos = new Float32Array(COUNT * 2 * 3);
    const col = new Float32Array(COUNT * 2 * 3);
    const spd = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 14;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.65;
      const z = -(Math.random() * 60);
      const len = 2 + Math.random() * 5;
      pos.set([x, y, z, x, y, z - len], i * 6);
      col.set([0.5, 0.85, 1, 0, 0, 0], i * 6);
      spd[i] = 80 + Math.random() * 60;
    }
    return { pos, col, spd };
  }, []);

  useFrame((state, dt) => {
    const target = game.boosting ? 1 : 0;
    amt.current += (target - amt.current) * Math.min(1, dt * (game.boosting ? 5 : 3));
    const ls = ref.current;
    if (!ls) return;
    ls.visible = amt.current > 0.02;
    if (!ls.visible) return;
    ls.position.copy(state.camera.position);
    ls.quaternion.copy(state.camera.quaternion);
    (ls.material as THREE.LineBasicMaterial).opacity = amt.current * 0.55;
    const arr = ls.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 6;
      const dz = data.spd[i] * dt * (0.5 + amt.current);
      arr[o + 2] += dz;
      arr[o + 5] += dz;
      if (arr[o + 2] > 2) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 14;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.65;
        const z = -60 - Math.random() * 20;
        const len = 2 + Math.random() * 5;
        arr[o] = x;
        arr[o + 1] = y;
        arr[o + 2] = z;
        arr[o + 3] = x;
        arr[o + 4] = y;
        arr[o + 5] = z - len;
      }
    }
    ls.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}
