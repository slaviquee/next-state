import { describe, it, expect, beforeEach } from "vitest";
import type { AgentModel, NavigationGraph } from "@next-state/shared";
import {
  findPath,
  findClosestNode,
  isReachable,
  clearAllPaths,
} from "../pathfinding";

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeGraph(): NavigationGraph {
  // Simple diamond graph:
  //       n1
  //      / \
  //    n2   n3
  //      \ /
  //       n4
  return {
    nodes: [
      { id: "n1", position: { x: 5, z: 0 } },
      { id: "n2", position: { x: 0, z: 5 } },
      { id: "n3", position: { x: 10, z: 5 } },
      { id: "n4", position: { x: 5, z: 10 } },
    ],
    edges: [
      { from: "n1", to: "n2", weight: 1, blocked: false },
      { from: "n1", to: "n3", weight: 1, blocked: false },
      { from: "n2", to: "n4", weight: 1, blocked: false },
      { from: "n3", to: "n4", weight: 1, blocked: false },
    ],
  };
}

function makeLinearGraph(): NavigationGraph {
  return {
    nodes: [
      { id: "n1", position: { x: 0, z: 0 } },
      { id: "n2", position: { x: 5, z: 0 } },
      { id: "n3", position: { x: 10, z: 0 } },
    ],
    edges: [
      { from: "n1", to: "n2", weight: 1, blocked: false },
      { from: "n2", to: "n3", weight: 1, blocked: false },
    ],
  };
}

const emptyAgents = new Map<string, AgentModel>();

beforeEach(() => {
  clearAllPaths();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("findClosestNode", () => {
  it("finds nearest node to position", () => {
    const graph = makeGraph();
    const node = findClosestNode({ x: 4, y: 0, z: 1 }, graph);
    expect(node).not.toBeNull();
    expect(node!.id).toBe("n1");
  });

  it("returns null for empty graph", () => {
    const node = findClosestNode({ x: 0, y: 0, z: 0 }, { nodes: [], edges: [] });
    expect(node).toBeNull();
  });
});

describe("findPath", () => {
  it("finds direct path between adjacent nodes", () => {
    const graph = makeLinearGraph();
    const path = findPath({ x: 0, y: 0, z: 0 }, "n2", graph, emptyAgents, "self");
    expect(path.length).toBeGreaterThan(0);
    // Last waypoint should be at n2's position
    const last = path[path.length - 1];
    expect(last.x).toBe(5);
    expect(last.z).toBe(0);
  });

  it("finds multi-hop path", () => {
    const graph = makeLinearGraph();
    const path = findPath({ x: 0, y: 0, z: 0 }, "n3", graph, emptyAgents, "self");
    expect(path.length).toBeGreaterThanOrEqual(2);
    const last = path[path.length - 1];
    expect(last.x).toBe(10);
    expect(last.z).toBe(0);
  });

  it("returns empty array when goal node doesn't exist", () => {
    const graph = makeGraph();
    const path = findPath({ x: 5, y: 0, z: 0 }, "nonexistent", graph, emptyAgents, "self");
    expect(path).toEqual([]);
  });

  it("returns single waypoint when already at goal", () => {
    const graph = makeGraph();
    const path = findPath({ x: 5, y: 0, z: 0 }, "n1", graph, emptyAgents, "self");
    expect(path.length).toBe(1);
  });

  it("avoids blocked edges", () => {
    const graph = makeGraph();
    // Block the direct n1->n2 edge
    graph.edges[0].blocked = true;

    const path = findPath({ x: 5, y: 0, z: 0 }, "n2", graph, emptyAgents, "self");
    // Should go n1->n3->n4->n2 instead of direct n1->n2
    expect(path.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty when completely blocked", () => {
    const graph: NavigationGraph = {
      nodes: [
        { id: "n1", position: { x: 0, z: 0 } },
        { id: "n2", position: { x: 5, z: 0 } },
      ],
      edges: [
        { from: "n1", to: "n2", weight: 1, blocked: true },
      ],
    };
    const path = findPath({ x: 0, y: 0, z: 0 }, "n2", graph, emptyAgents, "self");
    expect(path).toEqual([]);
  });
});

describe("isReachable", () => {
  it("returns true for connected nodes", () => {
    const graph = makeGraph();
    expect(isReachable({ x: 5, y: 0, z: 0 }, "n4", graph, emptyAgents, "self")).toBe(true);
  });

  it("returns false when path is blocked", () => {
    const graph: NavigationGraph = {
      nodes: [
        { id: "n1", position: { x: 0, z: 0 } },
        { id: "n2", position: { x: 5, z: 0 } },
      ],
      edges: [
        { from: "n1", to: "n2", weight: 1, blocked: true },
      ],
    };
    expect(isReachable({ x: 0, y: 0, z: 0 }, "n2", graph, emptyAgents, "self")).toBe(false);
  });
});
