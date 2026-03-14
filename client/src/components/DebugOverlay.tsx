import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { useNextStateStore } from "../store/useNextStateStore";

/**
 * DebugOverlay renders nav graph nodes, edges, and zone boundaries
 * inside the R3F Canvas. Toggle with `debugOverlayVisible`.
 */
export function DebugOverlay() {
  const scene = useNextStateStore((s) => s.scene);
  const navEdges = useNextStateStore((s) => s.navEdges);
  const debugOverlayVisible = useNextStateStore((s) => s.debugOverlayVisible);

  if (!debugOverlayVisible || !scene) return null;

  const navGraph = scene.environment.navigationGraph;

  return (
    <group>
      {/* Nav nodes */}
      {navGraph.nodes.map((node) => (
        <mesh
          key={node.id}
          position={[node.position.x, 0.15, node.position.z]}
        >
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial
            color={node.isPortal ? "#ffaa00" : "#00ccff"}
          />
        </mesh>
      ))}

      {/* Nav edges */}
      {navEdges.map((edge, i) => {
        const fromNode = navGraph.nodes.find((n) => n.id === edge.from);
        const toNode = navGraph.nodes.find((n) => n.id === edge.to);
        if (!fromNode || !toNode) return null;

        return (
          <NavEdgeLine
            key={`${edge.from}-${edge.to}-${i}`}
            fromX={fromNode.position.x}
            fromZ={fromNode.position.z}
            toX={toNode.position.x}
            toZ={toNode.position.z}
            blocked={edge.blocked}
          />
        );
      })}

      {/* Zone boundaries */}
      {scene.environment.semanticZones.map((zone) => (
        <ZoneBoundary key={zone.id} zone={zone} />
      ))}
    </group>
  );
}

function NavEdgeLine({
  fromX,
  fromZ,
  toX,
  toZ,
  blocked,
}: {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  blocked: boolean;
}) {
  const points: [number, number, number][] = [
    [fromX, 0.12, fromZ],
    [toX, 0.12, toZ],
  ];
  return (
    <Line
      points={points}
      color={blocked ? "#ff3333" : "#33ff66"}
      lineWidth={blocked ? 2 : 1}
      transparent
      opacity={0.6}
    />
  );
}

function ZoneBoundary({
  zone,
}: {
  zone: {
    id: string;
    type: string;
    polygon: { points: Array<{ x: number; z: number }> };
  };
}) {
  const color = useMemo(() => {
    const zoneColors: Record<string, string> = {
      seating: "#4466ff",
      standing: "#ffaa00",
      service: "#ff4488",
      circulation: "#44ff88",
      entry: "#00ff88",
      exit: "#ff6644",
      waiting: "#aa44ff",
      unknown: "#888888",
    };
    return zoneColors[zone.type] ?? "#888888";
  }, [zone.type]);

  const shape = useMemo(() => {
    if (zone.polygon.points.length < 3) return null;
    const pts = zone.polygon.points;
    const s = new THREE.Shape();
    s.moveTo(pts[0].x, pts[0].z);
    for (let i = 1; i < pts.length; i++) {
      s.lineTo(pts[i].x, pts[i].z);
    }
    s.closePath();
    return s;
  }, [zone.polygon.points]);

  if (!shape) return null;

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
