import { useNextStateStore } from "../store/useNextStateStore";
import type { AgentModel } from "@next-state/shared";
import { selectAction, type WorldState, type ActiveInteraction } from "./utility";
import { computeMovement } from "./movement";
import { invalidatePath, clearAllPaths } from "./pathfinding";
import {
  detectInteractionTriggers,
  detectSharedReactions,
  createInteraction,
  tickInteraction,
  getInteractionAnimationState,
  shouldPauseForInteraction,
  getPostInteractionGoal,
  computeFacingHeading,
  resetInteractionState,
} from "./interactions";
import { checkCognitiveRefresh } from "./cognitive";

/**
 * Full simulation engine.
 *
 * Per tick, per agent:
 *   observe -> utility score -> choose/maintain goal -> plan/replan path
 *   -> apply movement -> resolve collisions -> update animation
 *   -> trigger micro-behaviors -> check interaction triggers
 */

let intervalId: ReturnType<typeof setInterval> | null = null;

// Active interactions state (owned by engine, not store)
let activeInteractions: ActiveInteraction[] = [];

// Track when agents need to replan
const replanFlags = new Set<string>();

// ── Micro-behaviors ────────────────────────────────────────────────────────────

type MicroBehavior = "glance" | "fidget" | "idle";

function rollMicroBehavior(
  agent: AgentModel,
  chancePerTick: number,
): MicroBehavior | null {
  if (Math.random() > chancePerTick) return null;

  // Weight by personality
  const isAnxious = agent.mind.reactionStyle === "anxious";
  const isCalm = agent.mind.reactionStyle === "calm";

  const fidgetWeight = isAnxious ? 0.6 : isCalm ? 0.1 : 0.3;
  const glanceWeight = 1 - fidgetWeight;

  const r = Math.random();
  if (r < glanceWeight) return "glance";
  return "fidget";
}

// ── Zone/Object Occupancy ──────────────────────────────────────────────────────

function updateOccupancy(
  agents: Map<string, AgentModel>,
  world: WorldState,
): { zoneOccupancy: Map<string, string[]>; objectOccupancy: Map<string, string | null> } {
  const zoneOccupancy = new Map<string, string[]>();
  const objectOccupancy = new Map<string, string | null>();

  // Initialize zones
  for (const zone of world.environment.semanticZones) {
    zoneOccupancy.set(zone.id, []);
  }

  // Initialize objects
  for (const obj of world.environment.objects) {
    objectOccupancy.set(obj.id, null);
  }

  // Assign agents to zones and objects
  for (const [id, agent] of agents) {
    // Zone occupancy: check which zone the agent is in
    for (const zone of world.environment.semanticZones) {
      if (isPointInPolygon(agent.runtime.position, zone.polygon.points)) {
        zoneOccupancy.get(zone.id)?.push(id);
        agent.runtime.occupyingZoneId = zone.id;
        break;
      }
    }

    // Object occupancy
    if (agent.runtime.occupyingObjectId) {
      objectOccupancy.set(agent.runtime.occupyingObjectId, id);
    }
  }

  return { zoneOccupancy, objectOccupancy };
}

