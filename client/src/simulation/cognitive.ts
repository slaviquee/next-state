import type {
  AgentModel,
  AgentRefreshRequest,
  AgentRefreshResult,
  CompiledScenePackage,
  SimulationConfig,
} from "@next-state/shared";
import { refreshAgents } from "../api/client";
import { useNextStateStore } from "../store/useNextStateStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CognitiveCandidate {
  agentId: string;
  priority: number;
  lastRefreshedAt: number;
}

interface WorldState {
  agents: Map<string, AgentModel>;
  scene: CompiledScenePackage;
  simClock: number;
  selectedAgentId: string | null;
  interventionZoneId: string | null;
}

// ---------------------------------------------------------------------------
// Module-level state for debouncing
// ---------------------------------------------------------------------------

const lastRefreshTime = new Map<string, number>();

// ---------------------------------------------------------------------------
// Trigger evaluation — returns agent IDs that should be refreshed
// ---------------------------------------------------------------------------

/**
 * Evaluate which agents should receive a cognitive refresh this window.
 * Returns at most `maxCognitiveUpdatesPerWindow` agent IDs sorted by priority.
 */
export function selectAgentsForRefresh(worldState: WorldState): string[] {
  const { agents, scene, simClock, selectedAgentId, interventionZoneId } = worldState;
  const config = scene.simulationConfig;
  const cooldownMs = config.cognitiveUpdateWindowSec * 2 * 1000;

  const candidates: CognitiveCandidate[] = [];

  for (const [agentId, agent] of agents) {
    const lastRefresh = lastRefreshTime.get(agentId) ?? 0;
    const timeSinceRefresh = simClock - lastRefresh;

    // Intervention override: skip cooldown for agents in affected zone
    const isInInterventionZone =
      interventionZoneId !== null &&
      agent.runtime.occupyingZoneId === interventionZoneId;

    // Enforce cooldown unless intervention override
    if (!isInInterventionZone && timeSinceRefresh < cooldownMs) {
      continue;
    }

    // Evaluate trigger conditions and assign priority
    const priority = evaluatePriority(agent, config, simClock, selectedAgentId, agents);

    if (priority > 0) {
      candidates.push({ agentId, priority, lastRefreshedAt: lastRefresh });
    }
  }

  // Sort by priority descending, ties broken by longest time since last refresh
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.lastRefreshedAt - b.lastRefreshedAt; // older refresh = higher priority
  });

  // Take at most N
  const maxUpdates = config.maxCognitiveUpdatesPerWindow;
  return candidates.slice(0, maxUpdates).map((c) => c.agentId);
}

/**
 * Evaluate the highest priority trigger for an agent.
 * Returns 0 if no trigger fires.
 */
function evaluatePriority(
  agent: AgentModel,
  config: SimulationConfig,
  simClock: number,
  selectedAgentId: string | null,
  allAgents: Map<string, AgentModel>,
): number {
  let maxPriority = 0;

  // Priority 5: Agent blocked AND stuck ticks >= threshold
  if (
    agent.runtime.blocked &&
    agent.locomotion.stuckTickCount >= config.stuckTickThreshold
  ) {
    maxPriority = Math.max(maxPriority, 5);
  }

  // Priority 5: Agent in 'react' animation state (intervention just happened)
  if (agent.runtime.animationState === "react") {
    maxPriority = Math.max(maxPriority, 5);
  }

  // Priority 4: Companion distance > 5m / group split
  if (agent.social.companionIds.length > 0) {
    for (const companionId of agent.social.companionIds) {
      const companion = allAgents.get(companionId);
      if (companion) {
        const dist = xzDistance(
          agent.runtime.position,
          companion.runtime.position,
        );
        if (dist > 5) {
          maxPriority = Math.max(maxPriority, 4);
          break;
        }
      }
    }
  }

  // Priority 3: Goal TTL expired
  const goalAgeSec = (simClock - agent.runtime.goalStartedAt) / 1000;
  const ttl = agent.mind.primaryGoal.ttlSec ?? config.goalTtlDefaultSec;
  if (goalAgeSec >= ttl) {
    maxPriority = Math.max(maxPriority, 3);
  }

  // Priority 2: Local density > 0.8
  // Approximate density by counting agents within 2m radius
  let nearbyCount = 0;
  for (const [otherId, other] of allAgents) {
    if (otherId === agent.id) continue;
    const dist = xzDistance(agent.runtime.position, other.runtime.position);
    if (dist < 2) nearbyCount++;
  }
  // Normalize: 5 or more agents within 2m = density 1.0
  const localDensity = Math.min(nearbyCount / 5, 1.0);
  if (localDensity > 0.8) {
    maxPriority = Math.max(maxPriority, 2);
  }

  // Priority 1: User is inspecting this agent
  if (selectedAgentId === agent.id) {
    maxPriority = Math.max(maxPriority, 1);
  }

  return maxPriority;
}

