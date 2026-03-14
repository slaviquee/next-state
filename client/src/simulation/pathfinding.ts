import type { Vec3, NavigationGraph, NavNode, NavEdge, AgentModel } from "@next-state/shared";

/**
 * A* pathfinding on the NavigationGraph.
 *
 * Edge weights = baseWeight * congestionMultiplier.
 * Blocked edges are skipped entirely.
 * Paths are cached per agent and invalidated on replan.
 */

// ── Cache ──────────────────────────────────────────────────────────────────────

const pathCache = new Map<string, Vec3[]>();

export function getCachedPath(agentId: string): Vec3[] | undefined {
  return pathCache.get(agentId);
}

export function setCachedPath(agentId: string, path: Vec3[]): void {
  pathCache.set(agentId, path);
}

export function invalidatePath(agentId: string): void {
  pathCache.delete(agentId);
}

export function clearAllPaths(): void {
  pathCache.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function dist2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function closestNodeToPosition(
  position: Vec3,
  nodes: NavNode[],
): NavNode | null {
  let best: NavNode | null = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    const d = dist2d(position, node.position);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

/** Count agents near the midpoint of an edge for congestion weighting. */
function congestionMultiplier(
  fromNode: NavNode,
  toNode: NavNode,
  agents: Map<string, AgentModel>,
  selfId: string,
): number {
  const midX = (fromNode.position.x + toNode.position.x) / 2;
  const midZ = (fromNode.position.z + toNode.position.z) / 2;
  const congestionRadius = 1.5; // meters

  let count = 0;
  for (const [id, agent] of agents) {
    if (id === selfId) continue;
    const dx = agent.runtime.position.x - midX;
    const dz = agent.runtime.position.z - midZ;
    if (dx * dx + dz * dz < congestionRadius * congestionRadius) {
      count++;
    }
  }

  // Linear multiplier: each nearby agent adds 0.3 to the cost
  return 1 + count * 0.3;
}

// ── A* Implementation ──────────────────────────────────────────────────────────

interface AStarEntry {
  nodeId: string;
  gCost: number;
  fCost: number;
  parent: string | null;
}

/**
 * A* pathfinding from `start` position to `goalNodeId` on the NavigationGraph.
 *
 * @returns Array of Vec3 waypoints from start to goal (inclusive), or empty array if unreachable.
 */
export function findPath(
  start: Vec3,
  goalNodeId: string,
  graph: NavigationGraph,
  agents: Map<string, AgentModel>,
  selfId: string,
): Vec3[] {
  const nodeMap = new Map<string, NavNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const goalNode = nodeMap.get(goalNodeId);
  if (!goalNode) return [];

  // Build adjacency list (skip blocked edges)
  const adjacency = new Map<string, { neighborId: string; weight: number }[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.blocked) continue;

    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) continue;

    const congestion = congestionMultiplier(fromNode, toNode, agents, selfId);
    const weight = edge.weight * congestion;

    // Bidirectional edges
    adjacency.get(edge.from)?.push({ neighborId: edge.to, weight });
    adjacency.get(edge.to)?.push({ neighborId: edge.from, weight });
  }

  // Find closest node to start position
  const startNode = closestNodeToPosition(start, graph.nodes);
  if (!startNode) return [];

  // If start is already at goal
  if (startNode.id === goalNodeId) {
    return [{ x: goalNode.position.x, y: 0, z: goalNode.position.z }];
  }

  // A* open set (simple array-based priority queue — sufficient for <100 nodes)
  const openSet: AStarEntry[] = [
    {
      nodeId: startNode.id,
      gCost: 0,
      fCost: dist2d(startNode.position, goalNode.position),
      parent: null,
    },
  ];

  const closedSet = new Set<string>();
  const bestG = new Map<string, number>();
  bestG.set(startNode.id, 0);

  const parentMap = new Map<string, string | null>();
  parentMap.set(startNode.id, null);

  while (openSet.length > 0) {
    // Pick node with lowest fCost
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].fCost < openSet[bestIdx].fCost) {
        bestIdx = i;
      }
    }
    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);

    if (current.nodeId === goalNodeId) {
      // Reconstruct path
      return reconstructPath(current.nodeId, parentMap, nodeMap, start);
    }

    closedSet.add(current.nodeId);

    const neighbors = adjacency.get(current.nodeId);
    if (!neighbors) continue;

    for (const { neighborId, weight } of neighbors) {
      if (closedSet.has(neighborId)) continue;

      const tentativeG = current.gCost + weight;
      const existingG = bestG.get(neighborId) ?? Infinity;

      if (tentativeG < existingG) {
        bestG.set(neighborId, tentativeG);
        parentMap.set(neighborId, current.nodeId);

        const neighborNode = nodeMap.get(neighborId);
        if (!neighborNode) continue;

        const h = dist2d(neighborNode.position, goalNode.position);
        const fCost = tentativeG + h;

        // Check if already in open set
        const existingIdx = openSet.findIndex((e) => e.nodeId === neighborId);
        if (existingIdx >= 0) {
          openSet[existingIdx].gCost = tentativeG;
          openSet[existingIdx].fCost = fCost;
          openSet[existingIdx].parent = current.nodeId;
        } else {
          openSet.push({
            nodeId: neighborId,
            gCost: tentativeG,
            fCost,
            parent: current.nodeId,
          });
        }
      }
    }
  }

  // No path found — target unreachable
  return [];
}

function reconstructPath(
  goalId: string,
  parentMap: Map<string, string | null>,
  nodeMap: Map<string, NavNode>,
  start: Vec3,
): Vec3[] {
  const waypoints: Vec3[] = [];
  let currentId: string | null = goalId;

  while (currentId !== null) {
    const node = nodeMap.get(currentId);
    if (node) {
      waypoints.unshift({ x: node.position.x, y: 0, z: node.position.z });
    }
    currentId = parentMap.get(currentId) ?? null;
  }

  // Prepend the actual start position if it differs from first waypoint
  if (waypoints.length > 0) {
    const first = waypoints[0];
    if (dist2d(start, first) > 0.1) {
      waypoints.unshift({ x: start.x, y: start.y, z: start.z });
    }
  }

  return waypoints;
}

/**
 * Find the closest nav node to a given position.
 */
export function findClosestNode(
  position: Vec3,
  graph: NavigationGraph,
): NavNode | null {
  return closestNodeToPosition(position, graph.nodes);
}

/**
 * Check if a path exists from start to goal (quick reachability check).
 */
export function isReachable(
  start: Vec3,
  goalNodeId: string,
  graph: NavigationGraph,
  agents: Map<string, AgentModel>,
  selfId: string,
): boolean {
  return findPath(start, goalNodeId, graph, agents, selfId).length > 0;
}
