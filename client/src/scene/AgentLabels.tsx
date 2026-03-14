import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { AgentModel } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";

const MAX_LABEL_DISTANCE = 25;
const LABEL_Y_OFFSET = 1.8;

export function AgentLabels() {
  const agents = useNextStateStore((s) => s.agents);
  const debugOverlayVisible = useNextStateStore((s) => s.debugOverlayVisible);
  const agentArray = Array.from(agents.values());

  if (agentArray.length === 0) return null;

  return (
    <group>
      {agentArray.map((agent) => (
        <AgentLabel
          key={agent.id}
          agent={agent}
          showGoal={debugOverlayVisible}
        />
      ))}
    </group>
  );
}

function AgentLabel({
  agent,
  showGoal,
}: {
  agent: AgentModel;
  showGoal: boolean;
}) {
  const camera = useThree((s) => s.camera);

  const agentPos = agent.runtime.position;
  const dx = agentPos.x - camera.position.x;
  const dy = LABEL_Y_OFFSET - camera.position.y;
  const dz = agentPos.z - camera.position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance > MAX_LABEL_DISTANCE) return null;

  const archetype = agent.mind.archetype.replace(/_/g, " ");
  const goalText = showGoal
    ? agent.mind.currentIntent
    : null;

  return (
    <group position={[agentPos.x, LABEL_Y_OFFSET, agentPos.z]}>
      <Html center distanceFactor={10} zIndexRange={[10, 0]}>
        <div className="pointer-events-none select-none flex flex-col items-center gap-0.5">
          <div className="bg-black/70 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {archetype}
          </div>
          {goalText && (
            <div className="bg-black/50 text-neutral-300 text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap max-w-[120px] truncate">
              {goalText}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
