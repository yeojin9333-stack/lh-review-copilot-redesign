"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Group,
  Material,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type BimVariant = "current" | "alt1" | "alt2" | "alt3";
export type RampPathPoint = { x: number; y: number; z: number };
type ViewMode = "overview" | "selection" | "upper" | "lower" | "side";
type ThreeModule = typeof import("three");

const variants: Array<{ id: BimVariant; label: string }> = [
  { id: "current", label: "현재안" },
  { id: "alt1", label: "대안 1" },
  { id: "alt2", label: "대안 2" },
  { id: "alt3", label: "대안 3" },
];

const views: Array<{ id: ViewMode; label: string }> = [
  { id: "overview", label: "전체 보기" },
  { id: "selection", label: "선택 구간 보기" },
  { id: "upper", label: "램프 상부" },
  { id: "lower", label: "램프 하부" },
  { id: "side", label: "측면 보기" },
];

const palette = {
  concrete: 0x9ca3a3,
  concreteDark: 0x697373,
  floor: 0x737c7b,
  charcoal: 0x151b1d,
  white: 0xf2f5f3,
  yellow: 0xf5c542,
  teal: 0x00a99d,
  tealSoft: 0x6fe0d7,
  orange: 0xef9b34,
  red: 0xd44f4f,
  blue: 0x4db6d3,
  sky: 0xe7edeb,
};

const rampPath: RampPathPoint[] = [
  { x: -0.9, y: 3.82, z: -6.05 },
  { x: -2.6, y: 3.82, z: -6.04 },
  { x: -4.5, y: 3.68, z: -5.95 },
  { x: -6.4, y: 3.28, z: -5.45 },
  { x: -8.1, y: 2.75, z: -4.35 },
  { x: -9.4, y: 2.15, z: -2.65 },
  { x: -10.2, y: 1.48, z: -0.35 },
  { x: -10.15, y: 0.82, z: 2.2 },
  { x: -9.25, y: 0.34, z: 4.65 },
  { x: -7.45, y: 0.24, z: 5.65 },
  { x: -5.4, y: 0.24, z: 5.52 },
  { x: -3.95, y: 0.24, z: 4.35 },
];

const variantAnnotations: Record<
  BimVariant,
  Array<{
    tone: "base" | "ghost" | "changed" | "negative" | "warning" | "flow" | "drainage";
    label: string;
  }>
> = {
  current: [
    { tone: "base", label: "기존 벽체" },
    { tone: "base", label: "기존 트렌치" },
    { tone: "flow", label: "기존 차량 동선" },
  ],
  alt1: [
    { tone: "ghost", label: "기존 벽체 Ghost" },
    { tone: "changed", label: "후퇴 벽체·높이 축소" },
    { tone: "flow", label: "변경 차량 동선" },
    { tone: "negative", label: "P-01 운영 제외" },
  ],
  alt2: [
    { tone: "ghost", label: "기존 트렌치 Ghost" },
    { tone: "changed", label: "이동 트렌치" },
    { tone: "flow", label: "집수정 연결" },
    { tone: "drainage", label: "우수 흐름" },
  ],
  alt3: [
    { tone: "base", label: "형상 변경 없음" },
    { tone: "warning", label: "곡선부 반사경" },
    { tone: "changed", label: "차량 검지코일" },
    { tone: "warning", label: "경고등·정지선" },
  ],
};

function createRampCurve(THREE: ThreeModule) {
  return new THREE.CatmullRomCurve3(
    rampPath.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    false,
    "centripetal",
    0.38,
  );
}

function sideVector(
  THREE: ThreeModule,
  points: Vector3[],
  index: number,
  distance: number,
) {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = next.clone().sub(previous).setY(0).normalize();
  return new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(distance);
}