function isPointInPolygon(
  point: { x: number; z: number },
  polygon: { x: number; z: number }[],
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const intersect =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Queue Assignment ────────────────────────────────────────────────────────

/** Per-zone queue lists tracking arrival order. */
const zoneQueues = new Map<string, string[]>();

/**
 * For each agent whose goal targets a service zone, assign a queue position.
 * Agents already in a queue keep their position (advancing as earlier agents leave).
 */
function assignQueues(agents: Map<string, AgentModel>, world: WorldState): void {
  // Find all service zones
  const serviceZones = world.environment.semanticZones.filter((z) => z.type === "service");
  if (serviceZones.length === 0) return;

  const serviceZoneIds = new Set(serviceZones.map((z) => z.id));

  // Remove agents from queues if they no longer target the zone
  for (const [zoneId, queue] of zoneQueues) {
    const filtered = queue.filter((agentId) => {
      const agent = agents.get(agentId);
      if (!agent) return false;
      return agent.runtime.queueTargetZoneId === zoneId;
    });
    if (filtered.length === 0) {
      zoneQueues.delete(zoneId);
    } else {
      zoneQueues.set(zoneId, filtered);
    }
  }

  // Add new agents to queues
  for (const [id, agent] of agents) {
    const goal = agent.mind.primaryGoal;

    // Agent wants to approach a service zone
    if (
      (goal.type === "approach_counter" || goal.type === "find_seat") &&
      goal.targetZoneId &&
      serviceZoneIds.has(goal.targetZoneId)
    ) {
      // Already in a queue for this zone?
      if (agent.runtime.queueTargetZoneId === goal.targetZoneId) continue;

      // Clear previous queue assignment
      if (agent.runtime.queueTargetZoneId !== null) {
        const prevQueue = zoneQueues.get(agent.runtime.queueTargetZoneId);
        if (prevQueue) {
          const idx = prevQueue.indexOf(id);
          if (idx !== -1) prevQueue.splice(idx, 1);
        }
      }

      // Add to new queue
      const queue = zoneQueues.get(goal.targetZoneId) ?? [];
      queue.push(id);
      zoneQueues.set(goal.targetZoneId, queue);

      agent.runtime.queueTargetZoneId = goal.targetZoneId;
    } else {
      // Agent no longer targeting a service zone — clear queue assignment
      if (agent.runtime.queueTargetZoneId !== null) {
        const prevQueue = zoneQueues.get(agent.runtime.queueTargetZoneId);
        if (prevQueue) {
          const idx = prevQueue.indexOf(id);
          if (idx !== -1) prevQueue.splice(idx, 1);
        }
        agent.runtime.queueTargetZoneId = null;
        agent.runtime.queuePosition = null;
      }
    }
  }

  // Assign queue positions based on order in each queue
  for (const [_zoneId, queue] of zoneQueues) {
    for (let i = 0; i < queue.length; i++) {
      const agent = agents.get(queue[i]);
      if (agent) {
        agent.runtime.queuePosition = i;
      }
    }
  }
}

// ── Goal Management ────────────────────────────────────────────────────────────

function mapActionToGoal(
  action: string,
  agent: AgentModel,
  world: WorldState,
): void {
  switch (action) {
    case "stay_put":
      if (agent.mind.primaryGoal.type !== "stay_put") {
        setGoal(agent, "stay_put", world);
      }
      break;

    case "move_to_target":
      // Keep existing movement goal
      if (
        agent.mind.primaryGoal.type !== "find_seat" &&
        agent.mind.primaryGoal.type !== "approach_counter" &&
        agent.mind.primaryGoal.type !== "move_to_exit"
      ) {
        // Default to wander if no specific target
        setGoal(agent, "wander", world);
      }
      break;

    case "follow_companion":
      if (agent.mind.primaryGoal.type !== "follow_companion") {
        setGoal(agent, "follow_companion", world);
        if (agent.social.companionIds.length > 0) {
          agent.mind.primaryGoal.targetAgentId = agent.social.companionIds[0];
        }
      }
      break;

    case "avoid_crowd":
      if (agent.mind.primaryGoal.type !== "avoid_crowd") {
        setGoal(agent, "avoid_crowd", world);
        replanFlags.add(agent.id);
      }
      break;

    case "wander":
      if (agent.mind.primaryGoal.type !== "wander") {
        setGoal(agent, "wander", world);
        replanFlags.add(agent.id);
      }
      break;

    case "interact":
      // Interaction triggers are handled separately
      break;

    case "wait":
      if (agent.mind.primaryGoal.type !== "wait_for_someone") {
        setGoal(agent, "wait_for_someone", world);
      }
      break;

    case "reroute":
      setGoal(agent, "reposition", world);
      replanFlags.add(agent.id);
      break;
  }
}

function setGoal(agent: AgentModel, type: string, world: WorldState): void {
  agent.mind.primaryGoal = {
    type: type as AgentModel["mind"]["primaryGoal"]["type"],
    urgency: agent.mind.primaryGoal.urgency,
    targetZoneId: agent.mind.primaryGoal.targetZoneId,
    targetObjectId: agent.mind.primaryGoal.targetObjectId,
    targetAgentId: agent.mind.primaryGoal.targetAgentId,
    ttlSec: agent.mind.primaryGoal.ttlSec,
  };
  agent.runtime.goalStartedAt = world.simClock;
  agent.runtime.goalChangedCount++;
  invalidatePath(agent.id);
}

// ── Replan Detection ───────────────────────────────────────────────────────────

function checkReplanConditions(
  agent: AgentModel,
  world: WorldState,
): boolean {
  // Already flagged for replan
  if (replanFlags.has(agent.id)) {
    replanFlags.delete(agent.id);
    return true;
  }

  // Path becomes blocked
  if (agent.runtime.blocked && agent.locomotion.stuckTickCount >= world.stuckTickThreshold) {
    return true;
  }

  // Goal TTL expired (boredom drift)
  const goalElapsedSec = (world.simClock - agent.runtime.goalStartedAt) / 1000;
  const ttl = agent.mind.primaryGoal.ttlSec ?? world.goalTtlDefaultSec;
  if (goalElapsedSec > ttl) {
    return true;
  }

  // Local density exceeds threshold
  const densityRadius = world.collisionAvoidanceRadius * 2;
  const densityRadiusSq = densityRadius * densityRadius;
  let nearbyCount = 0;
  for (const [id, other] of world.agents) {
    if (id === agent.id) continue;
    const dx = agent.runtime.position.x - other.runtime.position.x;
    const dz = agent.runtime.position.z - other.runtime.position.z;
    if (dx * dx + dz * dz < densityRadiusSq) {
      nearbyCount++;
    }
  }
  if (nearbyCount >= 5) {
    return true;
  }

  return false;
}

// ── Animation State ────────────────────────────────────────────────────────────

function determineAnimationState(
  agent: AgentModel,
  isMoving: boolean,
  microBehavior: MicroBehavior | null,
  interactionAnimation: "talk" | "turn" | "idle" | null,
): AgentModel["runtime"]["animationState"] {
  // Interaction animations take priority
  if (interactionAnimation) return interactionAnimation;

  // Sitting agents stay sitting
  if (agent.runtime.animationState === "sit") return "sit";

  // Micro-behaviors
  if (microBehavior === "glance") return "glance";
  if (microBehavior === "fidget") return "fidget";

  // Movement-based
  if (isMoving) return "walk";

  // Waiting goal
  if (agent.mind.primaryGoal.type === "wait_for_someone") return "wait";

  return "idle";
}

// ── Engine Tick ────────────────────────────────────────────────────────────────

function engineTick(tickMs: number, skipCognitive = false): void {
  const state = useNextStateStore.getState();
  const { simRunning, simSpeed, agents, simClock, scene } = state;
  if (!simRunning || !scene) return;

  const dt = tickMs * simSpeed;
  const dtSec = dt / 1000;
  const config = scene.simulationConfig;

  // Build world state snapshot
  const world: WorldState = {
    environment: scene.environment,
    agents,
    activeInteractions,
    simClock,
    navGraph: scene.environment.navigationGraph,
    zoneOccupancy: state.zoneOccupancy,
    objectOccupancy: state.objectOccupancy,
    goalTtlDefaultSec: config.goalTtlDefaultSec,
    collisionAvoidanceRadius: config.collisionAvoidanceRadius,
    stuckTickThreshold: config.stuckTickThreshold,
  };

  // ── Phase 1: Process existing interactions ─────────────────────────────────
  const updatedInteractions: ActiveInteraction[] = [];
  for (const interaction of activeInteractions) {
    const updated = tickInteraction(interaction);
    if (updated) {
      updatedInteractions.push(updated);
    } else {
      // Interaction complete -- apply post-interaction effects
      const initiator = agents.get(interaction.initiatorId);
      const target = agents.get(interaction.targetId);

      if (initiator && target) {
        // Record interaction time
        initiator.runtime.lastInteractionAt = simClock;
        initiator.runtime.lastInteractionPartnerId = target.id;
        initiator.runtime.activeInteractionId = null;

        target.runtime.lastInteractionAt = simClock;
        target.runtime.lastInteractionPartnerId = initiator.id;
        target.runtime.activeInteractionId = null;

        // Post-interaction goal updates
        const initiatorGoal = getPostInteractionGoal(initiator, target, interaction.type);
        if (initiatorGoal) {
          initiator.mind.primaryGoal.type = initiatorGoal.type as AgentModel["mind"]["primaryGoal"]["type"];
          if (initiatorGoal.targetZoneId) {
            initiator.mind.primaryGoal.targetZoneId = initiatorGoal.targetZoneId;
          }
          initiator.runtime.goalStartedAt = simClock;
          initiator.runtime.goalChangedCount++;
          replanFlags.add(initiator.id);
        }

        const targetGoal = getPostInteractionGoal(target, initiator, interaction.type);
        if (targetGoal) {
          target.mind.primaryGoal.type = targetGoal.type as AgentModel["mind"]["primaryGoal"]["type"];
          if (targetGoal.targetZoneId) {
            target.mind.primaryGoal.targetZoneId = targetGoal.targetZoneId;
          }
          target.runtime.goalStartedAt = simClock;
          target.runtime.goalChangedCount++;
          replanFlags.add(target.id);
        }

        // Add to recent events
        pushRecentEvent(initiator, simClock, "interaction_complete", `${interaction.type} with ${target.id}`);
        pushRecentEvent(target, simClock, "interaction_complete", `${interaction.type} with ${initiator.id}`);
      }
    }
  }
  activeInteractions = updatedInteractions;

  // ── Phase 1.5: Queue assignment ───────────────────────────────────────────
  assignQueues(agents, world);

  // ── Phase 2: Per-agent tick ────────────────────────────────────────────────
  for (const [id, agent] of agents) {
    // Skip agents in active interaction (no utility scoring, paused movement in active phase)
    const interactionAnim = getInteractionAnimationState(id, activeInteractions);
    const pausedByInteraction = shouldPauseForInteraction(id, activeInteractions);

    if (pausedByInteraction) {
      agent.runtime.animationState = interactionAnim ?? "talk";
      agent.locomotion.isMoving = false;
      agent.locomotion.speed = 0;
      continue;
    }

    // Approaching phase: turn to face partner but keep moving toward them
    if (interactionAnim === "turn") {
      const interaction = activeInteractions.find(
        (i) => i.initiatorId === id || i.targetId === id,
      );
      if (interaction) {
        const partnerId = interaction.initiatorId === id
          ? interaction.targetId
          : interaction.initiatorId;
        const partner = agents.get(partnerId);
        if (partner) {
          agent.runtime.heading = computeFacingHeading(agent, partner);
          // Move toward interaction partner during approaching phase
          const movement = computeMovement(agent, world, dtSec, true);
          agent.runtime.position = movement.position;
          agent.runtime.velocity = movement.velocity;
          agent.locomotion.isMoving = movement.isMoving;
          agent.locomotion.speed = movement.speed;
        }
      }
      agent.runtime.animationState = "turn";
      continue;
    }

    // Skip seated agents
    if (agent.runtime.animationState === "sit") continue;

    // 1. Observe -> 2. Utility score -> 3. Choose/maintain goal
    const needsReplan = checkReplanConditions(agent, world);

    if (needsReplan || interactionAnim === null) {
      const chosenAction = selectAction(agent, world);
      mapActionToGoal(chosenAction.action, agent, world);
    }

    // 4. Plan/replan path -> 5. Apply movement -> 6. Resolve collisions
    const movement = computeMovement(agent, world, dtSec, needsReplan);

    agent.runtime.position = movement.position;
    agent.runtime.velocity = movement.velocity;
    agent.runtime.heading = movement.heading;
    agent.runtime.currentPath = movement.path;
    agent.locomotion.isMoving = movement.isMoving;
    agent.locomotion.speed = movement.speed;

    // Track blocked state
    if (!movement.isMoving && agent.locomotion.isMoving) {
      agent.locomotion.stuckTickCount++;
      if (agent.locomotion.stuckTickCount > 3) {
        agent.runtime.blocked = true;
      }
    } else {
      agent.locomotion.stuckTickCount = 0;
      agent.runtime.blocked = false;
    }

    // Goal reached
    if (movement.reachedGoal) {
      pushRecentEvent(agent, simClock, "goal_reached", agent.mind.primaryGoal.type);

      // If find_seat and near a chair, sit down
      if (agent.mind.primaryGoal.type === "find_seat" && agent.mind.primaryGoal.targetObjectId) {
        const targetObj = scene.environment.objects.find(
          (o) => o.id === agent.mind.primaryGoal.targetObjectId,
        );
        if (targetObj && (targetObj.type === "chair" || targetObj.type === "sofa")) {
          agent.runtime.animationState = "sit";
          agent.runtime.occupyingObjectId = targetObj.id;
          agent.locomotion.isMoving = false;
          agent.locomotion.speed = 0;
          continue;
        }
      }

      // Default: switch to stay_put after reaching goal
      agent.mind.primaryGoal.type = "stay_put";
      agent.runtime.goalStartedAt = simClock;
      agent.runtime.goalChangedCount++;
    }

    // 7. Update animation state
    // 8. Trigger micro-behaviors
    const microBehavior = rollMicroBehavior(agent, config.microBehaviorChancePerTick);
    agent.runtime.animationState = determineAnimationState(
      agent,
      movement.isMoving,
      microBehavior,
      interactionAnim,
    );

    agent.runtime.lastDecisionAt = simClock;
  }

  // ── Phase 3: Detect new interaction triggers ───────────────────────────────
  const interventionZoneId = useNextStateStore.getState().interventionZoneId ?? null;
  const triggers = [
    ...detectInteractionTriggers(world),
    ...detectSharedReactions(world, interventionZoneId),
  ];
  for (const trigger of triggers) {
    const interaction = createInteraction(trigger, tickMs);
    interaction.startTick = simClock;
    activeInteractions.push(interaction);

    // Mark agents as interacting
    const initiator = agents.get(trigger.initiatorId);
    const target = agents.get(trigger.targetId);
    if (initiator) {
      initiator.runtime.activeInteractionId = interaction.id;
      pushRecentEvent(initiator, simClock, "interaction_start", `${trigger.type} with ${trigger.targetId}`);
    }
    if (target) {
      target.runtime.activeInteractionId = interaction.id;
      pushRecentEvent(target, simClock, "interaction_start", `${trigger.type} with ${trigger.initiatorId}`);
    }
  }

  // ── Phase 4: Update zone/object occupancy ──────────────────────────────────
  const { zoneOccupancy, objectOccupancy } = updateOccupancy(agents, world);

  // ── Commit state ───────────────────────────────────────────────────────────
  useNextStateStore.setState({
    simClock: simClock + dt,
    agents: new Map(agents),
    zoneOccupancy,
    objectOccupancy,
  });

  // ── Phase 5: Check cognitive refresh triggers ─────────────────────────────
  // Fire-and-forget: checkCognitiveRefresh internally gates on
  // cognitiveUpdateWindowSec so this is cheap on most ticks.
  if (!skipCognitive) {
    checkCognitiveRefresh();
  }
}

// ── Recent Events Ring Buffer ──────────────────────────────────────────────────

const MAX_RECENT_EVENTS = 20;

function pushRecentEvent(
  agent: AgentModel,
  tick: number,
  type: string,
  detail?: string,
): void {
  agent.runtime.recentEvents.push({ tick, type, detail });
  if (agent.runtime.recentEvents.length > MAX_RECENT_EVENTS) {
    agent.runtime.recentEvents.shift();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startSimulation(): void {
  if (intervalId !== null) return;

  const store = useNextStateStore.getState();
  const tickMs = store.scene?.simulationConfig.tickIntervalMs ?? 150;

  // Reset engine state
  activeInteractions = [];
  replanFlags.clear();
  zoneQueues.clear();
  clearAllPaths();
  resetInteractionState();

  intervalId = setInterval(() => {
    engineTick(tickMs);
  }, tickMs);
}

export function stopSimulation(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Run N ticks synchronously (for fast-forward).
 * Skips cognitive refresh during batch to avoid API spam.
 */
export function runTicksBatch(count: number, tickMs: number): void {
  for (let i = 0; i < count; i++) {
    engineTick(tickMs, true);
  }
  // Run one cognitive refresh at the end
  checkCognitiveRefresh();
}

/**
 * Force a replan for a specific agent (e.g., after cognitive refresh).
 */
export function requestReplan(agentId: string): void {
  replanFlags.add(agentId);
  invalidatePath(agentId);
}

/**
 * Force all agents to replan (e.g., after intervention).
 */
export function requestGlobalReplan(): void {
  const agents = useNextStateStore.getState().agents;
  for (const id of agents.keys()) {
    replanFlags.add(id);
    invalidatePath(id);
  }
}

/**
 * Get active interactions (for store/inspector use).
 */
export function getActiveInteractions(): ActiveInteraction[] {
  return activeInteractions;
}

/**
 * Remove interactions from the active list (e.g., after intervention cancellation).
 */
export function removeInteractions(idsToRemove: Set<string>): void {
  activeInteractions = activeInteractions.filter((i) => !idsToRemove.has(i.id));
}
