import type { AgentModel, AgentInteraction } from "@next-state/shared";
import type { WorldState, ActiveInteraction, InteractionPhase } from "./utility";
import { invalidatePath } from "./pathfinding";

/**
 * Interaction state machine.
 *
 * InteractionPhase: approaching (2-4 ticks) -> active (duration from AgentInteraction) -> cooldown (1-2 ticks)
 *
 * Trigger conditions:
 * - Two non-companion agents within 1.5m for >2s and both sociability > 0.4
 * - uncertain_visitor near staff
 * - Multiple agents witness same event (intervention)
 * - Lone agent near group with high attractivenessWeight
 *
 * During active phase: no movement, play talk/gesture animation.
 * After interaction: update goals (e.g., visitor who asked directions -> move_to_exit).
 */

const INTERACTION_RADIUS = 1.5;
const PROXIMITY_TICKS_THRESHOLD = 13; // ~2 seconds at 150ms tick
const APPROACHING_TICKS = 3;
const COOLDOWN_TICKS = 2;

// Track how long pairs have been near each other (for the 2-second proximity rule)
const proximityTracker = new Map<string, number>(); // "agentA|agentB" -> tick count

let nextInteractionId = 1;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ── Trigger Detection ──────────────────────────────────────────────────────────

function dist2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function isInActiveInteraction(agentId: string, interactions: ActiveInteraction[]): boolean {
  return interactions.some(
    (i) =>
      (i.initiatorId === agentId || i.targetId === agentId) &&
      (i.phase === "approaching" || i.phase === "active"),
  );
}

function isOnCooldown(agent: AgentModel, simClock: number): boolean {
  if (agent.runtime.lastInteractionAt === null) return false;
  const elapsed = (simClock - agent.runtime.lastInteractionAt) / 1000;
  return elapsed < agent.social.interactionCooldownSec;
}

export interface InteractionTrigger {
  initiatorId: string;
  targetId: string;
  type: AgentInteraction["type"];
  animationHint: AgentInteraction["animationHint"];
  durationSec: number;
  triggerCondition: string;
}

/**
 * Check all agents for interaction triggers and return new interactions to start.
 */