function solidRibbonGeometry(
  THREE: ThreeModule,
  points: Vector3[],
  width: number,
  thickness: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];

  points.forEach((point, index) => {
    const side = sideVector(THREE, points, index, width / 2);
    const left = point.clone().add(side);
    const right = point.clone().sub(side);
    positions.push(
      left.x,
      left.y,
      left.z,
      right.x,
      right.y,
      right.z,
      left.x,
      left.y - thickness,
      left.z,
      right.x,
      right.y - thickness,
      right.z,
    );
    if (index < points.length - 1) {
      const start = index * 4;
      const nextStart = start + 4;
      indices.push(
        start,
        start + 1,
        nextStart,
        start + 1,
        nextStart + 1,
        nextStart,
        start + 2,
        nextStart + 2,
        start + 3,
        start + 3,
        nextStart + 2,
        nextStart + 3,
        start,
        nextStart,
        start + 2,
        start + 2,
        nextStart,
        nextStart + 2,
        start + 1,
        start + 3,
        nextStart + 1,
        start + 3,
        nextStart + 3,
        nextStart + 1,
      );
    }
  });

  const last = (points.length - 1) * 4;
  indices.push(0, 2, 1, 1, 2, 3, last, last + 1, last + 2, last + 1, last + 3, last + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function surfaceRibbonGeometry(
  THREE: ThreeModule,
  points: Vector3[],
  width: number,
  elevation = 0.05,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  points.forEach((point, index) => {
    const side = sideVector(THREE, points, index, width / 2);
    positions.push(
      point.x + side.x,
      point.y + elevation,
      point.z + side.z,
      point.x - side.x,
      point.y + elevation,
      point.z - side.z,
    );
    if (index < points.length - 1) {
      const start = index * 2;
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function edgePoints(THREE: ThreeModule, points: Vector3[], distance: number) {
  return points.map((point, index) =>
    point.clone().add(sideVector(THREE, points, index, distance)),
  );
}

function wallGeometry(
  THREE: ThreeModule,
  points: Vector3[],
  height: number,
  bottomDrop = 0.16,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  points.forEach((point, index) => {
    positions.push(
      point.x,
      point.y - bottomDrop,
      point.z,
      point.x,
      point.y + height,
      point.z,
    );
    if (index < points.length - 1) {
      const start = index * 2;
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addBox(
  THREE: ThreeModule,
  group: Group,
  size: [number, number, number],
  position: [number, number, number],
  material: Material,
  rotationY = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  group.add(mesh);
  return mesh;
}

function addArrow(
  THREE: ThreeModule,
  group: Group,
  from: Vector3,
  to: Vector3,
  color: number,
) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 0.01) return;
  group.add(
    new THREE.ArrowHelper(
      direction.normalize(),
      from,
      length,
      color,
      Math.min(0.42, length * 0.3),
      0.22,
    ),
  );
}

function buildGarage(THREE: ThreeModule, scene: Scene, variant: BimVariant) {
  const group = new THREE.Group();
  scene.add(group);

  const concrete = new THREE.MeshStandardMaterial({
    color: palette.concrete,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const concreteDark = new THREE.MeshStandardMaterial({
    color: palette.concreteDark,
    roughness: 0.95,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: palette.floor,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const white = new THREE.MeshStandardMaterial({ color: palette.white, roughness: 0.75 });
  const yellow = new THREE.MeshStandardMaterial({
    color: palette.yellow,
    emissive: 0x3b2b00,
    roughness: 0.65,
  });
  const charcoal = new THREE.MeshStandardMaterial({
    color: palette.charcoal,
    roughness: 0.8,
  });
  const teal = new THREE.MeshStandardMaterial({
    color: palette.teal,
    emissive: 0x003f3a,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: palette.blue,
    emissive: 0x123a43,
    roughness: 0.55,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: palette.orange,
    emissive: 0x4c2600,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  const red = new THREE.MeshStandardMaterial({
    color: palette.red,
    emissive: 0x460808,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  const tealTransparent = new THREE.MeshStandardMaterial({
    color: palette.tealSoft,
    depthWrite: false,
    opacity: 0.34,
    roughness: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const redTransparent = new THREE.MeshStandardMaterial({
    color: palette.red,
    depthWrite: false,
    emissive: 0x3b0606,
    opacity: 0.28,
    roughness: 0.68,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const ghost = new THREE.MeshStandardMaterial({
    color: palette.concrete,
    depthWrite: false,
    opacity: 0.2,
    roughness: 1,
    side: THREE.DoubleSide,
    transparent: true,
  });

  addBox(THREE, group, [17, 0.4, 13], [4.2, 0, 0], floorMaterial);
  addBox(THREE, group, [17, 1.2, 0.35], [4.2, 0.6, -6.35], concrete);
  addBox(THREE, group, [0.35, 1.2, 13], [12.55, 0.6, 0], concrete);
  addBox(THREE, group, [9.8, 0.45, 2.8], [3.8, 5.18, -4.9], concrete);
  addBox(THREE, group, [0.5, 4.8, 0.6], [-4.1, 2.4, -5.3], concreteDark);

  [-2.2, 2.1, 6.4, 10.5].forEach((x) => {
    [-3.8, 3.6].forEach((z) => {
      addBox(THREE, group, [0.72, 4.2, 0.72], [x, 2.1, z], concrete);
      addBox(THREE, group, [0.82, 0.22, 0.82], [x, 0.22, z], concreteDark);
    });
  });

  [-4.8, 1.0].forEach((z) => {
    for (let x = -2.8; x <= 10.8; x += 2.25) {
      addBox(THREE, group, [0.08, 0.035, 2.05], [x, 0.24, z], white);
    }
  });
  addBox(THREE, group, [0.09, 0.04, 11.2], [0.1, 0.24, 0], white);
  addBox(THREE, group, [0.09, 0.04, 11.2], [8.8, 0.24, 0], white);

  [-0.4, 4.8, 9.8].forEach((x) => {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 3), white);
    arrow.position.set(x, 0.3, 0.45);
    arrow.rotation.z = Math.PI / 2;
    arrow.rotation.y = Math.PI / 2;
    group.add(arrow);
  });

  const curve = createRampCurve(THREE);
  const rampPoints = curve.getPoints(82);
  const road = new THREE.Mesh(
    solidRibbonGeometry(THREE, rampPoints, 4.15, 0.28),
    floorMaterial,
  );
  group.add(road);

  const innerEdge = edgePoints(THREE, rampPoints, -2.13);
  const outerEdge = edgePoints(THREE, rampPoints, 2.13);
  group.add(
    new THREE.Mesh(
      wallGeometry(THREE, innerEdge, 1.55),
      variant === "alt1" ? redTransparent : concrete,
    ),
  );
  group.add(new THREE.Mesh(wallGeometry(THREE, outerEdge, 1.55), concrete));

  const centerline = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 96, 0.075, 7, false),
    yellow,
  );
  centerline.position.y += 0.085;
  group.add(centerline);

  [0.12, 0.36, 0.6, 0.84].forEach((time) => {
    const point = curve.getPoint(time).add(new THREE.Vector3(0, 0.16, 0));
    const tangent = curve.getTangent(time).normalize();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.58, 5), yellow);
    arrow.position.copy(point);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    group.add(arrow);
  });

  const lowerConnector = new THREE.CatmullRomCurve3(
    [
      rampPoints.at(-1)?.clone() ?? new THREE.Vector3(-3.95, 0.24, 4.35),
      new THREE.Vector3(-1.7, 0.24, 3.35),
      new THREE.Vector3(1.0, 0.24, 1.2),
      new THREE.Vector3(5.7, 0.24, -0.3),
    ],
    false,
    "centripetal",
    0.35,
  );
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(lowerConnector, 44, 0.055, 6, false),
      white,
    ),
  );

  const existingDrainMaterial = variant === "alt2" ? redTransparent : charcoal;
  addBox(
    THREE,
    group,
    [4.8, 0.18, 0.5],
    [-8.4, 0.16, 5.72],
    existingDrainMaterial,
    -0.12,
  );
  for (let x = -10.3; x <= -6.4; x += 0.38) {
    addBox(
      THREE,
      group,
      [0.12, 0.22, 0.62],
      [x, 0.27, 5.72],
      variant === "alt2" ? redTransparent : concreteDark,
      -0.12,
    );
  }
  const sump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.18, 10),
    variant === "alt2" ? redTransparent : charcoal,
  );
  sump.position.set(-5.55, 0.16, 5.3);
  group.add(sump);

  addBox(THREE, group, [0.28, 1.45, 0.28], [-7.4, 0.93, 4.55], concreteDark);
  addBox(THREE, group, [0.28, 1.45, 0.28], [-5.7, 0.93, 4.55], concreteDark);
  addBox(THREE, group, [1.5, 0.12, 0.15], [-6.45, 1.45, 4.55], yellow);
  addBox(THREE, group, [1.4, 0.025, 1.4], [-6.5, 0.23, 3.75], yellow);
  addBox(THREE, group, [1.1, 0.035, 1.1], [-6.5, 0.25, 3.75], floorMaterial);

  [-8.2, -7.5, -6.8].forEach((x, index) => {
    const bollard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.72, 8),
      index % 2 === 0 ? yellow : charcoal,
    );
    bollard.position.set(x, 0.55, 5.15);
    group.add(bollard);
  });

  const selectedPoints = rampPoints.slice(18, 64);
  group.add(
    new THREE.Mesh(
      surfaceRibbonGeometry(THREE, selectedPoints, 4.12, 0.05),
      variant === "current" ? tealTransparent : ghost,
    ),
  );

  if (variant === "alt1") {
    const originalWall = innerEdge.slice(20, 62);
    const movedWall = originalWall.map((point, index) =>
      point.clone().add(sideVector(THREE, originalWall, index, -0.62)),
    );
    group.add(new THREE.Mesh(wallGeometry(THREE, originalWall, 1.57), redTransparent));
    group.add(new THREE.Mesh(wallGeometry(THREE, movedWall, 0.86), teal));

    [7, 20, 33].forEach((index) => {
      addArrow(
        THREE,
        group,
        originalWall[index].clone().add(new THREE.Vector3(0, 0.9, 0)),
        movedWall[index].clone().add(new THREE.Vector3(0, 0.9, 0)),
        palette.teal,
      );
    });

    const changedTrajectoryPoints = rampPoints.map((point, index) =>
      point.clone().add(sideVector(THREE, rampPoints, index, -0.28)),
    );
    const changedTrajectory = new THREE.CatmullRomCurve3(
      changedTrajectoryPoints,
      false,
      "centripetal",
      0.35,
    );
    const trajectory = new THREE.Mesh(
      new THREE.TubeGeometry(changedTrajectory, 92, 0.08, 6, false),
      teal,
    );
    trajectory.position.y += 0.12;
    group.add(trajectory);

    addBox(THREE, group, [2.2, 0.08, 2.05], [-2.7, 0.31, 1.0], redTransparent);
    for (let offset = -0.9; offset <= 0.9; offset += 0.38) {
      addBox(
        THREE,
        group,
        [0.09, 0.06, 2.15],
        [-2.7 + offset, 0.36, 1.0],
        red,
        -0.55,
      );
    }
  }

  if (variant === "alt2") {
    addBox(
      THREE,
      group,
      [4.8, 0.2, 0.55],
      [-8.4, 0.19, 5.72],
      redTransparent,
      -0.12,
    );
    addBox(THREE, group, [5.0, 0.22, 0.55], [-7.75, 0.21, 4.62], teal, -0.2);
    const movedSump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.24, 10),
      teal,
    );
    movedSump.position.set(-4.9, 0.2, 4.0);
    group.add(movedSump);

    const drainage = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-9.3, 0.38, 4.9),
      new THREE.Vector3(-7.7, 0.35, 4.6),
      new THREE.Vector3(-6.1, 0.32, 4.35),
      new THREE.Vector3(-4.9, 0.34, 4.0),
    ]);
    for (let time = 0; time <= 1; time += 0.08) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), blue);
      marker.position.copy(drainage.getPoint(time));
      group.add(marker);
    }
    [0.35, 0.72].forEach((time) => {
      const start = drainage.getPoint(time);
      const end = start.clone().add(drainage.getTangent(time).normalize().multiplyScalar(0.8));
      addArrow(THREE, group, start, end, palette.blue);
    });
  }

  if (variant === "alt3") {
    // 곡선부 반사경: 지주와 원형 반사판을 실제 식별 가능한 크기로 표시합니다.
    addBox(THREE, group, [0.12, 1.35, 0.12], [-9.25, 1.02, 2.8], charcoal);
    const mirror = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.12, 24),
      orange,
    );
    mirror.position.set(-9.18, 1.62, 2.72);
    mirror.rotation.z = Math.PI / 2;
    mirror.rotation.y = -0.35;
    group.add(mirror);
    const mirrorFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.37, 24),
      new THREE.MeshStandardMaterial({
        color: 0xdde8ee,
        emissive: 0x263238,
        metalness: 0.55,
        roughness: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    mirrorFace.position.set(-9.11, 1.62, 2.72);
    mirrorFace.rotation.y = Math.PI / 2 - 0.35;
    group.add(mirrorFace);

    // 차량 검지코일: 바닥 위 이중 사각 루프로 표현합니다.
    [-6.7, -6.15].forEach((x) => {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 8, 28), teal);
      coil.position.set(x, 0.31, 3.72);
      coil.rotation.x = Math.PI / 2;
      coil.scale.set(1.4, 0.72, 1);
      group.add(coil);
    });

    // 진입 경고등과 정지선.
    addBox(THREE, group, [0.16, 1.6, 0.16], [-5.35, 1.03, 4.55], charcoal);
    const warningLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 10),
      new THREE.MeshStandardMaterial({
        color: palette.orange,
        emissive: palette.orange,
        emissiveIntensity: 1.25,
        roughness: 0.4,
      }),
    );
    warningLight.position.set(-5.35, 1.82, 4.55);
    group.add(warningLight);
    addBox(THREE, group, [3.2, 0.07, 0.24], [-6.65, 0.32, 3.12], orange, -0.08);
  }

  group.userData.variant = variant;
  return group;
}

