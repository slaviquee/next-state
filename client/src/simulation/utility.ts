import type {
  AgentModel,
  NavigationGraph,
  EnvironmentModel,
  Vec3,
} from "@next-state/shared";
import { isReachable } from "./pathfinding";

// ── WorldState ─────────────────────────────────────────────────────────────────

/** Snapshot of the world state available to utility functions each tick. */
export interface WorldState {
  environment: EnvironmentModel;
  agents: Map<string, AgentModel>;
  activeInteractions: ActiveInteraction[];
  simClock: number;
  navGraph: NavigationGraph;
  zoneOccupancy: Map<string, string[]>;
  objectOccupancy: Map<string, string | null>;
  goalTtlDefaultSec: number;
  collisionAvoidanceRadius: number;
  stuckTickThreshold: number;
}

export interface ActiveInteraction {
  id: string;
  type: string;
  initiatorId: string;
  targetId: string;
  phase: InteractionPhase;
  startTick: number;
  durationTicks: number;
  ticksRemaining: number;
}

export type InteractionPhase = "approaching" | "active" | "cooldown";

// ── Utility Scores ─────────────────────────────────────────────────────────────

export interface UtilityScore {
  action: string;
  value: number;
}

type UtilityFn = (agent: AgentModel, world: WorldState) => number;

// ── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Returns 1.0 if agent's current goal matches any listed type, 0.1 otherwise.
 * The small base ensures agents can still switch goals.
 */
export function goalMatch(agent: AgentModel, ...types: string[]): number {
  return types.includes(agent.mind.primaryGoal.type) ? 1.0 : 0.1;
}

/**
 * Increases linearly from 0 to 1 as time since last goal change approaches goalTtlDefaultSec.
 * Scales inversely with patience.
 */
export function boredomFactor(agent: AgentModel, world?: WorldState): number {
  const ttl = world?.goalTtlDefaultSec ?? 30;
  const elapsed = (world?.simClock ?? 0) - agent.runtime.goalStartedAt;
  const elapsedSec = elapsed / 1000;
  const patienceScale = Math.max(0.1, agent.mind.patience);
  const raw = elapsedSec / (ttl * patienceScale);
  return Math.min(1, Math.max(0, raw));
}

/**
 * Returns 1.0 if A* finds a path, 0.2 if blocked.
 * Still scores nonzero so the agent tries reroute.
 */
export function pathAvailability(agent: AgentModel, world: WorldState): number {
  const goal = agent.mind.primaryGoal;

  // Find the target node
  let targetNodeId: string | null = null;
  if (goal.targetZoneId) {
    // Find a nav node in the target zone
    for (const node of world.navGraph.nodes) {
      if (node.zoneId === goal.targetZoneId) {
        targetNodeId = node.id;
        break;
      }
    }
  }
  if (!targetNodeId && goal.targetObjectId) {
    // Find closest nav node to the target object
    const obj = world.environment.objects.find((o) => o.id === goal.targetObjectId);
    if (obj) {
      let bestDist = Infinity;
      for (const node of world.navGraph.nodes) {
        const dx = node.position.x - obj.position.x;
        const dz = node.position.z - obj.position.z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) {
          bestDist = d;
          targetNodeId = node.id;
        }
      }
    }
  }

  if (!targetNodeId) return 0.2;

  return isReachable(
    agent.runtime.position,
    targetNodeId,
    world.navGraph,
    world.agents,
    agent.id,
  )
    ? 1.0
    : 0.2;
}

/**
 * Returns 0 if no companion; ramps from 0 to 1 as companion distance exceeds 3m.
 */
export function companionDistance(agent: AgentModel, world: WorldState): number {
  if (agent.social.companionIds.length === 0) return 0;

  let maxDist = 0;
  for (const companionId of agent.social.companionIds) {
    const companion = world.agents.get(companionId);
    if (!companion) continue;
    const dx = agent.runtime.position.x - companion.runtime.position.x;
    const dz = agent.runtime.position.z - companion.runtime.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    maxDist = Math.max(maxDist, dist);
  }

  if (maxDist <= 1.5) return 0;
  // Ramp from 0 at 1.5m to 1.0 at 5m
  return Math.min(1, (maxDist - 1.5) / 3.5);
}

/**
 * Number of agents within collisionAvoidanceRadius * 2, normalized to [0, 1].
 */
