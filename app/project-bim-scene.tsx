"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Position = [number, number, number];

const towerLayout: Array<{
  name: string;
  position: Position;
  rotation: number;
  floors: number;
}> = [
  { name: "101동", position: [-12, 0, -8], rotation: 0.08, floors: 12 },
  { name: "102동", position: [-4, 0, -11], rotation: -0.04, floors: 14 },
  { name: "103동", position: [5, 0, -10], rotation: 0.06, floors: 11 },
  { name: "104동", position: [13, 0, -7], rotation: -0.08, floors: 13 },
  { name: "105동", position: [-10, 0, 7], rotation: -0.04, floors: 10 },
  { name: "106동", position: [11, 0, 7], rotation: 0.06, floors: 12 },
];

function SceneControls({ selected }: { selected: boolean }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const focusProgress = useRef(1);
  const desiredPosition = useMemo(
    () =>
      selected
        ? new THREE.Vector3(17, 13, 23)
        : new THREE.Vector3(27, 24, 31),
    [selected],
  );
  const desiredTarget = useMemo(
    () =>
      selected
        ? new THREE.Vector3(-8.5, 0.5, 10)
        : new THREE.Vector3(0, 2.2, 0),
    [selected],
  );

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.minDistance = 15;
    controls.maxDistance = 58;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.copy(desiredTarget);
    controls.update();
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, desiredTarget, gl.domElement]);

  useEffect(() => {
    focusProgress.current = 0;
  }, [selected]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (focusProgress.current < 1) {
      const alpha = Math.min(1, delta * 2.6);
      camera.position.lerp(desiredPosition, alpha);
      controls.target.lerp(desiredTarget, alpha);
      if (
        camera.position.distanceTo(desiredPosition) < 0.08 &&
        controls.target.distanceTo(desiredTarget) < 0.05
      ) {
        focusProgress.current = 1;
      }
    }
    controls.update();
  });

  return null;
}

function ApartmentTower({
  name,
  position,
  rotation,
  floors,
  dimmed,
}: {
  name: string;
  position: Position;
  rotation: number;
  floors: number;
  dimmed: boolean;
}) {
  const floorsRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!floorsRef.current) return;
    const transform = new THREE.Object3D();
    for (let index = 0; index < floors; index += 1) {
      transform.position.set(0, 0.45 + index * 0.58, 0);
      transform.scale.set(1, index === floors - 1 ? 0.82 : 1, 1);
      transform.updateMatrix();
      floorsRef.current.setMatrixAt(index, transform.matrix);
    }
    floorsRef.current.instanceMatrix.needsUpdate = true;
  }, [floors]);

  return (
    <group
      name={name}
      onPointerOut={() => setHovered(false)}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      position={position}
      rotation={[0, rotation, 0]}
    >
      <instancedMesh
        args={[undefined, undefined, floors]}
        castShadow
        receiveShadow
        ref={floorsRef}
      >
        <boxGeometry args={[5.1, 0.48, 3.35]} />
        <meshStandardMaterial
          color={hovered ? "#b9cbc9" : "#aeb8b7"}
          opacity={dimmed ? 0.5 : 0.92}
          roughness={0.92}
          transparent
        />
      </instancedMesh>
      <mesh castShadow position={[0, floors * 0.29, 0]}>
        <boxGeometry args={[1.15, floors * 0.58, 2.8]} />
        <meshStandardMaterial
          color="#7f8b8b"
          opacity={dimmed ? 0.44 : 0.82}
          roughness={0.95}
          transparent
        />
      </mesh>
      <mesh position={[0, floors * 0.58 + 0.35, 0]}>
        <boxGeometry args={[3.8, 0.32, 2.5]} />
        <meshStandardMaterial color="#697575" roughness={0.95} />
      </mesh>
    </group>
  );
}