const cameraViews: Record<ViewMode, { position: RampPathPoint; target: RampPathPoint }> = {
  overview: {
    position: { x: 20, y: 15.5, z: 22 },
    target: { x: 0, y: 1.2, z: -0.2 },
  },
  selection: {
    position: { x: 6.5, y: 10.6, z: 15.5 },
    target: { x: -7.7, y: 1.65, z: 0.3 },
  },
  upper: {
    position: { x: 5, y: 9.5, z: -14 },
    target: { x: -4.2, y: 3.5, z: -5.4 },
  },
  lower: {
    position: { x: -2, y: 8.5, z: 15.5 },
    target: { x: -6.6, y: 0.45, z: 4.4 },
  },
  side: {
    position: { x: -23, y: 6.8, z: 4 },
    target: { x: -5.6, y: 1.75, z: 0 },
  },
};

const variantFocusView: Record<BimVariant, ViewMode> = {
  current: "overview",
  alt1: "selection",
  alt2: "lower",
  alt3: "selection",
};

type BimRuntime = {
  THREE: ThreeModule;
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  model: Group;
  observer: ResizeObserver;
  animationFrame: number;
};

function disposeGroup(group: Group) {
  group.traverse((object) => {
    if ("geometry" in object && object.geometry) {
      (object.geometry as { dispose?: () => void }).dispose?.();
    }
    if ("material" in object && object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) =>
        (material as { dispose?: () => void }).dispose?.(),
      );
    }
  });
}