export function detectInteractionTriggers(
  world: WorldState,
): InteractionTrigger[] {
  const triggers: InteractionTrigger[] = [];
  const agentArray = Array.from(world.agents.values());
  const checked = new Set<string>();

  for (let i = 0; i < agentArray.length; i++) {
    const a = agentArray[i];

    // Skip agents already interacting or on cooldown
    if (isInActiveInteraction(a.id, world.activeInteractions)) continue;
    if (isOnCooldown(a, world.simClock)) continue;

    for (let j = i + 1; j < agentArray.length; j++) {
      const b = agentArray[j];

      if (isInActiveInteraction(b.id, world.activeInteractions)) continue;
      if (isOnCooldown(b, world.simClock)) continue;

      const key = pairKey(a.id, b.id);
      if (checked.has(key)) continue;
      checked.add(key);

      const distance = dist2d(a.runtime.position, b.runtime.position);

      if (distance > INTERACTION_RADIUS) {
        // Reset proximity tracker if too far
        proximityTracker.delete(key);
        continue;
      }

      // Update proximity tracker
      const prevTicks = proximityTracker.get(key) ?? 0;
      proximityTracker.set(key, prevTicks + 1);

      // Check trigger conditions

      // 1. uncertain_visitor near staff
      if (
        (a.mind.archetype === "uncertain_visitor" && b.mind.archetype === "staff") ||
        (b.mind.archetype === "uncertain_visitor" && a.mind.archetype === "staff")
      ) {
        const visitor = a.mind.archetype === "uncertain_visitor" ? a : b;
        const staff = a.mind.archetype === "staff" ? a : b;
        triggers.push({
          initiatorId: visitor.id,
          targetId: staff.id,
          type: "ask_directions",
          animationHint: "face_each_other",
          durationSec: 3,
          triggerCondition: "uncertain_visitor approached staff",
        });
        proximityTracker.delete(key);
        continue;
      }

      // 2. Two non-companion agents near each other for >2 seconds, both sociability > 0.4
      const areCompanions =
        a.social.companionIds.includes(b.id) || b.social.companionIds.includes(a.id);

      if (
        !areCompanions &&
        prevTicks >= PROXIMITY_TICKS_THRESHOLD &&
        a.social.sociability > 0.4 &&
        b.social.sociability > 0.4
      ) {
        // Determine interaction type based on context
        let interactionType: AgentInteraction["type"] = "conversation";
        let hint: AgentInteraction["animationHint"] = "face_each_other";
        let duration = 2 + Math.random() * 3;

        // Staff-customer interaction
        if (
          (a.mind.archetype === "staff" && b.mind.archetype !== "staff") ||
          (b.mind.archetype === "staff" && a.mind.archetype !== "staff")
        ) {
          interactionType = "service_exchange";
          duration = 3 + Math.random() * 2;
        }

        // Greeting if both walking
        if (
          a.runtime.animationState === "walk" &&
          b.runtime.animationState === "walk"
        ) {
          interactionType = "greeting";
          hint = "brief_pause";
          duration = 1 + Math.random();
        }

        triggers.push({
          initiatorId: a.id,
          targetId: b.id,
          type: interactionType,
          animationHint: hint,
          durationSec: duration,
          triggerCondition: `both agents near each other for ${Math.round(prevTicks * 0.15)}s`,
        });
        proximityTracker.delete(key);
        continue;
      }

      // 3. Lone agent near group with high attractivenessWeight
      const aInGroup = a.social.groupId !== undefined;
      const bInGroup = b.social.groupId !== undefined;
      if (aInGroup !== bInGroup) {
        const loner = aInGroup ? b : a;
        const groupMember = aInGroup ? a : b;

        // Check if zone has high attractivenessWeight
        if (groupMember.runtime.occupyingZoneId) {
          const zone = world.environment.semanticZones.find(
            (z) => z.id === groupMember.runtime.occupyingZoneId,
          );
          if (zone && zone.attractivenessWeight > 0.6 && loner.social.sociability > 0.5) {
            triggers.push({
              initiatorId: loner.id,
              targetId: groupMember.id,
              type: "join_group",
              animationHint: "side_by_side",
              durationSec: 4 + Math.random() * 3,
              triggerCondition: "lone agent near attractive group",
            });
            proximityTracker.delete(key);
          }
        }
      }
    }
  }

  return triggers;
}

// ── Interaction Lifecycle ──────────────────────────────────────────────────────

/**
 * Create a new ActiveInteraction from a trigger.
 */
export function createInteraction(
  trigger: InteractionTrigger,
  tickIntervalMs: number,
): ActiveInteraction {
  const id = `interaction_${nextInteractionId++}`;
  const durationTicks = Math.max(1, Math.round((trigger.durationSec * 1000) / tickIntervalMs));

  return {
    id,
    type: trigger.type,
    initiatorId: trigger.initiatorId,
    targetId: trigger.targetId,
    phase: "approaching",
    startTick: 0, // will be set by engine
    durationTicks,
    ticksRemaining: APPROACHING_TICKS + durationTicks + COOLDOWN_TICKS,
  };
}

/**
 * Advance an interaction by one tick. Returns updated interaction or null if complete.
 */
export function tickInteraction(
  interaction: ActiveInteraction,
): ActiveInteraction | null {
  const remaining = interaction.ticksRemaining - 1;

  if (remaining <= 0) {
    return null; // Interaction complete
  }

  // Determine phase based on remaining ticks
  let phase: InteractionPhase = interaction.phase;
  const totalTicks = APPROACHING_TICKS + interaction.durationTicks + COOLDOWN_TICKS;
  const elapsed = totalTicks - remaining;

  if (elapsed < APPROACHING_TICKS) {
    phase = "approaching";
  } else if (elapsed < APPROACHING_TICKS + interaction.durationTicks) {
    phase = "active";
  } else {
    phase = "cooldown";
  }

  return {
    ...interaction,
    phase,
    ticksRemaining: remaining,
  };
}

/**
 * Get the animation state for an agent involved in an interaction.
 */
