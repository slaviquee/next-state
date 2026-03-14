import { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import type { EnvironmentModel } from "@next-state/shared";
import { getObjectMaterialProps, getMaterialProps } from "./StyleApplicator";

type SceneObject = EnvironmentModel["objects"][number];

interface FurnitureProps {
  obj: SceneObject;
  color: string;
}

function useMaterialConfig(obj: SceneObject) {
  return useMemo(() => {
    const matHint = obj.styleHints?.material;
    if (matHint && matHint !== "unknown") {
      return getMaterialProps(matHint);
    }
    return getObjectMaterialProps(obj.type);
  }, [obj.type, obj.styleHints?.material]);
}

function TableGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      <RoundedBox
        args={[obj.scale.x, 0.05, obj.scale.z]}
        radius={0.01}
        position={[0, obj.scale.y, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.05), obj.scale.y / 2, dz * (obj.scale.z / 2 - 0.05)]}>
          <cylinderGeometry args={[0.025, 0.03, obj.scale.y, 6]} />
          <meshStandardMaterial color="#555555" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function ChairGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      <RoundedBox
        args={[obj.scale.x, 0.04, obj.scale.z]}
        radius={0.008}
        position={[0, 0.45, 0]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      <RoundedBox
        args={[obj.scale.x, 0.45, 0.04]}
        radius={0.008}
        position={[0, 0.7, -obj.scale.z / 2 + 0.02]}
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.03), 0.22, dz * (obj.scale.z / 2 - 0.03)]}>
          <cylinderGeometry args={[0.015, 0.02, 0.44, 6]} />
          <meshStandardMaterial color="#444444" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function SofaGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  const armW = 0.12;
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Seat cushion */}
      <RoundedBox
        args={[obj.scale.x - armW * 2, 0.2, obj.scale.z - 0.1]}
        radius={0.04}
        position={[0, 0.3, 0.05]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {/* Back cushion */}
      <RoundedBox
        args={[obj.scale.x - armW * 2, 0.35, 0.12]}
        radius={0.04}
        position={[0, 0.55, -obj.scale.z / 2 + 0.06]}
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {/* Left armrest */}
      <RoundedBox
        args={[armW, 0.25, obj.scale.z]}
        radius={0.03}
        position={[-obj.scale.x / 2 + armW / 2, 0.42, 0]}
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {/* Right armrest */}
      <RoundedBox
        args={[armW, 0.25, obj.scale.z]}
        radius={0.03}
        position={[obj.scale.x / 2 - armW / 2, 0.42, 0]}
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
    </group>
  );
}

function DeskGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      <RoundedBox
        args={[obj.scale.x, 0.06, obj.scale.z]}
        radius={0.01}
        position={[0, obj.scale.y, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {/* Back panel */}
      <mesh position={[0, obj.scale.y / 2, -obj.scale.z / 2 + 0.01]}>
        <boxGeometry args={[obj.scale.x - 0.02, obj.scale.y - 0.04, 0.02]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Legs */}
      {[[-1, 1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.04), obj.scale.y / 2, dz * (obj.scale.z / 2 - 0.04)]}>
          <boxGeometry args={[0.04, obj.scale.y, 0.04]} />
          <meshStandardMaterial color="#555555" roughness={0.5} />
        </mesh>
      ))}
      {/* Drawer */}
      <mesh position={[0.15, obj.scale.y * 0.6, 0]}>
        <boxGeometry args={[obj.scale.x * 0.4, 0.12, obj.scale.z - 0.06]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
    </group>
  );
}

function CounterGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Top with overhang */}
      <RoundedBox
        args={[obj.scale.x + 0.08, 0.05, obj.scale.z + 0.05]}
        radius={0.01}
        position={[0, obj.scale.y, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </RoundedBox>
      {/* Solid front panel */}
      <mesh position={[0, obj.scale.y / 2, obj.scale.z / 2 - 0.02]}>
        <boxGeometry args={[obj.scale.x, obj.scale.y, 0.04]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Side panels */}
      {[-1, 1].map((dx, i) => (
        <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.02), obj.scale.y / 2, 0]}>
          <boxGeometry args={[0.04, obj.scale.y, obj.scale.z]} />
          <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
        </mesh>
      ))}
    </group>
  );
}

function LaptopGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Base */}
      <mesh position={[0, 0.01, 0]} castShadow>
        <boxGeometry args={[obj.scale.x, 0.02, obj.scale.z]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Screen angled at 110° */}
      <mesh
        position={[0, obj.scale.z * 0.45, -obj.scale.z / 2 + 0.01]}
        rotation-x={-0.35}
        castShadow
      >
        <boxGeometry args={[obj.scale.x - 0.02, obj.scale.z * 0.85, 0.01]} />
        <meshStandardMaterial
          color="#111122"
          roughness={0.05}
          metalness={0.3}
          emissive="#2244aa"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

function ScreenGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Panel */}
      <mesh castShadow>
        <boxGeometry args={[obj.scale.x, obj.scale.y, 0.03]} />
        <meshStandardMaterial
          color="#111111"
          roughness={0.05}
          metalness={0.3}
          emissive="#2244aa"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Bezel frame */}
      <mesh position={[0, 0, 0.016]}>
        <boxGeometry args={[obj.scale.x + 0.02, obj.scale.y + 0.02, 0.005]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Stand */}
      <mesh position={[0, -obj.scale.y / 2 - 0.1, 0.05]}>
        <cylinderGeometry args={[0.03, 0.06, 0.2, 8]} />
        <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

function PlantGeometry({ obj, color }: FurnitureProps) {
  const potColor = obj.styleHints?.secondaryColor ?? "#8B4513";
  const foliageColor = color === "#888888" ? "#2d6b2d" : color;
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Pot (tapered cylinder) */}
      <mesh position={[0, obj.scale.y * 0.2, 0]} castShadow>
        <cylinderGeometry args={[obj.scale.x * 0.35, obj.scale.x * 0.25, obj.scale.y * 0.4, 8]} />
        <meshStandardMaterial color={potColor} roughness={0.7} />
      </mesh>
      {/* Foliage spheres */}
      {[
        [0, obj.scale.y * 0.65, 0],
        [-0.08, obj.scale.y * 0.55, 0.06],
        [0.07, obj.scale.y * 0.58, -0.05],
        [0, obj.scale.y * 0.72, 0.04],
        [-0.05, obj.scale.y * 0.5, -0.07],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <sphereGeometry args={[obj.scale.x * 0.28, 8, 6]} />
          <meshStandardMaterial color={foliageColor} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeMachineGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Main body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[obj.scale.x, obj.scale.y * 0.7, obj.scale.z]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Top part */}
      <mesh position={[0, obj.scale.y * 0.45, 0]}>
        <boxGeometry args={[obj.scale.x * 0.8, obj.scale.y * 0.3, obj.scale.z * 0.7]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Spout */}
      <mesh position={[0, -obj.scale.y * 0.2, obj.scale.z * 0.35]}>
        <cylinderGeometry args={[0.02, 0.02, 0.08, 6]} />
        <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  );
}

function DoorGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Frame */}
      <mesh position={[0, obj.scale.y / 2, 0]}>
        <boxGeometry args={[obj.scale.x + 0.1, obj.scale.y, obj.scale.z]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.7} />
      </mesh>
      {/* Recessed panel */}
      <mesh position={[0, obj.scale.y / 2, 0.02]}>
        <boxGeometry args={[obj.scale.x - 0.1, obj.scale.y - 0.15, 0.02]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Doorknob */}
      <mesh position={[obj.scale.x / 2 - 0.1, obj.scale.y * 0.45, obj.scale.z / 2 + 0.02]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshStandardMaterial color="#c0a060" roughness={0.2} metalness={0.7} />
      </mesh>
    </group>
  );
}

function BookshelfGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  const shelfCount = 4;
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Side panels */}
      {[-1, 1].map((dx, i) => (
        <mesh key={i} position={[dx * (obj.scale.x / 2 - 0.015), obj.scale.y / 2, 0]}>
          <boxGeometry args={[0.03, obj.scale.y, obj.scale.z]} />
          <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
        </mesh>
      ))}
      {/* Back panel */}
      <mesh position={[0, obj.scale.y / 2, -obj.scale.z / 2 + 0.005]}>
        <boxGeometry args={[obj.scale.x - 0.06, obj.scale.y, 0.01]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Shelves */}
      {Array.from({ length: shelfCount + 1 }, (_, i) => (
        <mesh key={`shelf-${i}`} position={[0, (i / shelfCount) * obj.scale.y, 0]}>
          <boxGeometry args={[obj.scale.x - 0.04, 0.02, obj.scale.z]} />
          <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
        </mesh>
      ))}
    </group>
  );
}

function WhiteboardGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Board surface */}
      <mesh castShadow>
        <boxGeometry args={[obj.scale.x, obj.scale.y, 0.03]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 0, 0.016]}>
        <boxGeometry args={[obj.scale.x + 0.04, obj.scale.y + 0.04, 0.005]} />
        <meshStandardMaterial color={color !== "#888888" ? color : "#666666"} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Tray */}
      <mesh position={[0, -obj.scale.y / 2 - 0.03, 0.04]}>
        <boxGeometry args={[obj.scale.x * 0.6, 0.03, 0.06]} />
        <meshStandardMaterial color="#888888" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

function WindowGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Glass */}
      <mesh>
        <boxGeometry args={[obj.scale.x, obj.scale.y, 0.02]} />
        <meshStandardMaterial color="#aaccee" roughness={0.05} metalness={0.1} transparent opacity={0.3} />
      </mesh>
      {/* Frame */}
      {[
        [0, obj.scale.y / 2, 0], [0, -obj.scale.y / 2, 0],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[obj.scale.x + 0.04, 0.04, 0.05]} />
          <meshStandardMaterial color={color !== "#888888" ? color : "#dddddd"} roughness={0.5} />
        </mesh>
      ))}
      {[-obj.scale.x / 2, obj.scale.x / 2].map((x, i) => (
        <mesh key={`v-${i}`} position={[x, 0, 0]}>
          <boxGeometry args={[0.04, obj.scale.y, 0.05]} />
          <meshStandardMaterial color={color !== "#888888" ? color : "#dddddd"} roughness={0.5} />
        </mesh>
      ))}
      {/* Center divider */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.02, obj.scale.y, 0.04]} />
        <meshStandardMaterial color={color !== "#888888" ? color : "#dddddd"} roughness={0.5} />
      </mesh>
    </group>
  );
}