export function BimViewer({
  compact = false,
  selectedVariant,
  onVariantChange,
}: {
  compact?: boolean;
  selectedVariant?: BimVariant;
  onVariantChange?: (variant: BimVariant) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [internalVariant, setInternalVariant] = useState<BimVariant>("current");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const variant = selectedVariant ?? internalVariant;
  const variantRef = useRef<BimVariant>(variant);
  const runtimeRef = useRef<BimRuntime | null>(null);
  const focusFrameRef = useRef(0);
  const visitedVariantsRef = useRef(new Set<BimVariant>([variant]));

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  const focusCamera = useCallback((nextView: ViewMode, duration = 420) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    window.cancelAnimationFrame(focusFrameRef.current);
    const preset = cameraViews[nextView];
    const startPosition = runtime.camera.position.clone();
    const startTarget = runtime.controls.target.clone();
    const endPosition = new runtime.THREE.Vector3(
      preset.position.x,
      preset.position.y,
      preset.position.z,
    );
    const endTarget = new runtime.THREE.Vector3(
      preset.target.x,
      preset.target.y,
      preset.target.z,
    );
    const startedAt = performance.now();
    const animate = (now: number) => {
      const rawProgress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - rawProgress, 3);
      runtime.camera.position.lerpVectors(startPosition, endPosition, eased);
      runtime.controls.target.lerpVectors(startTarget, endTarget, eased);
      runtime.controls.update();
      if (rawProgress < 1) {
        focusFrameRef.current = window.requestAnimationFrame(animate);
      }
    };
    focusFrameRef.current = window.requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [THREE, controlsModule] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      if (disposed) return;

      const { OrbitControls } = controlsModule;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(palette.sky);
      scene.fog = new THREE.Fog(palette.sky, 34, 62);

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      const savedView = window.sessionStorage.getItem("lh-ramp-bim-view");
      const initialView = views.some((view) => view.id === savedView)
        ? (savedView as ViewMode)
        : variantFocusView[variantRef.current];
      setViewMode(initialView);
      const currentView = cameraViews[initialView];
      const target = new THREE.Vector3(
        currentView.target.x,
        currentView.target.y,
        currentView.target.z,
      );
      camera.position.set(
        currentView.position.x,
        currentView.position.y,
        currentView.position.z,
      );

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.replaceChildren(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 8;
      controls.maxDistance = 52;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.update();

      scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6668, 2.45));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
      keyLight.position.set(10, 18, 13);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9edbd3, 1.15);
      fillLight.position.set(-16, 8, 4);
      scene.add(fillLight);

      const model = buildGarage(THREE, scene, variantRef.current);

      let animationFrame = 0;
      const resize = () => {
        const width = Math.max(mount.clientWidth, 1);
        const height = Math.max(mount.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();

      const render = () => {
        controls.update();
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };
      render();

      runtimeRef.current = {
        THREE,
        scene,
        camera,
        renderer,
        controls,
        model,
        observer,
        animationFrame,
      };

      cleanup = () => {
        window.cancelAnimationFrame(animationFrame);
        window.cancelAnimationFrame(focusFrameRef.current);
        observer.disconnect();
        controls.dispose();
        disposeGroup(model);
        renderer.dispose();
        renderer.domElement.remove();
        runtimeRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.model.userData.variant === variant) return;
    runtime.scene.remove(runtime.model);
    disposeGroup(runtime.model);
    runtime.model = buildGarage(runtime.THREE, runtime.scene, variant);
    runtime.model.userData.variant = variant;

    if (!visitedVariantsRef.current.has(variant)) {
      visitedVariantsRef.current.add(variant);
      const nextView = variantFocusView[variant];
      setViewMode(nextView);
      window.sessionStorage.setItem("lh-ramp-bim-view", nextView);
      focusCamera(nextView);
    }
  }, [focusCamera, variant]);

  const selectVariant = (next: BimVariant) => {
    setInternalVariant(next);
    window.sessionStorage.setItem("lh-review-bim-variant", next);
    onVariantChange?.(next);
  };

  const selectView = (next: ViewMode) => {
    setViewMode(next);
    window.sessionStorage.setItem("lh-ramp-bim-view", next);
    focusCamera(next);
  };

  return (
    <section className={`interactive-bim ${compact ? "compact" : ""}`}>
      <div className="bim-control-row">
        <div aria-label="상세 BIM 시점">
          {views.map((view) => (
            <button
              aria-pressed={viewMode === view.id}
              className={viewMode === view.id ? "active" : ""}
              key={view.id}
              onClick={() => selectView(view.id)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
        <span>드래그 회전 · 스크롤 확대 · 우클릭 이동</span>
      </div>
      <div
        aria-label={`B1 곡선형 램프 ${variants.find((item) => item.id === variant)?.label} 인터랙티브 3D BIM`}
        className="bim-webgl-stage"
        ref={mountRef}
        role="img"
      />
      <div className="bim-variant-row" aria-label="BIM 형상 대안">
        {variants.map((item) => (
          <button
            aria-pressed={variant === item.id}
            className={variant === item.id ? "active" : ""}
            key={item.id}
            onClick={() => selectVariant(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="bim-overlay-label">
        <span>{variants.find((item) => item.id === variant)?.label}</span>
        <strong>
          {variant === "current"
            ? "기존 곡선형 램프"
            : variant === "alt1"
              ? "내측 벽체 후퇴"
              : variant === "alt2"
                ? "배수시설 저점부 이동"
                : "인지·검지설비 보완"}
        </strong>
        <small>
          {variant === "current"
            ? "높은 내측 벽체와 기존 트렌치 유지"
            : variant === "alt1"
              ? "곡선부 시야와 회전공간 확보 후보"
              : variant === "alt2"
                ? "트렌치·집수정·우수 흐름 연결"
                : "반사경·검지코일·경고등 추가"}
        </small>
      </div>
      <div className="bim-object-labels" aria-label="대안 BIM 객체 범례">
        {variantAnnotations[variant].map((item) => (
          <span className={item.tone} key={item.label}>
            <i /> {item.label}
          </span>
        ))}
      </div>
      <div className="bim-legend">
        <span>
          <i className="ghost" /> 기존 형상 Ghost
        </span>
        <span>
          <i className="changed" /> 변경 형상
        </span>
        <span>
          <i className="path" /> 차량 동선
        </span>
        <span>
          <i className="drainage" /> 배수 흐름
        </span>
        <span>
          <i className="warning" /> 확인 필요
        </span>
      </div>
    </section>
  );
}
