import { useNextStateStore } from "../store/useNextStateStore";

export function AgentInspector() {
  const selectedAgentId = useNextStateStore((s) => s.selectedAgentId);
  const inspectorOpen = useNextStateStore((s) => s.inspectorOpen);
  const agents = useNextStateStore((s) => s.agents);
  const selectAgent = useNextStateStore((s) => s.selectAgent);

  if (!inspectorOpen || !selectedAgentId) return null;

  const agent = agents.get(selectedAgentId);
  if (!agent) return null;

  return (
    <div className="absolute top-4 right-4 w-72 bg-black/80 backdrop-blur-md text-white rounded-xl p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">
          {agent.mind.archetype.replace(/_/g, " ")}
        </h3>
        <button
          className="text-neutral-400 hover:text-white text-lg leading-none"
          onClick={() => selectAgent(null)}
        >
          &times;
        </button>
      </div>

      <div className="text-neutral-400 text-xs">{agent.id}</div>

      <Section title="Profile">
        <Row label="Gender" value={agent.visual.gender} />
        <Row label="Age" value={agent.visual.ageGroup.replace(/_/g, " ")} />
        <Row label="Style" value={agent.visual.clothingStyle ?? "unknown"} />
        <Row label="Pose" value={agent.visual.initialPose} />
      </Section>

      <Section title="Mind">
        <Row label="Intent" value={agent.mind.currentIntent} />
        <Row label="Goal" value={agent.mind.primaryGoal.type.replace(/_/g, " ")} />
        <Row label="Urgency" value={`${Math.round(agent.mind.primaryGoal.urgency * 100)}%`} />
        <Row label="Reaction" value={agent.mind.reactionStyle.replace(/_/g, " ")} />
      </Section>

      <Section title="Traits">
        <TraitBar label="Arousal" value={agent.mind.arousal} />
        <TraitBar label="Patience" value={agent.mind.patience} />
        <TraitBar label="Curiosity" value={agent.mind.curiosity} />
        <TraitBar label="Conformity" value={agent.mind.conformity} />
      </Section>

      <Section title="Likely Actions">
        {agent.mind.likelyNextActions.map((action, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-neutral-300 truncate mr-2">{action.label}</span>
            <span className="text-neutral-500 shrink-0">{Math.round(action.probability * 100)}%</span>
          </div>
        ))}
      </Section>

      <Section title="State">
        <Row label="Animation" value={agent.runtime.animationState} />
        <Row label="Speed" value={`${agent.locomotion.speed.toFixed(1)} m/s`} />
        <Row label="Blocked" value={agent.runtime.blocked ? "Yes" : "No"} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-neutral-500 uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-neutral-500 w-8 text-right text-xs">{Math.round(value * 100)}</span>
    </div>
  );
}
