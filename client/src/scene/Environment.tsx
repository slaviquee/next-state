import { useMemo } from "react";
import * as THREE from "three";
import { ContactShadows } from "@react-three/drei";
import type { EnvironmentModel, StyleProfile } from "@next-state/shared";
import { getObjectColor, getFloorMaterialWithTexture } from "./StyleApplicator";
import { FurnitureGeometrySwitch } from "./FurnitureGeometry";

interface EnvironmentProps {
  environment: EnvironmentModel;
  style: StyleProfile;
}

export function Environment({ environment, style }: EnvironmentProps) {
  const { bounds } = environment;
  const palette = style.environmentPalette;

  const wallColor = palette.wallPrimary ?? "#d4c5b0";
  const accentColor = palette.accent ?? "#887766";

  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8, side: THREE.DoubleSide }),
    [wallColor],
  );
  const floorMaterial = useMemo(
    () => getFloorMaterialWithTexture(style, bounds.width, bounds.depth),
    [style, bounds.width, bounds.depth],
  );

  const wallThickness = 0.15;

  return (
    <group>
      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[bounds.width / 2, 0, bounds.depth / 2]} receiveShadow>
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>

      {/* Ceiling (invisible — keeps lighting bounces but not visible) */}
      <mesh rotation-x={Math.PI / 2} position={[bounds.width / 2, bounds.height, bounds.depth / 2]}>
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0} side={THREE.DoubleSide} />
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

      {/* Baseboard trim on each wall */}
      <Baseboard color={accentColor} width={bounds.width} depth={bounds.depth} />

      {/* Contact shadows for ambient occlusion */}
      <ContactShadows
        position={[bounds.width / 2, 0.001, bounds.depth / 2]}
        width={bounds.width}
        height={bounds.depth}
        opacity={0.4}
        blur={2}
        far={1.5}
      />

      {/* Furniture */}
      {environment.objects.map((obj) => {
        const color = getObjectColor(obj.id, obj.styleHints?.primaryColor ?? "#888888", style);
        return <FurnitureGeometrySwitch key={obj.id} obj={obj} color={color} />;
      })}
    </group>
  );
}

function Baseboard({ color, width, depth }: { color: string; width: number; depth: number }) {
  const h = 0.1;
  const t = 0.02;
  return (
    <>
      {/* Back wall baseboard */}
      <mesh position={[width / 2, h / 2, depth - 0.08]}>
        <boxGeometry args={[width, h, t]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Left wall baseboard */}
      <mesh position={[0.08, h / 2, depth / 2]}>
        <boxGeometry args={[t, h, depth]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Right wall baseboard */}
      <mesh position={[width - 0.08, h / 2, depth / 2]}>
        <boxGeometry args={[t, h, depth]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </>
  );
}
