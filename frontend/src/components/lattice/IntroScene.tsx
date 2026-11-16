/**
 * Cinematic Intro R3F scene — Simulate → Detect → Explain.
 *
 * Perf budget (vs the first version): one InstancedMesh for all lattice nodes,
 * two LineSegments for all edges, instanced packet trails, a 3-light rig,
 * no ContactShadows, no per-frame allocations, pointer read from a ref.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, InstancedMesh, Mesh, Points } from 'three';
import * as THREE from 'three';
import { cssVarColor } from './colors';

export type IntroBeat = 0 | 1 | 2 | 3 | 4 | 5;

/** Normalized pointer offset in roughly [-0.5, 0.5]. */
export interface IntroPointer {
  x: number;
  y: number;
}

interface IntroSceneProps {
  step: IntroBeat;
  /** Mutable pointer ref — read inside useFrame so React never re-renders on mousemove. */
  pointerRef: React.MutableRefObject<IntroPointer>;
  /** Fired once, on the first rendered frame (starts the beat clock). */
  onReady?: () => void;
}

const CAM: Record<number, { pos: THREE.Vector3; look: THREE.Vector3; fov: number }> = {
  0: { pos: new THREE.Vector3(0.55, 1.55, 6.4), look: new THREE.Vector3(0.1, 0.2, 0), fov: 34 },
  1: { pos: new THREE.Vector3(-2.35, 0.72, 3.55), look: new THREE.Vector3(-0.85, 0.28, 0.1), fov: 32 },
  2: { pos: new THREE.Vector3(2.15, 1.15, 2.85), look: new THREE.Vector3(1.55, 0.42, 0.05), fov: 30 },
  3: { pos: new THREE.Vector3(0.35, 0.28, 3.55), look: new THREE.Vector3(0.15, -0.15, 0.4), fov: 33 },
  4: { pos: new THREE.Vector3(-0.15, 1.35, 5.85), look: new THREE.Vector3(0, 0.2, 0), fov: 38 },
  5: { pos: new THREE.Vector3(0.05, 1.55, 6.85), look: new THREE.Vector3(0, 0.25, 0), fov: 40 },
};

