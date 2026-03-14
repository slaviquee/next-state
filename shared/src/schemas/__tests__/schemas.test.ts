import { describe, it, expect } from "vitest";
import {
  Vec3Schema,
  Point2DSchema,
  LikelyActionSchema,
  SpatialEstimateSchema,
} from "../primitives.js";
import { NavNodeSchema, NavEdgeSchema, NavigationGraphSchema } from "../navigation.js";
import { SceneObjectSchema, SemanticZoneSchema } from "../environment.js";
import {
  AgentGoalTypeSchema,
  AgentGoalSchema,
  AgentModelSchema,
  AgentInteractionSchema,
} from "../agent.js";
import { SimulationConfigSchema, CompiledScenePackageSchema } from "../scene.js";
import {
  AgentSnapshotSchema,
  RuntimeSnapshotSchema,
  AgentRefreshRequestSchema,
  InterventionRequestSchema,
} from "../api.js";

// ── Primitives ─────────────────────────────────────────────────────────────

describe("Vec3Schema", () => {
  it("accepts valid Vec3", () => {
    const result = Vec3Schema.safeParse({ x: 1, y: 2, z: 3 });
    expect(result.success).toBe(true);
  });

  it("rejects missing field", () => {
    const result = Vec3Schema.safeParse({ x: 1, y: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects non-number", () => {
    const result = Vec3Schema.safeParse({ x: "a", y: 2, z: 3 });
    expect(result.success).toBe(false);
  });
});

describe("LikelyActionSchema", () => {
  it("accepts valid action", () => {
    const result = LikelyActionSchema.safeParse({ label: "Walk", probability: 0.6 });
    expect(result.success).toBe(true);
  });

  it("rejects probability > 1", () => {
    const result = LikelyActionSchema.safeParse({ label: "Walk", probability: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects probability < 0", () => {
    const result = LikelyActionSchema.safeParse({ label: "Walk", probability: -0.1 });
    expect(result.success).toBe(false);
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────

describe("NavigationGraphSchema", () => {
  it("accepts valid graph", () => {
    const result = NavigationGraphSchema.safeParse({
      nodes: [
        { id: "n1", position: { x: 0, z: 0 } },
        { id: "n2", position: { x: 5, z: 5 }, zoneId: "zone_1" },
      ],
      edges: [{ from: "n1", to: "n2", weight: 1.0, blocked: false }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty graph", () => {
    const result = NavigationGraphSchema.safeParse({ nodes: [], edges: [] });
    expect(result.success).toBe(true);
  });
});

// ── Agent ──────────────────────────────────────────────────────────────────

describe("AgentGoalTypeSchema", () => {
  it("accepts all valid goal types", () => {
    const types = [
      "stay_put", "find_seat", "follow_companion",
      "approach_counter", "move_to_exit",
      "wait_for_someone", "wander", "reposition", "avoid_crowd",
    ];
    for (const t of types) {
      expect(AgentGoalTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects invalid goal type", () => {
    expect(AgentGoalTypeSchema.safeParse("dance").success).toBe(false);
  });
});

describe("AgentGoalSchema", () => {
  it("accepts minimal goal", () => {
    const result = AgentGoalSchema.safeParse({
      type: "wander",
      urgency: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts goal with all optional fields", () => {
    const result = AgentGoalSchema.safeParse({
      type: "find_seat",
      urgency: 0.8,
      targetZoneId: "zone_1",
      targetObjectId: "obj_1",
      targetAgentId: "a1",
      ttlSec: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects urgency out of range", () => {
    expect(AgentGoalSchema.safeParse({ type: "wander", urgency: 1.5 }).success).toBe(false);
    expect(AgentGoalSchema.safeParse({ type: "wander", urgency: -0.1 }).success).toBe(false);
  });
});

describe("AgentInteractionSchema", () => {
  it("accepts yield_space and shared_reaction types", () => {
    for (const type of ["yield_space", "shared_reaction"]) {
      const result = AgentInteractionSchema.safeParse({
        type,
        initiatorId: "a1",
        targetId: "a2",
        durationSec: 2,
        animationHint: "face_each_other",
        triggerCondition: "test",
      });
      expect(result.success).toBe(true);
    }
  });
});

// ── SimulationConfig ───────────────────────────────────────────────────────

describe("SimulationConfigSchema", () => {
  const validConfig = {
    tickIntervalMs: 150,
    maxAgents: 50,
    pathfindingAlgorithm: "astar" as const,
    collisionAvoidanceRadius: 0.5,
    cognitiveUpdateWindowSec: 5,
    maxCognitiveUpdatesPerWindow: 3,
    microBehaviorChancePerTick: 0.05,
    goalTtlDefaultSec: 30,
    stuckTickThreshold: 5,
  };

  it("accepts valid config", () => {
    expect(SimulationConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("rejects tickIntervalMs < 100", () => {
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, tickIntervalMs: 50 }).success,
    ).toBe(false);
  });

  it("rejects tickIntervalMs > 200", () => {
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, tickIntervalMs: 250 }).success,
    ).toBe(false);
  });

  it("rejects microBehaviorChancePerTick > 1", () => {
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, microBehaviorChancePerTick: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects microBehaviorChancePerTick < 0", () => {
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, microBehaviorChancePerTick: -0.1 }).success,
    ).toBe(false);
  });

  it("accepts boundary values", () => {
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, tickIntervalMs: 100 }).success,
    ).toBe(true);
    expect(
      SimulationConfigSchema.safeParse({ ...validConfig, tickIntervalMs: 200 }).success,
    ).toBe(true);
  });
});

// ── API Schemas ────────────────────────────────────────────────────────────

describe("AgentSnapshotSchema", () => {
  it("accepts valid snapshot with typed goal and animation", () => {
    const result = AgentSnapshotSchema.safeParse({
      position: { x: 1, y: 0, z: 2 },
      heading: 1.5,
      currentGoal: "find_seat",
      animationState: "walk",
      blocked: false,
      stuckTickCount: 0,
      goalStartedAt: 1000,
      lastInteractionAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid goal type in snapshot", () => {
    const result = AgentSnapshotSchema.safeParse({
      position: { x: 1, y: 0, z: 2 },
      heading: 1.5,
      currentGoal: "invalid_goal",
      animationState: "walk",
      blocked: false,
      stuckTickCount: 0,
      goalStartedAt: 1000,
      lastInteractionAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid animation state in snapshot", () => {
    const result = AgentSnapshotSchema.safeParse({
      position: { x: 1, y: 0, z: 2 },
      heading: 1.5,
      currentGoal: "wander",
      animationState: "running",
      blocked: false,
      stuckTickCount: 0,
      goalStartedAt: 1000,
      lastInteractionAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("InterventionRequestSchema", () => {
  it("accepts all intervention types", () => {
    const types = ["block_corridor", "add_people", "move_table", "mark_congested", "make_exit_attractive"];
    for (const type of types) {
      const result = InterventionRequestSchema.safeParse({
        sceneId: "scene_1",
        type,
        params: {},
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown intervention type", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_1",
      type: "explode_building",
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

// ── Round-trip parsing ─────────────────────────────────────────────────────

describe("Round-trip parsing", () => {
  it("parse → serialize → parse produces identical result for SceneObject", () => {
    const input = {
      id: "obj_1",
      type: "chair",
      position: { x: 1, y: 0, z: 2 },
      rotationY: 0,
      scale: { x: 1, y: 1, z: 1 },
      interactable: true,
      blocksMovement: false,
      occupiedByAgentId: null,
    };
    const parsed = SceneObjectSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const reparsed = SceneObjectSchema.parse(serialized);
    expect(reparsed).toEqual(parsed);
  });

  it("parse → serialize → parse produces identical result for SemanticZone", () => {
    const input = {
      id: "zone_1",
      type: "service",
      polygon: { points: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }] },
      attractivenessWeight: 0.7,
      capacity: 10,
      occupantIds: ["a1", "a2"],
      queueIds: ["a3"],
    };
    const parsed = SemanticZoneSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const reparsed = SemanticZoneSchema.parse(serialized);
    expect(reparsed).toEqual(parsed);
  });
});