export function getInteractionAnimationState(
  agentId: string,
  interactions: ActiveInteraction[],
): "talk" | "turn" | "idle" | null {
  for (const interaction of interactions) {
    if (interaction.initiatorId !== agentId && interaction.targetId !== agentId) {
      continue;
    }
    switch (interaction.phase) {
      case "approaching":
        return "turn";
      case "active":
        return "talk";
      case "cooldown":
        return "idle";
    }
  }
  return null;
}

/**
 * Determine if an agent should pause movement due to an active interaction.
 */
export function shouldPauseForInteraction(
  agentId: string,
  interactions: ActiveInteraction[],
): boolean {
  for (const interaction of interactions) {
    if (interaction.initiatorId !== agentId && interaction.targetId !== agentId) {
      continue;
    }
    // Pause during active phase; approaching phase still allows movement
    if (interaction.phase === "active") return true;
  }
  return false;
}

/**
 * Apply post-interaction goal updates.
 * Returns updated goal type if applicable, null otherwise.
 */
export function getPostInteractionGoal(
  agent: AgentModel,
  partner: AgentModel,
  interactionType: string,
): { type: string; targetZoneId?: string } | null {
  // uncertain_visitor who asked staff for directions -> move_to_exit
  if (
    interactionType === "ask_directions" &&
    agent.mind.archetype === "uncertain_visitor" &&
    partner.mind.archetype === "staff"
  ) {
    return { type: "move_to_exit" };
  }

  // Lone agent who joined a group -> follow_companion
  if (interactionType === "join_group" && agent.social.groupId === undefined) {
    return { type: "follow_companion" };
  }

  // After service exchange, customer wanders or finds a seat
  if (interactionType === "service_exchange" && agent.mind.archetype !== "staff") {
    return { type: "find_seat" };
  }

  // After conversation, agents tend to wander
  if (interactionType === "conversation") {
    return { type: "wander" };
  }

  // Shared reaction: reposition to a better vantage point
  if (interactionType === "shared_reaction") {
    return { type: "reposition" };
  }

  return null;
}

/**
 * Turn one agent to face another (for approaching phase).
 */
export function computeFacingHeading(
  agent: AgentModel,
  target: AgentModel,
): number {
  const dx = target.runtime.position.x - agent.runtime.position.x;
  const dz = target.runtime.position.z - agent.runtime.position.z;
  return Math.atan2(dx, dz);
}

/**
 * Clean up proximity tracker entries for agents that no longer exist.
 */
export function cleanupProximityTracker(activeAgentIds: Set<string>): void {
  for (const key of proximityTracker.keys()) {
    const [a, b] = key.split("|");
    if (!activeAgentIds.has(a) || !activeAgentIds.has(b)) {
      proximityTracker.delete(key);
    }
  }
}

/**
 * Cancel all active interactions in a given zone. Both agents immediately
 * enter cooldown and trigger a replan. Returns cancelled interaction IDs.
 */
export function cancelInteractionsInZone(
  zoneId: string,
  activeInteractions: ActiveInteraction[],
  agents: Map<string, AgentModel>,
  simClock: number,
): { remaining: ActiveInteraction[]; cancelledAgentIds: string[] } {
  const remaining: ActiveInteraction[] = [];
  const cancelledAgentIds: string[] = [];

  for (const interaction of activeInteractions) {
    const initiator = agents.get(interaction.initiatorId);
    const target = agents.get(interaction.targetId);

    const initiatorInZone = initiator?.runtime.occupyingZoneId === zoneId;
    const targetInZone = target?.runtime.occupyingZoneId === zoneId;

    if (initiatorInZone || targetInZone) {
      // Cancel — put both agents into cooldown state
      if (initiator) {
        initiator.runtime.lastInteractionAt = simClock;
        initiator.runtime.activeInteractionId = null;
        cancelledAgentIds.push(initiator.id);
      }
      if (target) {
        target.runtime.lastInteractionAt = simClock;
        target.runtime.activeInteractionId = null;
        cancelledAgentIds.push(target.id);
      }
    } else {
      remaining.push(interaction);
    }
  }

  return { remaining, cancelledAgentIds };
}

/**
 * Reset all interaction state (e.g., when scene is reloaded).
 */
export function resetInteractionState(): void {
  proximityTracker.clear();
  nextInteractionId = 1;
}
