import { useRef, useMemo } from "react";
import * as THREE from "three";
import { Instances, Instance } from "@react-three/drei";
import type { AgentModel } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";

export function AgentCrowd() {
  const agents = useNextStateStore((s) => s.agents);
  const agentArray = useMemo(() => Array.from(agents.values()), [agents]);

  if (agentArray.length === 0) return null;

  return (
    <Instances limit={50}>
      <capsuleGeometry args={[0.2, 1.0, 4, 8]} />
      <meshStandardMaterial color="#8888ff" />
      {agentArray.map((agent) => (
        <AgentInstance key={agent.id} agent={agent} />
      ))}
    </Instances>
  );
}

function AgentInstance({ agent }: { agent: AgentModel }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const topColor = agent.visual.clothingColors.top ?? "#8888ff";

  // Position the capsule so feet are at ground level
  // Sitting agents are lower; walking agents have slight forward lean
  const isSitting = agent.runtime.animationState === "sit";
  const isWalking = agent.runtime.animationState === "walk";
  const isTalking = agent.runtime.animationState === "talk";
  const isFidgeting = agent.runtime.animationState === "fidget";
  const isGlancing = agent.runtime.animationState === "glance";

  const yOffset = isSitting ? 0.4 : 0.7;

  // Forward lean for walking: slight X-axis rotation
  const leanX = isWalking ? 0.06 : 0;

  // Slight sway for fidgeting
  const fidgetRotZ = isFidgeting ? Math.sin(Date.now() * 0.003) * 0.05 : 0;

  // Slight head turn for glancing
  const glanceRotY = isGlancing ? Math.sin(Date.now() * 0.002) * 0.3 : 0;

  // Talking bob
  const talkBob = isTalking ? Math.sin(Date.now() * 0.004) * 0.02 : 0;

  return (
    <Instance
      ref={ref}
      position={[
        agent.runtime.position.x,
        yOffset + talkBob,
        agent.runtime.position.z,
      ]}
      rotation={[leanX, agent.runtime.heading + glanceRotY, fidgetRotZ]}
      color={topColor}
    />
  );
}
