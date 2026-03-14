import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { AgentModel } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";

const MAX_LABEL_DISTANCE = 25;
const LABEL_Y_OFFSET = 1.8;
const THOUGHT_BUBBLE_DURATION_MS = 4000;
const THOUGHT_MAX_LENGTH = 40;

function truncateThought(text: string): string {
  if (text.length <= THOUGHT_MAX_LENGTH) return text;
  // Cut at last space before limit
  const cut = text.lastIndexOf(" ", THOUGHT_MAX_LENGTH);
  return (cut > 10 ? text.slice(0, cut) : text.slice(0, THOUGHT_MAX_LENGTH)) + "\u2026";
}

export function AgentLabels() {
  const agents = useNextStateStore((s) => s.agents);
  const agentArray = Array.from(agents.values());

  if (agentArray.length === 0) return null;

  return (
    <group>
      {agentArray.map((agent) => (
        <AgentLabel key={agent.id} agent={agent} />
      ))}
    </group>
  );
}

function AgentLabel({ agent }: { agent: AgentModel }) {
  const camera = useThree((s) => s.camera);
  const selectedAgentId = useNextStateStore((s) => s.selectedAgentId);
  const isSelected = selectedAgentId === agent.id;

  // Track intent changes for thought bubble
  const prevIntentRef = useRef(agent.mind.currentIntent);
  const [thoughtText, setThoughtText] = useState<string | null>(null);
  const [thoughtVisible, setThoughtVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const newIntent = agent.mind.currentIntent;
    if (newIntent && newIntent !== prevIntentRef.current) {
      prevIntentRef.current = newIntent;
      setThoughtText(newIntent);
      setThoughtVisible(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setThoughtVisible(false);
      }, THOUGHT_BUBBLE_DURATION_MS);
    }
  }, [agent.mind.currentIntent]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const agentPos = agent.runtime.position;
  const dx = agentPos.x - camera.position.x;
  const dy = LABEL_Y_OFFSET - camera.position.y;
  const dz = agentPos.z - camera.position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance > MAX_LABEL_DISTANCE) return null;

  const archetype = agent.mind.archetype.replace(/_/g, " ");

  return (
    <group position={[agentPos.x, LABEL_Y_OFFSET, agentPos.z]}>
      <Html center distanceFactor={10} zIndexRange={[10, 0]}>
        <div className="pointer-events-none select-none flex flex-col items-center gap-1">
          {/* Thought bubble — shows on intent change, fades out */}
          {thoughtText && (
            <div
              style={{
                opacity: thoughtVisible ? 1 : 0,
                transform: thoughtVisible ? "translateY(0) scale(1)" : "translateY(3px) scale(0.95)",
                transition: "opacity 0.35s ease, transform 0.25s ease",
              }}
            >
              <div
                className="bg-white/90 text-gray-700 text-[8px] leading-snug px-1.5 py-0.5 rounded-md shadow-md whitespace-nowrap"
                style={{ fontStyle: "italic" }}
              >
                {truncateThought(thoughtText)}
              </div>
              {/* Single tail dot */}
              <div className="flex justify-center -mt-px">
                <div className="w-1 h-1 bg-white/90 rounded-full" />
              </div>
            </div>
          )}

          {/* Archetype label — always visible, highlight when selected */}
          <div
            className={`backdrop-blur-sm text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors duration-200 ${
              isSelected
                ? "bg-blue-500/90 text-white ring-1 ring-white/50"
                : "bg-black/70 text-white"
            }`}
          >
            {archetype}
          </div>
        </div>
      </Html>
    </group>
  );
}
