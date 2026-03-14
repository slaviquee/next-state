import type { Vec3, AgentModel } from "@next-state/shared";

/**
 * Steering-based collision avoidance.
 *
 * Each tick, agents check for other agents within collisionAvoidanceRadius.
 * If a neighbor is ahead and within +/-45 deg cone, apply lateral steering force
 * proportional to proximity.
 */

/** Check if a neighbor is within the forward cone of +/-45 degrees. */
function isInForwardCone(
  position: Vec3,
  heading: number,
  neighborPos: Vec3,
): boolean {
  const dx = neighborPos.x - position.x;
  const dz = neighborPos.z - position.z;
  const toNeighborAngle = Math.atan2(dz, dx);
  let angleDiff = toNeighborAngle - heading;

  // Normalize to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // +/- 45 degrees = +/- PI/4
  return Math.abs(angleDiff) < Math.PI / 4;
}

/**
 * Compute collision avoidance adjustment to a velocity vector.
 *
 * @returns Adjusted velocity vector with lateral steering applied.
 */
export function applyCollisionAvoidance(
  agent: AgentModel,
  agents: Map<string, AgentModel>,
  desiredVelocity: Vec3,
  collisionAvoidanceRadius: number,
): Vec3 {
  const radiusSq = collisionAvoidanceRadius * collisionAvoidanceRadius;
  let steerX = 0;
  let steerZ = 0;
  let neighborCount = 0;

  for (const [id, other] of agents) {
    if (id === agent.id) continue;

    const dx = other.runtime.position.x - agent.runtime.position.x;
    const dz = other.runtime.position.z - agent.runtime.position.z;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radiusSq || distSq < 0.001) continue;

    // Check if neighbor is ahead (in forward cone)
    if (!isInForwardCone(agent.runtime.position, agent.runtime.heading, other.runtime.position)) {
      continue;
    }

    const dist = Math.sqrt(distSq);
    // Proximity factor: 1.0 at touching, 0.0 at radius edge
    const proximity = 1.0 - dist / collisionAvoidanceRadius;

    // Lateral steering: perpendicular to the vector toward neighbor.
    // Choose the side that moves us away.
    // Perpendicular to (dx, dz) is (-dz, dx) or (dz, -dx).
    // We choose the one that points away from our heading direction.
    const perpX = -dz / dist;
    const perpZ = dx / dist;

    // Determine which perpendicular direction moves us away
    // by checking dot product with the "away" direction
    const awayX = -dx / dist;
    const awayZ = -dz / dist;
    const dot = perpX * awayX + perpZ * awayZ;

    if (dot >= 0) {
      steerX += perpX * proximity;
      steerZ += perpZ * proximity;
    } else {
      steerX -= perpX * proximity;
      steerZ -= perpZ * proximity;
    }

    neighborCount++;
  }

  if (neighborCount === 0) {
    return desiredVelocity;
  }

  // Normalize steering and apply as a force
  const steerMag = Math.sqrt(steerX * steerX + steerZ * steerZ);
  if (steerMag > 0.001) {
    const steerForce = 0.5; // max lateral push in m/s
    steerX = (steerX / steerMag) * steerForce * Math.min(1, steerMag);
    steerZ = (steerZ / steerMag) * steerForce * Math.min(1, steerMag);
  }

  const adjustedVx = desiredVelocity.x + steerX;
  const adjustedVz = desiredVelocity.z + steerZ;

  // Preserve original speed magnitude
  const originalSpeed = Math.sqrt(
    desiredVelocity.x * desiredVelocity.x +
    desiredVelocity.z * desiredVelocity.z,
  );
  const adjustedSpeed = Math.sqrt(adjustedVx * adjustedVx + adjustedVz * adjustedVz);

  if (adjustedSpeed > 0.001 && originalSpeed > 0.001) {
    const scale = originalSpeed / adjustedSpeed;
    return {
      x: adjustedVx * scale,
      y: 0,
      z: adjustedVz * scale,
    };
  }

  return desiredVelocity;
}
