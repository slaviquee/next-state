import { describe, it, expect } from "vitest";
import type { AgentModel, EnvironmentModel, NavigationGraph } from "@next-state/shared";
import {
  selectAction,
  getAllScores,
  boredomFactor,
  goalMatch,
  localDensity,
  interactionCooldownOk,
  type WorldState,
} from "../utility";

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentModel> = {}): AgentModel {
  return {
    id: "a1",
    visual: {
      assetId: "char_1",
      gender: "male",
      ageGroup: "adult",
      bodyType: "medium",
      heightBucket: "average",
      clothingColors: { top: "#333", bottom: "#666" },
      clothingStyle: "casual",
      props: [],
      initialPose: "standing",
      spatialEstimate: {
        position3d: { x: 0, y: 0, z: 0 },
        confidence3d: 0.8,
        projectionSource: "heuristic_2d",
        videoBoundingBox: { yMin: 0, xMin: 0, yMax: 0, xMax: 0 },
      },
    },
    social: {
      companionIds: [],
      followTendency: 0.3,
      sociability: 0.5,
      interactionCooldownSec: 10,
    },
    mind: {
      archetype: "waiting_guest",
      primaryGoal: { type: "stay_put", urgency: 0.5 },
      currentIntent: "waiting",
      arousal: 0.5,
      patience: 0.5,
      curiosity: 0.5,
      conformity: 0.5,
      reactionStyle: "calm",
      likelyNextActions: [{ label: "Wait", probability: 1.0 }],
      confidence: 0.8,
    },
    locomotion: {
      speed: 0,
      maxSpeed: 1.4,
      acceleration: 0.5,
      isMoving: false,
      isBlocked: false,
      stuckTickCount: 0,
    },
    runtime: {
      position: { x: 5, y: 0, z: 5 },
      velocity: { x: 0, y: 0, z: 0 },
      heading: 0,
      currentPath: [],
      animationState: "idle",
      blocked: false,
      lastDecisionAt: 0,
      nextMindRefreshAt: 5000,
      goalStartedAt: 0,
      goalChangedCount: 0,
      lastInteractionAt: null,
      lastInteractionPartnerId: null,
      activeInteractionId: null,
      occupyingObjectId: null,
      occupyingZoneId: null,
      queuePosition: null,
      queueTargetZoneId: null,
      recentEvents: [],
    },
    ...overrides,
  } as AgentModel;
}

function makeWorld(agents: AgentModel[] = []): WorldState {
  const agentMap = new Map<string, AgentModel>();
  for (const a of agents) agentMap.set(a.id, a);

  return {
    environment: {
      spaceType: "cafe",
      bounds: { width: 20, depth: 15, height: 3 },
      floorPlan: { points: [] },
      walkableZones: [],
      blockedZones: [],
      entrances: [],
      exits: [],
      objects: [],
      semanticZones: [],
      navigationGraph: { nodes: [], edges: [] },
    } as EnvironmentModel,
    agents: agentMap,
    activeInteractions: [],
    simClock: 10000,
    navGraph: { nodes: [], edges: [] },
    zoneOccupancy: new Map(),
    objectOccupancy: new Map(),
    goalTtlDefaultSec: 30,
    collisionAvoidanceRadius: 0.5,
    stuckTickThreshold: 5,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("goalMatch", () => {
  it("returns 1.0 when goal type matches", () => {
    const agent = makeAgent();
    agent.mind.primaryGoal.type = "wander";
    expect(goalMatch(agent, "wander", "stay_put")).toBe(1.0);
  });

  it("returns 0.1 when no match", () => {
    const agent = makeAgent();
    agent.mind.primaryGoal.type = "wander";
    expect(goalMatch(agent, "find_seat")).toBe(0.1);
  });
});

describe("boredomFactor", () => {
  it("returns 0 at start of goal", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    agent.runtime.goalStartedAt = world.simClock;
    expect(boredomFactor(agent, world)).toBe(0);
  });

  it("increases over time", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    agent.runtime.goalStartedAt = world.simClock - 15000; // 15s ago
    const factor = boredomFactor(agent, world);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThanOrEqual(1);
  });

  it("reaches 1.0 after TTL expires", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    agent.mind.patience = 1.0;
    agent.runtime.goalStartedAt = world.simClock - 60000; // 60s ago (TTL is 30s)
    expect(boredomFactor(agent, world)).toBe(1);
  });

  it("patient agents have lower boredom", () => {
    const patient = makeAgent();
    patient.mind.patience = 0.9;
    const impatient = makeAgent({ id: "a2" } as Partial<AgentModel>);
    impatient.mind.patience = 0.1;

    const world = makeWorld([patient, impatient]);
    patient.runtime.goalStartedAt = world.simClock - 10000;
    impatient.runtime.goalStartedAt = world.simClock - 10000;

    expect(boredomFactor(patient, world)).toBeLessThan(boredomFactor(impatient, world));
  });
});

describe("localDensity", () => {
  it("returns 0 when alone", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    expect(localDensity(agent, world)).toBe(0);
  });

  it("increases with nearby agents", () => {
    const agent = makeAgent();
    const others = Array.from({ length: 3 }, (_, i) => {
      const a = makeAgent({ id: `a${i + 2}` } as Partial<AgentModel>);
      a.runtime.position = { x: 5.2 + i * 0.1, y: 0, z: 5.2 };
      return a;
    });
    const world = makeWorld([agent, ...others]);
    expect(localDensity(agent, world)).toBeGreaterThan(0);
  });

  it("caps at 1.0", () => {
    const agent = makeAgent();
    const others = Array.from({ length: 10 }, (_, i) => {
      const a = makeAgent({ id: `a${i + 2}` } as Partial<AgentModel>);
      a.runtime.position = { x: 5 + i * 0.05, y: 0, z: 5 };
      return a;
    });
    const world = makeWorld([agent, ...others]);
    expect(localDensity(agent, world)).toBeLessThanOrEqual(1);
  });
});

describe("interactionCooldownOk", () => {
  it("returns 1.0 if never interacted", () => {
    const agent = makeAgent();
    expect(interactionCooldownOk(agent)).toBe(1.0);
  });

  it("returns 0.0 during cooldown", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    agent.runtime.lastInteractionAt = world.simClock - 1000; // 1s ago, cooldown 10s
    expect(interactionCooldownOk(agent, world)).toBe(0.0);
  });

  it("returns 1.0 after cooldown expires", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    agent.runtime.lastInteractionAt = world.simClock - 15000; // 15s ago, cooldown 10s
    expect(interactionCooldownOk(agent, world)).toBe(1.0);
  });
});

describe("selectAction", () => {
  it("returns one of the defined actions", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    const validActions = [
      "stay_put", "move_to_target", "follow_companion",
      "avoid_crowd", "wander", "interact", "wait", "reroute",
    ];

    const result = selectAction(agent, world);
    expect(validActions).toContain(result.action);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(1);
  });

  it("prefers reroute when blocked", () => {
    const agent = makeAgent();
    agent.runtime.blocked = true;
    const world = makeWorld([agent]);

    const scores = getAllScores(agent, world);
    const rerouteScore = scores.find((s) => s.action === "reroute");
    expect(rerouteScore).toBeDefined();
    expect(rerouteScore!.value).toBe(0.9);
  });

  it("all scores are clamped to [0, 1]", () => {
    const agent = makeAgent();
    const world = makeWorld([agent]);
    const scores = getAllScores(agent, world);
    for (const s of scores) {
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(1);
    }
  });
});