function RugGeometry({ obj, color }: FurnitureProps) {
  return (
    <mesh
      position={[obj.position.x, 0.005, obj.position.z]}
      rotation-x={-Math.PI / 2}
      rotation-y={obj.rotationY}
      receiveShadow
    >
      <planeGeometry args={[obj.scale.x, obj.scale.z]} />
      <meshStandardMaterial color={color !== "#888888" ? color : "#8B4513"} roughness={0.95} side={2} />
    </mesh>
  );
}

function TrashCanGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, 0, obj.position.z]}>
      <mesh position={[0, obj.scale.y / 2, 0]} castShadow>
        <cylinderGeometry args={[obj.scale.x * 0.45, obj.scale.x * 0.35, obj.scale.y, 8]} />
        <meshStandardMaterial color={color !== "#888888" ? color : "#555555"} roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

function LightFixtureGeometry({ obj, color }: FurnitureProps) {
  return (
    <group position={[obj.position.x, obj.position.y, obj.position.z]}>
      <mesh>
        <cylinderGeometry args={[obj.scale.x * 0.4, obj.scale.x * 0.5, obj.scale.y, 12]} />
        <meshStandardMaterial
          color={color !== "#888888" ? color : "#eeeeee"}
          roughness={0.2}
          metalness={0.5}
          emissive="#ffffcc"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function StoolGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Seat */}
      <mesh position={[0, obj.scale.y, 0]} castShadow>
        <cylinderGeometry args={[obj.scale.x * 0.45, obj.scale.x * 0.45, 0.04, 12]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Legs */}
      {[
        [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * obj.scale.x * 0.3, obj.scale.y / 2, dz * obj.scale.z * 0.3]}>
          <cylinderGeometry args={[0.015, 0.02, obj.scale.y, 6]} />
          <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function CabinetGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <group position={[obj.position.x, 0, obj.position.z]} rotation-y={obj.rotationY}>
      {/* Main body */}
      <mesh position={[0, obj.scale.y / 2, 0]} castShadow>
        <boxGeometry args={[obj.scale.x, obj.scale.y, obj.scale.z]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Door lines */}
      <mesh position={[0, obj.scale.y / 2, obj.scale.z / 2 + 0.002]}>
        <boxGeometry args={[0.01, obj.scale.y - 0.04, 0.001]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      {/* Handles */}
      {[-0.08, 0.08].map((dx, i) => (
        <mesh key={i} position={[dx, obj.scale.y * 0.55, obj.scale.z / 2 + 0.015]}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 6]} />
          <meshStandardMaterial color="#999999" roughness={0.2} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export function FurnitureGeometrySwitch({ obj, color }: FurnitureProps) {
  switch (obj.type) {
    case "table": return <TableGeometry obj={obj} color={color} />;
    case "chair": return <ChairGeometry obj={obj} color={color} />;
    case "sofa": return <SofaGeometry obj={obj} color={color} />;
    case "desk": return <DeskGeometry obj={obj} color={color} />;
    case "counter": return <CounterGeometry obj={obj} color={color} />;
    case "laptop": return <LaptopGeometry obj={obj} color={color} />;
    case "screen": return <ScreenGeometry obj={obj} color={color} />;
    case "plant": return <PlantGeometry obj={obj} color={color} />;
    case "coffee_machine": return <CoffeeMachineGeometry obj={obj} color={color} />;
    case "door": return <DoorGeometry obj={obj} color={color} />;
    case "bookshelf": return <BookshelfGeometry obj={obj} color={color} />;
    case "whiteboard": return <WhiteboardGeometry obj={obj} color={color} />;
    case "window": return <WindowGeometry obj={obj} color={color} />;
    case "rug": return <RugGeometry obj={obj} color={color} />;
    case "trash_can": return <TrashCanGeometry obj={obj} color={color} />;
    case "light_fixture": return <LightFixtureGeometry obj={obj} color={color} />;
    case "stool": return <StoolGeometry obj={obj} color={color} />;
    case "cabinet": return <CabinetGeometry obj={obj} color={color} />;
    default: return <DefaultGeometry obj={obj} color={color} />;
  }
}

function DefaultGeometry({ obj, color }: FurnitureProps) {
  const mat = useMaterialConfig(obj);
  return (
    <mesh
      position={[obj.position.x, obj.scale.y / 2, obj.position.z]}
      rotation-y={obj.rotationY}
      castShadow
    >
      <boxGeometry args={[obj.scale.x, obj.scale.y, obj.scale.z]} />
      <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
    </mesh>
  );
}