const _target = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function CameraRig({
  step,
  pointerRef,
}: {
  step: IntroBeat;
  pointerRef: React.MutableRefObject<IntroPointer>;
}) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 0.15, 0));
  const ptrX = useRef(0);
  const ptrY = useRef(0);

  useFrame((_, dt) => {
    const target = CAM[step] ?? CAM[0];
    const damp = 1 - Math.exp(-dt * 2.05);
    const p = pointerRef.current;
    ptrX.current = THREE.MathUtils.damp(ptrX.current, p.x, 4.5, dt);
    ptrY.current = THREE.MathUtils.damp(ptrY.current, p.y, 4.5, dt);

    const k = step >= 4 ? 0.55 : 1;
    _target.set(
      target.pos.x + ptrX.current * 0.62 * k,
      target.pos.y - ptrY.current * 0.38 * k,
      target.pos.z + ptrX.current * -0.12,
    );
    camera.position.lerp(_target, damp);
    _lookTarget.set(
      target.look.x + ptrX.current * 0.28,
      target.look.y - ptrY.current * 0.18,
      target.look.z,
    );
    look.current.lerp(_lookTarget, damp);

    const t = performance.now() * 0.00009;
    const sway = step === 0 ? 0.055 : step >= 4 ? 0.04 : 0.028;
    camera.position.x += Math.sin(t) * sway;
    camera.position.y += Math.cos(t * 0.78) * sway * 0.65;
    camera.lookAt(look.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      const next = THREE.MathUtils.lerp(camera.fov, target.fov, damp);
      if (Math.abs(next - camera.fov) > 0.002) {
        camera.fov = next;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

function buildLattice(): { nodes: THREE.Vector3[]; edges: [number, number][] } {
  const nodes: THREE.Vector3[] = [];
  const layers = 8;
  const segs = 16;
  for (let r = 0; r < layers; r++) {
    const t = r / (layers - 1);
    const rr = 0.55 + Math.sin(t * Math.PI) * 1.15 + t * 0.42;
    const y = (r - (layers - 1) / 2) * 0.36;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2 + r * 0.19;
      const wobble = 1 + Math.sin(a * 3 + r * 1.2) * 0.05;
      nodes.push(new THREE.Vector3(Math.cos(a) * rr * wobble, y, Math.sin(a) * rr * 0.72 * wobble));
    }
  }
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const a = t * Math.PI * 5;
    nodes.push(new THREE.Vector3(Math.cos(a) * 0.38, (t - 0.5) * 2.35, Math.sin(a) * 0.3));
  }
  nodes.push(new THREE.Vector3(0, 0.05, 0));

  const edges: [number, number][] = [];
  for (let i = 0; i < nodes.length && edges.length < 280; i++) {
    for (let j = i + 1; j < nodes.length && edges.length < 280; j++) {
      const d = nodes[i].distanceTo(nodes[j]);
      if (d > 0.26 && d < 0.72) edges.push([i, j]);
    }
  }
  return { nodes, edges };
}

function LivingLattice({
  accent,
  copper,
  morph,
  intensity,
  pointerRef,
  brandOpen,
}: {
  accent: string;
  copper: string;
  morph: number;
  intensity: number;
  pointerRef: React.MutableRefObject<IntroPointer>;
  brandOpen: number;
}) {
  const group = useRef<Group>(null);
  const inst = useRef<InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const lineMatA = useRef<THREE.LineBasicMaterial>(null);
  const lineMatB = useRef<THREE.LineBasicMaterial>(null);
  const { nodes, edges } = useMemo(() => buildLattice(), []);
  const ptrX = useRef(0);
  const ptrY = useRef(0);

  // Two line batches (accent / copper) — each one draw call.
  const [geoA, geoB] = useMemo(() => {
    const a: number[] = [];
    const b: number[] = [];
    edges.forEach(([i, j], n) => {
      const dst = n % 4 === 0 ? b : a;
      dst.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
    });
    const mk = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return g;
    };
    return [mk(a), mk(b)];
  }, [nodes, edges]);

  useEffect(
    () => () => {
      geoA.dispose();
      geoB.dispose();
    },
    [geoA, geoB],
  );

  // Static per-instance transform + colour.
  useEffect(() => {
    const mesh = inst.current;
    if (!mesh) return;
    nodes.forEach((p, i) => {
      const isCore = i === nodes.length - 1;
      _dummy.position.copy(p);
      _dummy.scale.setScalar(isCore ? 0.11 : 0.026 + (i % 5) * 0.005);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _color.set(i % 5 === 0 ? copper : accent);
      mesh.setColorAt(i, _color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes, accent, copper]);

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    ptrX.current = THREE.MathUtils.damp(ptrX.current, pointerRef.current.x, 3.8, dt);
    ptrY.current = THREE.MathUtils.damp(ptrY.current, pointerRef.current.y, 3.8, dt);

    const t = clock.getElapsedTime();
    const breathe = 1 + Math.sin(t * 0.52) * 0.022;
    const squeeze = THREE.MathUtils.lerp(1, 0.86, morph);
    const expand = THREE.MathUtils.lerp(1, 1.12, brandOpen);
    group.current.scale.setScalar(breathe * squeeze * expand);
    group.current.rotation.y += dt * (0.05 + morph * 0.1 + brandOpen * 0.04);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, ptrY.current * 0.28, 3.5, dt);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, -ptrX.current * 0.2, 3.5, dt);

    if (matRef.current) {
      matRef.current.opacity = 0.55 + intensity * 0.4;
      matRef.current.emissiveIntensity = 0.16 + morph * 0.7 + intensity * 0.28 + brandOpen * 0.35 + Math.sin(t * 2) * 0.04;
    }
    const lo = 0.18 + morph * 0.2 + brandOpen * 0.12;
    if (lineMatA.current) lineMatA.current.opacity = lo;
    if (lineMatB.current) lineMatB.current.opacity = lo * 1.25;
  });

  return (
    <group ref={group} position={[0.12, 0.08, 0]}>
      <instancedMesh ref={inst} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          ref={matRef}
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.3}
          roughness={0.25}
          metalness={0.75}
          transparent
          opacity={0.9}
        />
      </instancedMesh>
      <lineSegments geometry={geoA}>
        <lineBasicMaterial ref={lineMatA} color={accent} transparent opacity={0.2} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={geoB}>
        <lineBasicMaterial ref={lineMatB} color={copper} transparent opacity={0.25} depthWrite={false} />
      </lineSegments>
      {[0.5, 1.05, 1.65, 2.2].map((r, i) => (
        <mesh key={`ring-${i}`} rotation={[Math.PI / 2, 0, i * 0.12]} position={[0, (i - 1.5) * 0.42, 0]}>
          <torusGeometry args={[r, 0.008, 6, 96]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? accent : copper}
            transparent
            opacity={0.45 + intensity * 0.2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** One instanced draw call per packet stream: bright head + soft afterglow. */
function PacketTrail({
  active,
  color,
  speed = 0.32,
  offset = 0,
  count = 9,
  curvePts,
  size = 1,
}: {
  active: boolean;
  color: string;
  speed?: number;
  offset?: number;
  count?: number;
  curvePts: THREE.Vector3[];
  size?: number;
}) {
  const inst = useRef<InstancedMesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(curvePts), [curvePts]);
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    return new THREE.Line(geo, mat);
  }, [curve, color]);
  const total = count + 6;
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const base = useMemo(() => new THREE.Color(color), [color]);

  useEffect(
    () => () => {
      lineObj.geometry.dispose();
      (lineObj.material as THREE.Material).dispose();
    },
    [lineObj],
  );

  useFrame(({ clock }) => {
    const mesh = inst.current;
    if (!mesh) return;
    (lineObj.material as THREE.LineBasicMaterial).opacity = active ? 0.45 : 0.06;
    mesh.visible = active;
    if (!active) return;
    const t0 = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const t = (t0 * speed + offset + i / count) % 1;
      const eased = t * t * (3 - 2 * t);
      curve.getPointAt(eased, tmp);
      const lead = 1 - i / count;
      const pulse = 0.85 + Math.sin(t0 * 7 + i) * 0.1;
      _dummy.position.copy(tmp);
      _dummy.scale.setScalar((0.032 + lead * 0.09) * pulse * size);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _color.copy(base).multiplyScalar(0.25 + lead * 0.95);
      mesh.setColorAt(i, _color);
    }
    for (let i = 0; i < 6; i++) {
      const t = (t0 * speed + offset + 0.08 + i * 0.04) % 1;
      curve.getPointAt(t, tmp);
      _dummy.position.copy(tmp);
      _dummy.scale.setScalar(0.018 * size * (1 - i / 6));
      _dummy.updateMatrix();
      mesh.setMatrixAt(count + i, _dummy.matrix);
      _color.copy(base).multiplyScalar(0.35 * (1 - i / 6));
      mesh.setColorAt(count + i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={lineObj} />
      <instancedMesh ref={inst} args={[undefined, undefined, total]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function CascadeCore({
  catching,
  accent,
  critical,
  copper,
}: {
  catching: boolean;
  accent: string;
  critical: string;
  copper: string;
}) {
  const core = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);
  const ringA = useRef<Mesh>(null);
  const ringB = useRef<Mesh>(null);
  const rim = useRef<Mesh>(null);
  const flare = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (core.current) {
      const breathe = 1 + Math.sin(t * (catching ? 5.2 : 1.35)) * (catching ? 0.15 : 0.04);
      core.current.scale.setScalar(breathe);
      core.current.rotation.y = t * 0.5;
      core.current.rotation.z = t * 0.18;
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = catching ? 1.45 : 0.55 + Math.sin(t * 1.8) * 0.08;
    }
    if (shell.current) {
      shell.current.rotation.x = t * 0.32;
      shell.current.rotation.y = -t * 0.24;
    }
    if (rim.current) rim.current.rotation.z = t * 0.65;
    if (flare.current) {
      flare.current.rotation.z = -t * 0.4;
      flare.current.visible = catching;
      if (catching) {
        const p = (t % 1.6) / 1.6;
        flare.current.scale.setScalar(0.7 + p * 1.8);
        (flare.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - p);
      }
    }
    if (ringA.current) {
      ringA.current.visible = catching;
      if (catching) {
        const p = (t % 1.2) / 1.2;
        ringA.current.scale.setScalar(0.5 + p * 2.8);
        (ringA.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - p);
      }
    }
    if (ringB.current) {
      ringB.current.visible = catching;
      if (catching) {
        const p = ((t + 0.45) % 1.2) / 1.2;
        ringB.current.scale.setScalar(0.4 + p * 3.0);
        (ringB.current.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - p);
      }
    }
  });

  return (
    <group position={[1.95, 0.38, 0.12]}>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial
          color={catching ? critical : accent}
          emissive={catching ? critical : accent}
          emissiveIntensity={0.55}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.62, 0]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.42} />
      </mesh>
      <mesh ref={rim} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.68, 0.018, 8, 64]} />
        <meshBasicMaterial color={copper} />
      </mesh>
      <mesh ref={flare} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.95, 48]} />
        <meshBasicMaterial color={critical} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringA} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 48]} />
        <meshBasicMaterial color={critical} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 2.3, 0.3, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ExplainSlab({ visible, accent, copper }: { visible: boolean; accent: string; copper: string }) {
  const ref = useRef<Group>(null);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = visible ? 1 : 0;
    const s = THREE.MathUtils.damp(ref.current.scale.x, target, 5.8, dt);
    ref.current.scale.setScalar(Math.max(0.001, s));
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, visible ? -0.28 : 0.45, 4.8, dt);
    ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, visible ? -0.58 : -1.1, 4.8, dt);
    ref.current.visible = s > 0.01 || visible;
  });

  return (
    <group ref={ref} position={[0.15, -0.65, 1.55]} scale={0.001} visible={false}>
      <mesh>
        <boxGeometry args={[2.4, 1.15, 0.07]} />
        <meshStandardMaterial color="#faf8f5" roughness={0.3} metalness={0.05} />
      </mesh>
      <mesh position={[-1.02, 0.22, 0.04]}>
        <boxGeometry args={[0.11, 0.48, 0.025]} />
        <meshBasicMaterial color={copper} />
      </mesh>
      {[0.32, 0.1, -0.1, -0.3].map((y, i) => (
        <mesh key={i} position={[0.18, y, 0.04]}>
          <boxGeometry args={[i === 0 ? 1.25 : 1.5 - i * 0.12, 0.055, 0.016]} />
          <meshBasicMaterial color={i === 0 ? accent : '#b8b3ab'} transparent opacity={i === 0 ? 0.95 : 0.5} />
        </mesh>
      ))}
    </group>
  );
}

