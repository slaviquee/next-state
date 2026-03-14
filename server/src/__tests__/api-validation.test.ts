import { describe, it, expect } from "vitest";
import {
  InterventionRequestSchema,
  AgentRefreshRequestSchema,
  CompileSceneRequestSchema,
  RuntimeSnapshotSchema,
} from "@next-state/shared";

describe("InterventionRequestSchema", () => {
  it("validates block_corridor request", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_abc",
      type: "block_corridor",
      params: { zoneId: "zone_main_corridor" },
    });
    expect(result.success).toBe(true);
  });

  it("validates move_table request", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_abc",
      type: "move_table",
      params: { objectId: "obj_1", newPosition: { x: 5, y: 0, z: 5 } },
    });
    expect(result.success).toBe(true);
  });

  it("validates mark_congested request", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_abc",
      type: "mark_congested",
      params: { zoneId: "zone_1" },
    });
    expect(result.success).toBe(true);
  });

  it("validates make_exit_attractive request", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_abc",
      type: "make_exit_attractive",
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing sceneId", () => {
    const result = InterventionRequestSchema.safeParse({
      type: "block_corridor",
      params: { zoneId: "zone_1" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = InterventionRequestSchema.safeParse({
      sceneId: "scene_abc",
      type: "teleport_everyone",
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentRefreshRequestSchema", () => {
  const validRequest = {
    sceneId: "scene_abc",
    agents: ["a1", "a2"],
    eventContext: {
      type: "periodic_refresh",
      summary: "Test refresh",
    },
    runtimeSnapshot: {
      simClock: 15000,
      agentStates: {
        a1: {
          position: { x: 5, y: 0, z: 5 },
          heading: 1.5,
          currentGoal: "wander",
          animationState: "walk",
          blocked: false,
          stuckTickCount: 0,
          goalStartedAt: 10000,
          lastInteractionAt: null,
        },
      },
      blockedEdges: ["n1->n2"],
      recentEvents: [{ tick: 14000, type: "goal_reached", detail: "wander" }],
    },
  };

  it("accepts valid refresh request", () => {
    const result = AgentRefreshRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("rejects invalid goal type in agent states", () => {
    const modified = structuredClone(validRequest);
    modified.runtimeSnapshot.agentStates.a1.currentGoal = "invalid_goal";
    const result = AgentRefreshRequestSchema.safeParse(modified);
    expect(result.success).toBe(false);
  });

  it("rejects invalid animation state in agent states", () => {
    const modified = structuredClone(validRequest);
    modified.runtimeSnapshot.agentStates.a1.animationState = "flying";
    const result = AgentRefreshRequestSchema.safeParse(modified);
    expect(result.success).toBe(false);
  });

  it("accepts all valid goal types", () => {
    const goalTypes = [
      "stay_put", "find_seat", "follow_companion",
      "approach_counter", "move_to_exit",
      "wait_for_someone", "wander", "reposition", "avoid_crowd",
    ];
    for (const goal of goalTypes) {
      const modified = structuredClone(validRequest);
      modified.runtimeSnapshot.agentStates.a1.currentGoal = goal;
      const result = AgentRefreshRequestSchema.safeParse(modified);
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid animation states", () => {
    const states = [
      "idle", "walk", "sit", "turn", "wait",
      "react", "talk", "glance", "fidget",
    ];
    for (const state of states) {
      const modified = structuredClone(validRequest);
      modified.runtimeSnapshot.agentStates.a1.animationState = state;
      const result = AgentRefreshRequestSchema.safeParse(modified);
      expect(result.success).toBe(true);
    }
  });
});

describe("CompileSceneRequestSchema", () => {
  it("accepts valid request", () => {
    expect(
      CompileSceneRequestSchema.safeParse({ jobId: "job_123" }).success,
    ).toBe(true);
  });

  it("rejects missing jobId", () => {
    expect(CompileSceneRequestSchema.safeParse({}).success).toBe(false);
  });
});
