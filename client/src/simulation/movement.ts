import type { Vec3, AgentModel, NavigationGraph } from "@next-state/shared";
import { findPath, getCachedPath, setCachedPath, invalidatePath, findClosestNode } from "./pathfinding";
import { applyCollisionAvoidance } from "./collision";
import type { WorldState } from "./utility";

/**
 * Full movement stack per tick:
 * 1. A* pathfinding (cached, recompute on replan)
 * 2. Steer toward next waypoint
 * 3. Collision avoidance
 * 4. Speed modulation (slow in dense zones, fast in open)
 * 5. Group following (companions match leader speed, maintain 0.5-1.5m offset)
 * 6. Queue behavior (agents approaching service zone form line by arrival order)
 */

export interface MovementResult {
  position: Vec3;
  velocity: Vec3;
  heading: number;
  path: Vec3[];
  isMoving: boolean;
  speed: number;
  reachedWaypoint: boolean;
  reachedGoal: boolean;
}

const WAYPOINT_ARRIVAL_THRESHOLD = 0.3; // meters
const BASE_WALK_SPEED = 1.2; // m/s
const QUEUE_SPACING = 0.8; // meters between queued agents

function dist2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// ── Path Planning ──────────────────────────────────────────────────────────────

function getOrPlanPath(
  agent: AgentModel,
  world: WorldState,
  needsReplan: boolean,
): Vec3[] {
  if (!needsReplan) {
    const cached = getCachedPath(agent.id);
    if (cached && cached.length > 0) return cached;
  }

  // Determine goal node
  const goalNodeId = findGoalNodeId(agent, world);
  if (!goalNodeId) return [];

  const path = findPath(
    agent.runtime.position,
    goalNodeId,
    world.navGraph,
    world.agents,
    agent.id,
  );

  setCachedPath(agent.id, path);
  return path;
}

function findGoalNodeId(agent: AgentModel, world: WorldState): string | null {
  const goal = agent.mind.primaryGoal;

  // For follow_companion, find node closest to companion
  if (goal.type === "follow_companion" && goal.targetAgentId) {
    const companion = world.agents.get(goal.targetAgentId);
    if (companion) {
      const node = findClosestNode(companion.runtime.position, world.navGraph);
      return node?.id ?? null;
    }
  }

  // For zone-targeted goals
  if (goal.targetZoneId) {
    for (const node of world.navGraph.nodes) {
      if (node.zoneId === goal.targetZoneId) return node.id;
    }
  }

  // For object-targeted goals
  if (goal.targetObjectId) {
    const obj = world.environment.objects.find((o) => o.id === goal.targetObjectId);
    if (obj) {
      const node = findClosestNode(obj.position, world.navGraph);
      return node?.id ?? null;
    }
  }

  // For wander: pick a random walkable node
  if (goal.type === "wander" || goal.type === "reposition" || goal.type === "avoid_crowd") {
    const nodes = world.navGraph.nodes;
    if (nodes.length > 0) {
      return nodes[Math.floor(Math.random() * nodes.length)].id;
    }
  }

  // For move_to_exit
  if (goal.type === "move_to_exit") {
    const exits = world.environment.exits;
    if (exits.length > 0) {
      const exit = exits[0];
      const node = findClosestNode(exit.position, world.navGraph);
      return node?.id ?? null;
    }
  }

  return null;
}

// ── Speed Modulation ───────────────────────────────────────────────────────────

function computeSpeed(
  agent: AgentModel,
  world: WorldState,
): number {
  const baseSpeed = Math.min(agent.locomotion.maxSpeed, BASE_WALK_SPEED);

  // Count nearby agents for density-based slowdown
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

  // Slow down in dense areas: 100% speed at 0 neighbors, 40% at 5+
  const densityFactor = Math.max(0.4, 1.0 - nearbyCount * 0.12);

  return baseSpeed * densityFactor;
}

// ── Group Following ────────────────────────────────────────────────────────────

