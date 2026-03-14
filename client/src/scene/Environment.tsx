import { useMemo } from "react";
import * as THREE from "three";
import type { EnvironmentModel, StyleProfile } from "@next-state/shared";

interface EnvironmentProps {
  environment: EnvironmentModel;
  style: StyleProfile;
}

export function Environment({ environment, style }: EnvironmentProps) {
  const { bounds } = environment;
  const palette = style.environmentPalette;

  const wallColor = palette.wallPrimary ?? "#d4c5b0";
  const floorColor = palette.floor ?? "#6b5a4e";

  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8, side: THREE.DoubleSide }),
    [wallColor],
  );
  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 }),
    [floorColor],
  );

  const wallThickness = 0.15;

  return (
    <group>
      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[bounds.width / 2, 0, bounds.depth / 2]} receiveShadow>
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>

      {/* Back wall (z=depth) */}
      <mesh position={[bounds.width / 2, bounds.height / 2, bounds.depth]} material={wallMaterial}>
        <boxGeometry args={[bounds.width, bounds.height, wallThickness]} />
      </mesh>

      {/* Left wall (x=0) */}
      <mesh position={[0, bounds.height / 2, bounds.depth / 2]} material={wallMaterial}>
        <boxGeometry args={[wallThickness, bounds.height, bounds.depth]} />
      </mesh>

      {/* Right wall (x=width) */}
      <mesh position={[bounds.width, bounds.height / 2, bounds.depth / 2]} material={wallMaterial}>
        <boxGeometry args={[wallThickness, bounds.height, bounds.depth]} />
      </mesh>

      {/* Front wall sections (z=0) with door gap */}
      <mesh position={[1.5, bounds.height / 2, 0]} material={wallMaterial}>
        <boxGeometry args={[3, bounds.height, wallThickness]} />
      </mesh>
      <mesh position={[bounds.width - 1.5, bounds.height / 2, 0]} material={wallMaterial}>
        <boxGeometry args={[3, bounds.height, wallThickness]} />
      </mesh>
      {/* Door lintel */}
      <mesh position={[bounds.width / 2, bounds.height - 0.3, 0]} material={wallMaterial}>
        <boxGeometry args={[2, 0.6, wallThickness]} />
      </mesh>

      {/* Furniture */}
      {environment.objects.map((obj) => (
        <FurnitureObject key={obj.id} obj={obj} />
      ))}
    </group>
  );
}

function FurnitureObject({ obj }: { obj: EnvironmentModel["objects"][number] }) {
  const color = obj.styleHints?.primaryColor ?? "#888888";

  if (obj.type === "coffee_machine") {
    return (
      <mesh position={[obj.position.x, obj.position.y + obj.scale.y / 2, obj.position.z]} castShadow>
        <boxGeometry args={[obj.scale.x, obj.scale.y, obj.scale.z]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
    );
  }

  // Tables and counters: flat box
  if (obj.type === "table" || obj.type === "counter" || obj.type === "desk") {
    return (
      <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
        {/* Tabletop */}
        <mesh position={[0, obj.scale.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[obj.scale.x, 0.05, obj.scale.z]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        {/* Legs */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
          <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.05), obj.scale.y / 2, dz * (obj.scale.z / 2 - 0.05)]}>
            <boxGeometry args={[0.05, obj.scale.y, 0.05]} />
            <meshStandardMaterial color="#555555" />
          </mesh>
        ))}
      </group>
    );
  }

  // Chairs: small box with back
  if (obj.type === "chair") {
    return (
      <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
        {/* Seat */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[obj.scale.x, 0.04, obj.scale.z]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Back */}
        <mesh position={[0, 0.7, -obj.scale.z / 2 + 0.02]}>
          <boxGeometry args={[obj.scale.x, 0.5, 0.04]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Legs */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
          <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.03), 0.22, dz * (obj.scale.z / 2 - 0.03)]}>
            <boxGeometry args={[0.03, 0.44, 0.03]} />
            <meshStandardMaterial color="#444444" />
          </mesh>
        ))}
      </group>
    );
  }

  // Default: box
  return (
    <mesh position={[obj.position.x, obj.scale.y / 2, obj.position.z]} rotation-y={obj.rotationY} castShadow>
      <boxGeometry args={[obj.scale.x, obj.scale.y, obj.scale.z]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