export function localDensity(agent: AgentModel, world: WorldState): number {
  const radius = world.collisionAvoidanceRadius * 2;
  const radiusSq = radius * radius;
  let count = 0;

  for (const [id, other] of world.agents) {
    if (id === agent.id) continue;
    const dx = agent.runtime.position.x - other.runtime.position.x;
    const dz = agent.runtime.position.z - other.runtime.position.z;
    if (dx * dx + dz * dz < radiusSq) {
      count++;
    }
  }

  // Normalize: 5+ agents nearby is max density
  return Math.min(1, count / 5);
}

/**
 * Max sociability of agents within 1.5m who are also off cooldown.
 */
export function nearbyInteractableScore(agent: AgentModel, world: WorldState): number {
  const interactionRadius = 1.5;
  const radiusSq = interactionRadius * interactionRadius;
  let maxScore = 0;

  for (const [id, other] of world.agents) {
    if (id === agent.id) continue;
    if (other.runtime.activeInteractionId !== null) continue;

    const dx = agent.runtime.position.x - other.runtime.position.x;
    const dz = agent.runtime.position.z - other.runtime.position.z;
    if (dx * dx + dz * dz < radiusSq) {
      // Check other agent's cooldown
      if (interactionCooldownOkForAgent(other, world)) {
        maxScore = Math.max(maxScore, other.social.sociability);
      }
    }
  }

  return maxScore;
}

function interactionCooldownOkForAgent(agent: AgentModel, world: WorldState): boolean {
  if (agent.runtime.lastInteractionAt === null) return true;
  const elapsed = (world.simClock - agent.runtime.lastInteractionAt) / 1000;
  return elapsed >= agent.social.interactionCooldownSec;
}

/**
 * 1.0 if enough time has passed since last interaction, 0.0 otherwise.
 */
export function interactionCooldownOk(agent: AgentModel, world?: WorldState): number {
  if (agent.runtime.lastInteractionAt === null) return 1.0;
  const clock = world?.simClock ?? 0;
  const elapsed = (clock - agent.runtime.lastInteractionAt) / 1000;
  return elapsed >= agent.social.interactionCooldownSec ? 1.0 : 0.0;
}

// ── Utility Functions ──────────────────────────────────────────────────────────

const utilityFunctions: Record<string, UtilityFn> = {
  stay_put: (a, w) =>
    a.mind.patience * goalMatch(a, "stay_put") * (1 - boredomFactor(a, w)),

  move_to_target: (a, w) =>
    a.mind.primaryGoal.urgency *
    goalMatch(a, "find_seat", "approach_counter", "move_to_exit") *
    pathAvailability(a, w),

  follow_companion: (a, w) =>
    a.social.followTendency *
    companionDistance(a, w) *
    goalMatch(a, "follow_companion"),

  avoid_crowd: (a, w) =>
    localDensity(a, w) * (1 - a.mind.conformity),

  wander: (a, w) =>
    boredomFactor(a, w) * a.mind.curiosity * (1 - localDensity(a, w)),

  interact: (a, w) =>
    nearbyInteractableScore(a, w) *
    a.social.sociability *
    interactionCooldownOk(a, w),

  wait: (a, _w) =>
    goalMatch(a, "wait_for_someone") * a.mind.patience,

  reroute: (a, _w) =>
    a.runtime.blocked ? 0.9 : 0,
};

// ── Softmax Selection ──────────────────────────────────────────────────────────

function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max)); // subtract max for numerical stability
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function weightedRandomSample(items: UtilityScore[], probs: number[]): UtilityScore {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += probs[i];
    if (r <= cumulative) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Score all utility functions for an agent and select an action via softmax sampling.
 */
export function selectAction(agent: AgentModel, world: WorldState): UtilityScore {
  // Score all actions
  const scores: UtilityScore[] = [];
  for (const [action, fn] of Object.entries(utilityFunctions)) {
    const value = Math.max(0, Math.min(1, fn(agent, world)));
    scores.push({ action, value });
  }

  // Sort descending and take top 3
  scores.sort((a, b) => b.value - a.value);
  const topN = scores.slice(0, 3);

  // Temperature from arousal: high arousal = low temp = more decisive
  const temperature = 0.3 + (1 - agent.mind.arousal) * 0.7;

  // Apply softmax with temperature
  const probs = softmax(topN.map((s) => s.value / temperature));

  return weightedRandomSample(topN, probs);
}

/**
 * Get all utility scores for an agent (useful for debugging/inspector).
 */
export function getAllScores(agent: AgentModel, world: WorldState): UtilityScore[] {
  const scores: UtilityScore[] = [];
  for (const [action, fn] of Object.entries(utilityFunctions)) {
    const value = Math.max(0, Math.min(1, fn(agent, world)));
    scores.push({ action, value });
  }
  scores.sort((a, b) => b.value - a.value);
  return scores;
}