function applyGroupFollowing(
  agent: AgentModel,
  velocity: Vec3,
  speed: number,
  world: WorldState,
): { velocity: Vec3; speed: number } {
  if (agent.social.companionIds.length === 0 || agent.social.followTendency < 0.2) {
    return { velocity, speed };
  }

  // Find the "leader" — the companion farthest ahead in their path
  let leader: AgentModel | null = null;
  let maxDist = 0;

  for (const cid of agent.social.companionIds) {
    const companion = world.agents.get(cid);
    if (!companion) continue;
    const d = dist2d(agent.runtime.position, companion.runtime.position);
    if (d > maxDist) {
      maxDist = d;
      leader = companion;
    }
  }

  if (!leader || maxDist < 0.5) return { velocity, speed };

  // If companion is too far (> 1.5m), steer toward them maintaining offset
  if (maxDist > 1.5) {
    const dx = leader.runtime.position.x - agent.runtime.position.x;
    const dz = leader.runtime.position.z - agent.runtime.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Target position: 0.5-1.0m behind the leader
    const targetDist = 0.75;
    const offsetX = -dx / dist * targetDist;
    const offsetZ = -dz / dist * targetDist;
    const targetX = leader.runtime.position.x + offsetX;
    const targetZ = leader.runtime.position.z + offsetZ;

    const toTargetX = targetX - agent.runtime.position.x;
    const toTargetZ = targetZ - agent.runtime.position.z;
    const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);

    if (toTargetDist > 0.1) {
      const blendFactor = agent.social.followTendency * 0.5;
      const blendedVx = velocity.x * (1 - blendFactor) + (toTargetX / toTargetDist) * speed * blendFactor;
      const blendedVz = velocity.z * (1 - blendFactor) + (toTargetZ / toTargetDist) * speed * blendFactor;

      return {
        velocity: { x: blendedVx, y: 0, z: blendedVz },
        speed: Math.max(speed, leader.locomotion.speed * 0.9), // match leader speed
      };
    }
  }

  return { velocity, speed };
}

// ── Queue Behavior ─────────────────────────────────────────────────────────────

function applyQueueBehavior(
  agent: AgentModel,
  velocity: Vec3,
  world: WorldState,
): Vec3 {
  if (agent.runtime.queueTargetZoneId === null || agent.runtime.queuePosition === null) {
    return velocity;
  }

  // Find the service zone
  const zone = world.environment.semanticZones.find(
    (z) => z.id === agent.runtime.queueTargetZoneId,
  );
  if (!zone || zone.type !== "service") return velocity;

  // Get the zone center as the service point
  const zoneCenter = { x: 0, z: 0 };
  for (const pt of zone.polygon.points) {
    zoneCenter.x += pt.x;
    zoneCenter.z += pt.z;
  }
  zoneCenter.x /= zone.polygon.points.length;
  zoneCenter.z /= zone.polygon.points.length;

  // Queue position: line up behind the service point
  // Position 0 = at service point, position N = N * QUEUE_SPACING meters back
  const queueOffset = agent.runtime.queuePosition * QUEUE_SPACING;

  // Direction from zone center outward (we'll pick a consistent direction)
  const queueDirX = 0; // Queue extends in -z direction from service point
  const queueDirZ = -1;

  const targetX = zoneCenter.x + queueDirX * queueOffset;
  const targetZ = zoneCenter.z + queueDirZ * queueOffset;

  const dx = targetX - agent.runtime.position.x;
  const dz = targetZ - agent.runtime.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.2) {
    // Already at queue position, stop
    return { x: 0, y: 0, z: 0 };
  }

  // Steer toward queue position
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  if (speed < 0.01) return velocity;

  return {
    x: (dx / dist) * speed * 0.5, // slow queue approach
    y: 0,
    z: (dz / dist) * speed * 0.5,
  };
}

// ── Main Movement Function ─────────────────────────────────────────────────────

/**
 * Execute the full movement stack for a single agent for one tick.
 */