/** Euclidean distance on the XZ plane. */
function xzDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---------------------------------------------------------------------------
// API call + store application
// ---------------------------------------------------------------------------

/**
 * Send a cognitive refresh request for the given agent IDs and apply
 * the results to the Zustand store.
 */
export async function performCognitiveRefresh(
  agentIds: string[],
  worldState: WorldState,
): Promise<void> {
  if (agentIds.length === 0) return;

  const { agents, scene, simClock } = worldState;

  // Build runtime snapshot for the request
  const agentStates: Record<
    string,
    {
      position: { x: number; y: number; z: number };
      heading: number;
      currentGoal: string;
      animationState: string;
      blocked: boolean;
      stuckTickCount: number;
      goalStartedAt: number;
      lastInteractionAt: number | null;
    }
  > = {};

  for (const [id, agent] of agents) {
    agentStates[id] = {
      position: { ...agent.runtime.position },
      heading: agent.runtime.heading,
      currentGoal: agent.mind.primaryGoal.type,
      animationState: agent.runtime.animationState,
      blocked: agent.runtime.blocked,
      stuckTickCount: agent.locomotion.stuckTickCount,
      goalStartedAt: agent.runtime.goalStartedAt,
      lastInteractionAt: agent.runtime.lastInteractionAt,
    };
  }

  // Collect recent events from agents being refreshed (last 20 across all)
  const allEvents: Array<{ tick: number; type: string; detail?: string }> = [];
  for (const agentId of agentIds) {
    const agent = agents.get(agentId);
    if (agent) {
      allEvents.push(...agent.runtime.recentEvents);
    }
  }
  allEvents.sort((a, b) => b.tick - a.tick);
  const recentEvents = allEvents.slice(0, 20);

  const request: AgentRefreshRequest = {
    sceneId: scene.sceneId,
    agents: agentIds,
    eventContext: {
      type: "periodic_refresh",
      summary: `Cognitive refresh for ${agentIds.length} agent(s) at simClock=${simClock}`,
    },
    runtimeSnapshot: {
      simClock,
      agentStates,
      blockedEdges: scene.environment.navigationGraph.edges
        .filter((e) => e.blocked)
        .map((e) => `${e.from}->${e.to}`),
      recentEvents,
    },
  };

  try {
    const response = await refreshAgents(request);
    applyRefreshResults(response.results);

    // Update debounce timestamps
    const now = worldState.simClock;
    for (const agentId of agentIds) {
      lastRefreshTime.set(agentId, now);
    }
  } catch (err) {
    console.error("Cognitive refresh API call failed:", err);
    // On failure, agents keep their current goals (no-op)
  }
}

/**
 * Apply refresh results to the Zustand store, updating agent mind states.
 */
function applyRefreshResults(results: AgentRefreshResult[]): void {
  const store = useNextStateStore.getState();
  const agents = store.agents;
  let changed = false;

  for (const result of results) {
    const agent = agents.get(result.agentId);
    if (!agent) continue;

    // Update mind state
    agent.mind.primaryGoal = result.updatedGoal;
    agent.mind.currentIntent = result.currentIntent;
    agent.mind.reactionStyle = result.reactionStyle;
    agent.mind.likelyNextActions = result.likelyNextActions;
    agent.mind.confidence = result.confidence;

    // Reset goal tracking
    agent.runtime.goalStartedAt = store.simClock;
    agent.runtime.lastDecisionAt = store.simClock;

    // If the agent was stuck and the goal changed, reset stuck counter
    if (agent.locomotion.stuckTickCount > 0) {
      agent.locomotion.stuckTickCount = 0;
      agent.runtime.blocked = false;
      agent.locomotion.isBlocked = false;
    }

    changed = true;
  }

  if (changed) {
    useNextStateStore.setState({ agents: new Map(agents) });
  }
}

// ---------------------------------------------------------------------------
// Periodic check — call from the simulation loop
// ---------------------------------------------------------------------------

let lastCheckTime = 0;

/**
 * Should be called every tick from the simulation engine.
 * Internally checks whether enough time has passed since the last cognitive window.
 * If so, evaluates triggers and fires off an async refresh.
 */
export function checkCognitiveRefresh(): void {
  const store = useNextStateStore.getState();
  const { scene, agents, simClock, selectedAgentId, simRunning } = store;

  if (!simRunning || !scene || agents.size === 0) return;

  const windowMs = scene.simulationConfig.cognitiveUpdateWindowSec * 1000;
  if (simClock - lastCheckTime < windowMs) return;
  lastCheckTime = simClock;

  const worldState: WorldState = {
    agents,
    scene,
    simClock,
    selectedAgentId,
    interventionZoneId: null, // set by intervention handler if needed
  };

  const agentIds = selectAgentsForRefresh(worldState);
  if (agentIds.length > 0) {
    // Fire-and-forget — don't block the simulation tick
    performCognitiveRefresh(agentIds, worldState).catch((err) => {
      console.error("Background cognitive refresh failed:", err);
    });
  }
}