function PodiumAndParking({ selected }: { selected: boolean }) {
  return (
    <group position={[0, -0.45, 1.1]}>
      <mesh receiveShadow>
        <boxGeometry args={[31, 0.65, 22]} />
        <meshStandardMaterial color="#899493" roughness={0.96} />
      </mesh>
      <mesh position={[-5, -0.2, 3.4]}>
        <boxGeometry args={[19, 0.5, 12]} />
        <meshStandardMaterial
          color={selected ? "#5ac4c7" : "#79aeb5"}
          opacity={selected ? 0.45 : 0.25}
          roughness={0.72}
          transparent
        />
      </mesh>
      {[-10, -5, 0, 5].map((x) => (
        <mesh key={x} position={[x, 0.18, 3.4]}>
          <boxGeometry args={[0.38, 1.2, 0.38]} />
          <meshStandardMaterial color="#717d7c" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function InternalRoad() {
  return (
    <group position={[0, 0.03, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 5]} />
        <meshStandardMaterial color="#3f4748" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.13, 31]} />
        <meshStandardMaterial color="#e6c65d" />
      </mesh>
      <mesh position={[-13, 0.03, 6.2]} rotation={[-Math.PI / 2, 0, -0.72]}>
        <planeGeometry args={[11, 4.2]} />
        <meshStandardMaterial color="#444d4e" roughness={0.92} />
      </mesh>
      <mesh position={[13, 0.03, 6]} rotation={[-Math.PI / 2, 0, 0.58]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#444d4e" roughness={0.92} />
      </mesh>
    </group>
  );
}

function LandscapeZone() {
  const trees = [
    [-6, 0, -1.8],
    [-2.8, 0, -2],
    [3, 0, -2],
    [6.4, 0, -1.6],
    [-5, 0, 2.4],
    [-1.6, 0, 2.2],
    [2.2, 0, 2.4],
    [5.5, 0, 2.1],
  ] as Position[];
  return (
    <group>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[14.5, 0.18, 7.2]} />
        <meshStandardMaterial color="#96aa8b" roughness={1} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[7.2, 0.06, 1.2]} />
        <meshStandardMaterial color="#d7dcce" roughness={1} />
      </mesh>
      {trees.map((position, index) => (
        <group key={`${position.join("-")}-${index}`} position={position}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.7, 6]} />
            <meshStandardMaterial color="#5f6a59" />
          </mesh>
          <mesh position={[0, 0.88, 0]}>
            <sphereGeometry args={[0.38, 8, 6]} />
            <meshStandardMaterial color="#6f8f6b" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SiteBoundary() {
  return (
    <group position={[0, 0.45, 0]}>
      <mesh position={[0, 0, -15]}>
        <boxGeometry args={[38, 0.9, 0.35]} />
        <meshStandardMaterial color="#808989" />
      </mesh>
      <mesh position={[0, 0, 15]}>
        <boxGeometry args={[38, 0.9, 0.35]} />
        <meshStandardMaterial color="#808989" />
      </mesh>
      <mesh position={[-19, 0, 0]}>
        <boxGeometry args={[0.35, 0.9, 30]} />
        <meshStandardMaterial color="#808989" />
      </mesh>
      <mesh position={[19, 0, 0]}>
        <boxGeometry args={[0.35, 0.9, 30]} />
        <meshStandardMaterial color="#808989" />
      </mesh>
    </group>
  );
}

function RampEntrance({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  const route = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-18, 0.25, 9.8),
        new THREE.Vector3(-14.7, 0.25, 9.4),
        new THREE.Vector3(-11.6, 0.12, 8.3),
        new THREE.Vector3(-8.8, -0.35, 7.3),
      ]),
    [],
  );
  return (
    <group>
      <mesh onClick={onSelect}>
        <tubeGeometry args={[route, 32, selected ? 0.17 : 0.11, 6, false]} />
        <meshStandardMaterial
          color={selected ? "#00a99d" : "#e1bd43"}
          emissive={selected ? "#004b46" : "#3f3000"}
        />
      </mesh>
      <mesh
        onClick={onSelect}
        position={[-9.9, -0.12, 7.7]}
        rotation={[0.09, 0.24, 0]}
      >
        <boxGeometry args={[5.2, 0.36, 3.1]} />
        <meshStandardMaterial
          color={selected ? "#1bbab0" : "#737f7f"}
          emissive={selected ? "#064c47" : "#000000"}
          roughness={0.78}
        />
      </mesh>
      <mesh position={[-9.9, 0.65, 7.7]}>
        <torusGeometry args={[1.8, 0.08, 6, 32, Math.PI]} />
        <meshStandardMaterial color={selected ? "#43ddd1" : "#aab5b3"} />
      </mesh>
    </group>
  );
}

function SimplifiedCrane({ position }: { position: Position }) {
  return (
    <group position={position}>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[0.25, 8, 0.25]} />
        <meshStandardMaterial color="#c7a145" roughness={0.7} />
      </mesh>
      <mesh position={[2, 7.8, 0]}>
        <boxGeometry args={[4.2, 0.16, 0.16]} />
        <meshStandardMaterial color="#c7a145" roughness={0.7} />
      </mesh>
      <mesh position={[3.7, 6.7, 0]}>
        <boxGeometry args={[0.05, 2.1, 0.05]} />
        <meshStandardMaterial color="#555d5c" />
      </mesh>
    </group>
  );
}

function SiteModel({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <>
      <ambientLight intensity={1.3} />
      <hemisphereLight args={["#ffffff", "#60706e", 1.5]} />
      <directionalLight
        castShadow
        intensity={2.1}
        position={[14, 24, 18]}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <mesh receiveShadow position={[0, -0.64, 0]}>
        <boxGeometry args={[40, 0.8, 32]} />
        <meshStandardMaterial color="#c6ceca" roughness={1} />
      </mesh>
      <SiteBoundary />
      <PodiumAndParking selected={selected} />
      <InternalRoad />
      <LandscapeZone />
      {towerLayout.map((tower) => (
        <ApartmentTower {...tower} dimmed={selected} key={tower.name} />
      ))}
      <RampEntrance onSelect={onSelect} selected={selected} />
      <SimplifiedCrane position={[-6, 0, -8]} />
      <SimplifiedCrane position={[9, 0, -5]} />
      <SceneControls selected={selected} />
    </>
  );
}

export function ProjectBimScene({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Canvas
      camera={{ fov: 34, far: 120, near: 0.1, position: [27, 24, 31] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => undefined}
      shadows
    >
      <color args={["#e7edeb"]} attach="background" />
      <fog args={["#e7edeb", 45, 88]} attach="fog" />
      <SiteModel onSelect={onSelect} selected={selected} />
    </Canvas>
  );
}
