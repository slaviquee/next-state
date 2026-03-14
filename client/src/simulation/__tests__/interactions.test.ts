import { describe, it, expect, beforeEach } from "vitest";
import type { AgentModel, EnvironmentModel } from "@next-state/shared";
import {
  detectInteractionTriggers,
  createInteraction,
  tickInteraction,
  getInteractionAnimationState,
  shouldPauseForInteraction,
  getPostInteractionGoal,
  resetInteractionState,
} from "../interactions";
import type { WorldState, ActiveInteraction } from "../utility";

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Record<string, unknown> = {}): AgentModel {
  return {
    id,
    visual: {
      assetId: `char_${id}`,
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
      sociability: 0.6,
      interactionCooldownSec: 10,
      ...(overrides.social as Record<string, unknown> ?? {}),
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
      ...(overrides.mind as Record<string, unknown> ?? {}),
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
      ...(overrides.runtime as Record<string, unknown> ?? {}),
    },
  } as AgentModel;
}

function makeWorld(agents: AgentModel[]): WorldState {
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

beforeEach(() => {
  resetInteractionState();
});

// ── Trigger Detection ──────────────────────────────────────────────────────

describe("detectInteractionTriggers", () => {
  it("triggers uncertain_visitor + staff interaction immediately", () => {
    const visitor = makeAgent("a1", {
      mind: { archetype: "uncertain_visitor" },
      runtime: { position: { x: 5, y: 0, z: 5 } },
    });
    const staff = makeAgent("a2", {
      mind: { archetype: "staff" },
      runtime: { position: { x: 5.5, y: 0, z: 5 } },
    });

    const world = makeWorld([visitor, staff]);
    const triggers = detectInteractionTriggers(world);

    expect(triggers.length).toBe(1);
    expect(triggers[0].type).toBe("ask_directions");
    expect(triggers[0].initiatorId).toBe("a1");
    expect(triggers[0].targetId).toBe("a2");
  });

  it("does not trigger when agents are too far apart", () => {
    const a1 = makeAgent("a1", { runtime: { position: { x: 0, y: 0, z: 0 } } });
    const a2 = makeAgent("a2", { runtime: { position: { x: 10, y: 0, z: 10 } } });

    const world = makeWorld([a1, a2]);
    const triggers = detectInteractionTriggers(world);
    expect(triggers.length).toBe(0);
  });

  it("does not trigger when agent is on cooldown", () => {
    const a1 = makeAgent("a1", {
      runtime: { position: { x: 5, y: 0, z: 5 }, lastInteractionAt: 9500 },
    });
    const a2 = makeAgent("a2", { runtime: { position: { x: 5.3, y: 0, z: 5 } } });

    const world = makeWorld([a1, a2]);
    const triggers = detectInteractionTriggers(world);
    expect(triggers.length).toBe(0);
  });

  it("does not trigger when agent is already in active interaction", () => {
    const a1 = makeAgent("a1", { runtime: { position: { x: 5, y: 0, z: 5 } } });
    const a2 = makeAgent("a2", { runtime: { position: { x: 5.3, y: 0, z: 5 } } });

    const world = makeWorld([a1, a2]);
    world.activeInteractions = [{
      id: "int_1",
      type: "conversation",
      initiatorId: "a1",
      targetId: "a3",
      phase: "active",
      startTick: 9000,
      durationTicks: 20,
      ticksRemaining: 10,
    }];

    const triggers = detectInteractionTriggers(world);
    expect(triggers.length).toBe(0);
  });

  it("detects yield_space when one agent is blocked and another is moving nearby", () => {
    const blocked = makeAgent("a1", {
      runtime: { position: { x: 5, y: 0, z: 5 }, blocked: true },
    });
    blocked.locomotion.isMoving = false;

    const mover = makeAgent("a2", {
      runtime: { position: { x: 5.5, y: 0, z: 5 } },
    });
    mover.locomotion.isMoving = true;

    const world = makeWorld([blocked, mover]);
    const triggers = detectInteractionTriggers(world);

    const yieldTrigger = triggers.find((t) => t.type === "yield_space");
    expect(yieldTrigger).toBeDefined();
  });
});

// ── Interaction Lifecycle ──────────────────────────────────────────────────

describe("createInteraction + tickInteraction", () => {
  it("progresses through phases: approaching → active → cooldown → null", () => {
    const trigger = {
      initiatorId: "a1",
      targetId: "a2",
      type: "conversation" as const,
      animationHint: "face_each_other" as const,
      durationSec: 0.15, // very short for testing (1 tick at 150ms)
      triggerCondition: "test",
    };

    let interaction: ActiveInteraction | null = createInteraction(trigger, 150);
    expect(interaction!.phase).toBe("approaching");

    // Tick through approaching phase (3 ticks)
    for (let i = 0; i < 3; i++) {
      interaction = tickInteraction(interaction!);
      expect(interaction).not.toBeNull();
    }
    // Should be in active phase
    expect(interaction!.phase).toBe("active");

    // Tick through active and cooldown
    let tickCount = 0;
    while (interaction !== null && tickCount < 20) {
      interaction = tickInteraction(interaction);
      tickCount++;
    }
    // Should eventually complete
    expect(interaction).toBeNull();
  });
});

describe("getInteractionAnimationState", () => {
  const interactions: ActiveInteraction[] = [
    {
      id: "int_1",
      type: "conversation",
      initiatorId: "a1",
      targetId: "a2",
      phase: "active",
      startTick: 0,
      durationTicks: 10,
      ticksRemaining: 5,
    },
  ];

  it("returns 'talk' for agent in active phase", () => {
    expect(getInteractionAnimationState("a1", interactions)).toBe("talk");
    expect(getInteractionAnimationState("a2", interactions)).toBe("talk");
  });

  it("returns null for uninvolved agent", () => {
    expect(getInteractionAnimationState("a3", interactions)).toBeNull();
  });

  it("returns 'turn' during approaching phase", () => {
    const approaching: ActiveInteraction[] = [{
      ...interactions[0],
      phase: "approaching",
    }];
    expect(getInteractionAnimationState("a1", approaching)).toBe("turn");
  });
});

describe("shouldPauseForInteraction", () => {
  it("pauses during active phase", () => {
    const interactions: ActiveInteraction[] = [{
      id: "int_1", type: "conversation",
      initiatorId: "a1", targetId: "a2",
      phase: "active", startTick: 0, durationTicks: 10, ticksRemaining: 5,
    }];
    expect(shouldPauseForInteraction("a1", interactions)).toBe(true);
  });

  it("does not pause during approaching phase", () => {
    const interactions: ActiveInteraction[] = [{
      id: "int_1", type: "conversation",
      initiatorId: "a1", targetId: "a2",
      phase: "approaching", startTick: 0, durationTicks: 10, ticksRemaining: 15,
    }];
    expect(shouldPauseForInteraction("a1", interactions)).toBe(false);
  });
});

// ── Post-Interaction Goals ─────────────────────────────────────────────────

describe("getPostInteractionGoal", () => {
  it("uncertain_visitor after ask_directions → move_to_exit", () => {
    const visitor = makeAgent("a1", { mind: { archetype: "uncertain_visitor" } });
    const staff = makeAgent("a2", { mind: { archetype: "staff" } });
    const result = getPostInteractionGoal(visitor, staff, "ask_directions");
    expect(result).toEqual({ type: "move_to_exit" });
  });

  it("customer after service_exchange → find_seat", () => {
    const customer = makeAgent("a1", { mind: { archetype: "waiting_guest" } });
    const staff = makeAgent("a2", { mind: { archetype: "staff" } });
    const result = getPostInteractionGoal(customer, staff, "service_exchange");
    expect(result).toEqual({ type: "find_seat" });
  });

  it("after shared_reaction → reposition", () => {
    const a = makeAgent("a1");
    const b = makeAgent("a2");
    const result = getPostInteractionGoal(a, b, "shared_reaction");
    expect(result).toEqual({ type: "reposition" });
  });

  it("after conversation → wander", () => {
    const a = makeAgent("a1");
    const b = makeAgent("a2");
    const result = getPostInteractionGoal(a, b, "conversation");
    expect(result).toEqual({ type: "wander" });
  });
});