function AmbientDust({ color, copper, density = 340 }: { color: string; copper: string; density?: number }) {
  const points = useRef<Points>(null);
  const pointsHot = useRef<Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(density * 3);
    for (let i = 0; i < density; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 11;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 7.5;
    }
    return arr;
  }, [density]);
  const hot = useMemo(() => {
    const arr = new Float32Array(70 * 3);
    for (let i = 0; i < 70; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (points.current) {
      points.current.rotation.y = t * 0.028;
      points.current.rotation.x = Math.sin(t * 0.09) * 0.05;
    }
    if (pointsHot.current) {
      pointsHot.current.rotation.y = -t * 0.04;
      pointsHot.current.rotation.z = Math.sin(t * 0.12) * 0.03;
    }
  });

  return (
    <>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.022} transparent opacity={0.45} sizeAttenuation depthWrite={false} />
      </points>
      <points ref={pointsHot}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hot, 3]} />
        </bufferGeometry>
        <pointsMaterial color={copper} size={0.035} transparent opacity={0.55} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}

function OriginBeacon({ active, color }: { active: boolean; color: string }) {
  const ref = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const halo2 = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      const pulse = 1 + Math.sin(t * (active ? 5.8 : 1.4)) * (active ? 0.2 : 0.05);
      ref.current.scale.setScalar(pulse);
      ref.current.rotation.y = t * 0.95;
      ref.current.rotation.x = t * 0.35;
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 1.45 : 0.4;
    }
    if (halo.current) {
      halo.current.visible = active;
      if (active) {
        const p = (t % 1.1) / 1.1;
        halo.current.scale.setScalar(0.75 + p * 2.4);
        (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.48 * (1 - p);
      }
    }
    if (halo2.current) {
      halo2.current.visible = active;
      if (active) {
        const p = ((t + 0.4) % 1.1) / 1.1;
        halo2.current.scale.setScalar(0.6 + p * 2.6);
        (halo2.current.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - p);
      }
    }
  });
  return (
    <group position={[-3.05, 0.28, 0.55]}>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.25} metalness={0.6} />
      </mesh>
      <mesh ref={halo} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.24, 0.34, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={halo2} rotation={[Math.PI / 2.4, 0.2, 0]} visible={false}>
        <ringGeometry args={[0.24, 0.34, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Soft light shaft — fake volumetric cone for the key light. */
function LightShaft({
  position,
  color,
  intensity,
  rotation = [0.4, 0, 0.15] as [number, number, number],
}: {
  position: [number, number, number];
  color: string;
  intensity: number;
  rotation?: [number, number, number];
}) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      intensity * (0.045 + Math.sin(clock.getElapsedTime() * 0.7) * 0.012);
  });
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <coneGeometry args={[1.4, 5.5, 20, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function DetectSparks({ active, color }: { active: boolean; color: string }) {
  const inst = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const mesh = inst.current;
    if (!mesh) return;
    mesh.visible = active;
    if (!active) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 1.4;
      const r = 0.55 + Math.sin(t * 3 + i) * 0.25 + (i % 3) * 0.08;
      _dummy.position.set(Math.cos(a) * r, Math.sin(t * 2 + i) * 0.35, Math.sin(a) * r * 0.7);
      _dummy.scale.setScalar(0.02 + (Math.sin(t * 8 + i) * 0.5 + 0.5) * 0.04);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, 16]} position={[1.95, 0.38, 0.12]} visible={false} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

const PRIMARY_PATH = [
  new THREE.Vector3(-3.1, 0.28, 0.6),
  new THREE.Vector3(-1.7, 0.85, -0.2),
  new THREE.Vector3(-0.4, 0.12, 0.45),
  new THREE.Vector3(0.9, 0.62, -0.08),
  new THREE.Vector3(1.85, 0.42, 0.12),
];
const SECONDARY_PATH = [
  new THREE.Vector3(-2.95, -0.2, -0.4),
  new THREE.Vector3(-1.45, 0.4, 0.5),
  new THREE.Vector3(-0.05, 0.72, -0.3),
  new THREE.Vector3(1.05, 0.18, 0.4),
  new THREE.Vector3(1.9, 0.48, -0.05),
];
const TERTIARY_PATH = [
  new THREE.Vector3(-3.0, 0.55, -0.15),
  new THREE.Vector3(-1.55, 0.15, 0.55),
  new THREE.Vector3(-0.2, 0.55, -0.05),
  new THREE.Vector3(0.75, 0.05, 0.25),
  new THREE.Vector3(1.8, 0.35, 0.2),
];

/** Fires `onReady` once after the first frame has actually been drawn. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    // Defer one rAF so the frame is on screen before the clock starts.
    requestAnimationFrame(() => onReady?.());
  });
  return null;
}

export const IntroScene: React.FC<IntroSceneProps> = ({ step, pointerRef, onReady }) => {
  const accent = cssVarColor('--sr-accent');
  const copper = cssVarColor('--sr-accent-2');
  const critical = cssVarColor('--sr-sev-critical');

  const simulating = step === 1;
  const detecting = step === 2;
  const explaining = step >= 3 && step < 5;
  const morph = step >= 2 && step < 4 ? 1 : step >= 4 ? 0.35 : 0;
  const intensity = step === 0 ? 0.55 : step >= 4 ? 0.8 : 1;
  const packetsOn = simulating || step === 0 || step >= 4;
  const brandOpen = step >= 4 ? (step === 5 ? 1 : 0.55) : 0;

  return (
    <>
      <ReadySignal onReady={onReady} />
      <CameraRig step={step} pointerRef={pointerRef} />
      <fog attach="fog" args={['#ebe7e1', 6.5, 14.5]} />

      {/* Three-light rig: hemisphere fill, key, and a state-coloured accent. */}
      <hemisphereLight args={['#fff6ee', '#1e1838', 0.95]} />
      <directionalLight position={[6.2, 9.2, 4.5]} intensity={1.5} color="#fffaf3" />
      <pointLight
        position={[1.95, 0.7, 1.6]}
        intensity={detecting ? 3.4 : explaining ? 1.8 : 0.9}
        color={detecting ? critical : accent}
        distance={8}
      />

      <LightShaft position={[0.4, 3.8, 1.2]} color="#fff8f0" intensity={1} />
      <LightShaft position={[-1.8, 3.2, 0.5]} color={accent} intensity={packetsOn ? 1.2 : 0.5} rotation={[0.55, 0.3, -0.2]} />

      <AmbientDust color={accent} copper={copper} density={step >= 4 ? 420 : 340} />
      <LivingLattice
        accent={accent}
        copper={copper}
        morph={morph}
        intensity={intensity}
        pointerRef={pointerRef}
        brandOpen={brandOpen}
      />
      <OriginBeacon active={packetsOn} color={critical} />
      <PacketTrail active={packetsOn} color={critical} curvePts={PRIMARY_PATH} speed={0.38} count={11} size={1.1} />
      <PacketTrail active={packetsOn} color={copper} curvePts={SECONDARY_PATH} speed={0.28} offset={0.32} count={8} />
      <PacketTrail active={packetsOn || detecting} color={accent} curvePts={TERTIARY_PATH} speed={0.22} offset={0.55} count={7} size={0.85} />
      <CascadeCore catching={detecting || explaining} accent={accent} critical={critical} copper={copper} />
      <DetectSparks active={detecting} color={critical} />
      <ExplainSlab visible={explaining && step === 3} accent={accent} copper={copper} />
    </>
  );
};

export default IntroScene;
