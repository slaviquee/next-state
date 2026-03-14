import { useCallback, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { AgentModel } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";

/**
 * Raycasting click detection for agents.
 *
 * Since drei Instances don't reliably support per-instance onClick,
 * this component implements a ground-plane click handler that finds
 * the closest agent to the click point.
 */

const CLICK_PROXIMITY_THRESHOLD = 0.6; // meters — how close a click must be to an agent

export function AgentClickHandler() {
  const { camera, raycaster, pointer } = useThree();
  const agents = useNextStateStore((s) => s.agents);
  const selectAgent = useNextStateStore((s) => s.selectAgent);

  const groundPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  );

  const handleClick = useCallback(
    (event: { stopPropagation: () => void }) => {
      // Update raycaster from camera and pointer
      raycaster.setFromCamera(pointer, camera);

      // Intersect with ground plane (y=0)
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(groundPlane, intersection);
      if (!hit) return;

      // Find closest agent to the click point
      let closestAgent: AgentModel | null = null;
      let closestDist = CLICK_PROXIMITY_THRESHOLD;

      for (const agent of agents.values()) {
        const dx = agent.runtime.position.x - intersection.x;
        const dz = agent.runtime.position.z - intersection.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < closestDist) {
          closestDist = dist;
          closestAgent = agent;
        }
      }

      if (closestAgent) {
        event.stopPropagation();
        selectAgent(closestAgent.id);
      }
    },
    [agents, camera, groundPlane, pointer, raycaster, selectAgent],
  );

  return (
    <mesh
      position={[0, 0.001, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onClick={handleClick}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// THREE import needed for Plane/Vector3
import * as THREE from "three";