export function computeMovement(
  agent: AgentModel,
  world: WorldState,
  dtSec: number,
  needsReplan: boolean,
): MovementResult {
  // Agents that are sitting, talking, or in active interaction don't move
  if (
    agent.runtime.animationState === "sit" ||
    agent.runtime.animationState === "talk"
  ) {
    return {
      position: { ...agent.runtime.position },
      velocity: { x: 0, y: 0, z: 0 },
      heading: agent.runtime.heading,
      path: agent.runtime.currentPath,
      isMoving: false,
      speed: 0,
      reachedWaypoint: false,
      reachedGoal: false,
    };
  }

  // 1. Get/plan path
  const path = getOrPlanPath(agent, world, needsReplan);

  if (path.length === 0) {
    return {
      position: { ...agent.runtime.position },
      velocity: { x: 0, y: 0, z: 0 },
      heading: agent.runtime.heading,
      path: [],
      isMoving: false,
      speed: 0,
      reachedWaypoint: false,
      reachedGoal: false,
    };
  }

  // Find the current waypoint to steer toward (first waypoint we haven't reached)
  let waypointIdx = 0;
  for (let i = 0; i < path.length; i++) {
    if (dist2d(agent.runtime.position, path[i]) > WAYPOINT_ARRIVAL_THRESHOLD) {
      waypointIdx = i;
      break;
    }
    waypointIdx = i + 1;
  }

  const reachedGoal = waypointIdx >= path.length;
  if (reachedGoal) {
    invalidatePath(agent.id);
    return {
      position: { ...agent.runtime.position },
      velocity: { x: 0, y: 0, z: 0 },
      heading: agent.runtime.heading,
      path: [],
      isMoving: false,
      speed: 0,
      reachedWaypoint: true,
      reachedGoal: true,
    };
  }

  const target = path[waypointIdx];

  // 2. Steer toward next waypoint
  const dx = target.x - agent.runtime.position.x;
  const dz = target.z - agent.runtime.position.z;
  const distToTarget = Math.sqrt(dx * dx + dz * dz);

  // 4. Speed modulation
  let speed = computeSpeed(agent, world);

  // Slow down when approaching waypoint
  if (distToTarget < 0.5) {
    speed *= distToTarget / 0.5;
  }

  let desiredVelocity: Vec3;
  if (distToTarget > 0.01) {
    desiredVelocity = {
      x: (dx / distToTarget) * speed,
      y: 0,
      z: (dz / distToTarget) * speed,
    };
  } else {
    desiredVelocity = { x: 0, y: 0, z: 0 };
  }

  // 3. Collision avoidance
  let velocity = applyCollisionAvoidance(
    agent,
    world.agents,
    desiredVelocity,
    world.collisionAvoidanceRadius,
  );

  // 5. Group following
  const grouped = applyGroupFollowing(agent, velocity, speed, world);
  velocity = grouped.velocity;
  speed = grouped.speed;

  // 6. Queue behavior
  velocity = applyQueueBehavior(agent, velocity, world);

  // Apply movement
  const newPosition: Vec3 = {
    x: agent.runtime.position.x + velocity.x * dtSec,
    y: agent.runtime.position.y,
    z: agent.runtime.position.z + velocity.z * dtSec,
  };

  // Clamp to environment bounds
  const bounds = world.environment.bounds;
  newPosition.x = Math.max(0, Math.min(bounds.width, newPosition.x));
  newPosition.z = Math.max(0, Math.min(bounds.depth, newPosition.z));

  // Compute heading from velocity
  const velMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  const heading = velMag > 0.01
    ? Math.atan2(velocity.x, velocity.z) // note: atan2(x,z) for Y-up heading
    : agent.runtime.heading;

  const reachedWaypoint = dist2d(newPosition, target) < WAYPOINT_ARRIVAL_THRESHOLD;

  // Trim completed waypoints from path
  const remainingPath = reachedWaypoint ? path.slice(waypointIdx + 1) : path.slice(waypointIdx);
  if (reachedWaypoint) {
    setCachedPath(agent.id, remainingPath);
  }

  return {
    position: newPosition,
    velocity,
    heading,
    path: remainingPath,
    isMoving: velMag > 0.05,
    speed: velMag,
    reachedWaypoint,
    reachedGoal: reachedWaypoint && waypointIdx >= path.length - 1,
  };
}
