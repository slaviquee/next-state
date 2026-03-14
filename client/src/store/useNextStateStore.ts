import { create } from "zustand";
import type { CompiledScenePackage, AgentModel, NavEdge, AgentMindState, AgentGoal } from "@next-state/shared";
import { requestReplan, getActiveInteractions, removeInteractions, runTicksBatch } from "../simulation/engine";
import { cancelInteractionsInZone } from "../simulation/interactions";

interface CompileStep {
  label: string;
  status: "pending" | "running" | "complete" | "error";
}

interface NextStateStore {
  // Scene data
  scene: CompiledScenePackage | null;
  sceneStatus: "idle" | "uploading" | "compiling" | "ready" | "error";
  compileProgress: { step: string; progress: number } | null;
  compileSteps: CompileStep[];
  errorMessage: string | null;

  // Simulation state
  agents: Map<string, AgentModel>;
  simClock: number;
  simRunning: boolean;
  simSpeed: number;

  // Navigation state (mutable copy for interventions)
  navEdges: NavEdge[];

  // Occupancy tracking
  zoneOccupancy: Map<string, string[]>;
  objectOccupancy: Map<string, string | null>;

  // Cognitive refresh
  interventionZoneId: string | null;

  // UI state
  selectedAgentId: string | null;
  inspectorOpen: boolean;
  debugOverlayVisible: boolean;
  interventionMode: string | null;

  // Actions
  setSceneStatus: (status: NextStateStore["sceneStatus"]) => void;
  setCompileProgress: (progress: { step: string; progress: number } | null) => void;
  setCompileSteps: (steps: CompileStep[]) => void;
  updateCompileStep: (index: number, status: CompileStep["status"]) => void;
  setError: (msg: string | null) => void;
  loadScene: (pkg: CompiledScenePackage) => void;
  tick: (dt: number) => void;
  selectAgent: (id: string | null) => void;
  setSimSpeed: (speed: number) => void;
  toggleSimulation: () => void;
  toggleDebug: () => void;
  updateAgentPosition: (agentId: string, x: number, z: number, heading: number) => void;
  triggerIntervention: (type: string, params: Record<string, unknown>) => void;
  fastForward: (seconds: number) => void;
  resetToIdle: () => void;
  updateAgentMind: (agentId: string, updates: AgentMindUpdate) => void;
}

/** Partial mind state update from cognitive refresh. */
export interface AgentMindUpdate {
  updatedGoal?: AgentGoal;
  currentIntent?: string;
  reactionStyle?: AgentMindState["reactionStyle"];
  likelyNextActions?: AgentMindState["likelyNextActions"];
  confidence?: number;
}

export const useNextStateStore = create<NextStateStore>((set, get) => ({
  scene: null,
  sceneStatus: "idle",
  compileProgress: null,
  compileSteps: [],
  errorMessage: null,
  agents: new Map(),
  simClock: 0,
  simRunning: false,
  simSpeed: 1.0,
  navEdges: [],
  zoneOccupancy: new Map(),
  objectOccupancy: new Map(),
  interventionZoneId: null,
  selectedAgentId: null,
  inspectorOpen: false,
  debugOverlayVisible: false,
  interventionMode: null,

  setSceneStatus: (status) => set({ sceneStatus: status }),
  setCompileProgress: (progress) => set({ compileProgress: progress }),

  setCompileSteps: (steps) => set({ compileSteps: steps }),

  updateCompileStep: (index, status) => {
    const steps = [...get().compileSteps];
    if (steps[index]) {
      steps[index] = { ...steps[index], status };
    }
    set({ compileSteps: steps });
  },

  setError: (msg) => set({ errorMessage: msg, sceneStatus: msg ? "error" : get().sceneStatus }),

  loadScene: (pkg) => {
    const agents = new Map<string, AgentModel>();
    for (const agent of pkg.agents) {
      const cloned = structuredClone(agent);

      // Initialize runtime state from visual estimates
      cloned.runtime.position = {
        x: cloned.visual.spatialEstimate.position3d.x,
        y: 0,
        z: cloned.visual.spatialEstimate.position3d.z,
      };
      cloned.runtime.velocity = { x: 0, y: 0, z: 0 };
      cloned.runtime.currentPath = [];
      cloned.runtime.blocked = false;
      cloned.runtime.lastDecisionAt = 0;
      cloned.runtime.nextMindRefreshAt = pkg.simulationConfig.cognitiveUpdateWindowSec * 1000;
      cloned.runtime.goalStartedAt = 0;
      if (!cloned.runtime.recentEvents) {
        cloned.runtime.recentEvents = [];
      }

      // Set initial animation from pose
      if (cloned.visual.initialPose === "sitting") {
        cloned.runtime.animationState = "sit";
      } else if (cloned.visual.initialPose === "walking") {
        cloned.runtime.animationState = "walk";
        cloned.locomotion.isMoving = true;
      } else {
        cloned.runtime.animationState = "idle";
      }

      // Initialize locomotion
      cloned.locomotion.isBlocked = false;
      cloned.locomotion.stuckTickCount = 0;

      agents.set(cloned.id, cloned);
    }

    const zoneOccupancy = new Map<string, string[]>();
    for (const zone of pkg.environment.semanticZones) {
      zoneOccupancy.set(zone.id, [...zone.occupantIds]);
    }

    const objectOccupancy = new Map<string, string | null>();
    for (const obj of pkg.environment.objects) {
      objectOccupancy.set(obj.id, obj.occupiedByAgentId);
    }

    const navEdges = pkg.environment.navigationGraph.edges.map((e) => ({ ...e }));

    set({
      scene: pkg,
      sceneStatus: "ready",
      agents,
      zoneOccupancy,
      objectOccupancy,
      navEdges,
      simClock: 0,
      simRunning: true,
    });
  },

  tick: (dt) => {
    set((state) => ({
      simClock: state.simClock + dt,
    }));
  },

  selectAgent: (id) =>
    set({
      selectedAgentId: id,
      inspectorOpen: id !== null,
    }),

  setSimSpeed: (speed) => set({ simSpeed: speed }),
  toggleSimulation: () => set((s) => ({ simRunning: !s.simRunning })),
  toggleDebug: () => set((s) => ({ debugOverlayVisible: !s.debugOverlayVisible })),

  updateAgentPosition: (agentId, x, z, heading) => {
    const agents = get().agents;
    const agent = agents.get(agentId);
    if (!agent) return;
    agent.runtime.position.x = x;
    agent.runtime.position.z = z;
    agent.runtime.heading = heading;
    set({ agents: new Map(agents) });
  },

  triggerIntervention: (type, params) => {
    const state = get();

    if (type === "block_corridor") {
      const zoneId = params.zoneId as string;
      const updatedEdges = state.navEdges.map((edge) => {
        const scene = state.scene;
        if (!scene) return edge;
        // Find nodes in the target zone
        const zoneNodes = scene.environment.navigationGraph.nodes
          .filter((n) => n.zoneId === zoneId)
          .map((n) => n.id);
        // Block edges that connect nodes in the zone
        if (zoneNodes.includes(edge.from) || zoneNodes.includes(edge.to)) {
          return { ...edge, blocked: true };
        }
        return edge;
      });

      // Cancel active interactions in the affected zone and trigger replans
      const interactions = getActiveInteractions();
      const { remaining, cancelledAgentIds } = cancelInteractionsInZone(
        zoneId,
        interactions,
        state.agents,
        state.simClock,
      );
      // Remove cancelled interactions from the engine's list
      const cancelledIds = new Set(
        interactions.filter((i) => !remaining.includes(i)).map((i) => i.id),
      );
      if (cancelledIds.size > 0) {
        removeInteractions(cancelledIds);
      }
      for (const agentId of cancelledAgentIds) {
        requestReplan(agentId);
      }

      set({ navEdges: updatedEdges, interventionZoneId: zoneId });

      // Clear interventionZoneId after one cognitive refresh window
      const windowMs = (state.scene?.simulationConfig.cognitiveUpdateWindowSec ?? 5) * 1000;
      setTimeout(() => {
        set({ interventionZoneId: null });
      }, windowMs);
    }

    if (type === "move_table") {
      const objectId = params.objectId as string;
      const newPosition = params.newPosition as { x: number; y: number; z: number };
      if (!state.scene || !objectId || !newPosition) return;

      // Update the object position in the scene
      const obj = state.scene.environment.objects.find((o) => o.id === objectId);
      if (obj) {
        obj.position.x = newPosition.x;
        obj.position.z = newPosition.z;

        // If occupied, evict the agent
        const occupant = state.objectOccupancy.get(objectId);
        if (occupant) {
          const agent = state.agents.get(occupant);
          if (agent) {
            agent.runtime.occupyingObjectId = null;
            agent.runtime.animationState = "idle";
            agent.mind.primaryGoal.type = "find_seat";
            agent.mind.primaryGoal.targetObjectId = undefined;
            agent.runtime.goalStartedAt = state.simClock;
            agent.runtime.goalChangedCount++;
            requestReplan(agent.id);
          }
          const newOccupancy = new Map(state.objectOccupancy);
          newOccupancy.set(objectId, null);
          set({ objectOccupancy: newOccupancy });
        }

        // Rebuild navgraph around moved object: block/unblock edges that
        // intersect the object's new footprint (lightweight proximity check)
        const footprintRadius = obj.scale.x / 2 + 0.3;
        const footprintRadiusSq = footprintRadius * footprintRadius;
        const updatedEdges = state.navEdges.map((edge) => {
          const navNodes = state.scene!.environment.navigationGraph.nodes;
          const fromNode = navNodes.find((n) => n.id === edge.from);
          const toNode = navNodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return edge;

          // Check if the edge midpoint is within the object's footprint
          const midX = (fromNode.position.x + toNode.position.x) / 2;
          const midZ = (fromNode.position.z + toNode.position.z) / 2;
          const dx = midX - obj.position.x;
          const dz = midZ - obj.position.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < footprintRadiusSq) {
            return { ...edge, blocked: true };
          }
          // Unblock edges that were previously blocked by this object but no longer intersect
          if (edge.blocked) {
            return { ...edge, blocked: false };
          }
          return edge;
        });

        set({ navEdges: updatedEdges, agents: new Map(state.agents) });
      }
    }

    if (type === "mark_congested") {
      const zoneId = params.zoneId as string;
      if (!state.scene || !zoneId) return;

      // Reduce attractiveness of the zone so agents avoid it
      const zone = state.scene.environment.semanticZones.find((z) => z.id === zoneId);
      if (zone) {
        zone.attractivenessWeight = Math.max(0, zone.attractivenessWeight - 0.5);
      }

      // Agents in the zone should reposition
      const zoneOccupants = state.zoneOccupancy.get(zoneId) ?? [];
      for (const agentId of zoneOccupants) {
        const agent = state.agents.get(agentId);
        if (agent && agent.runtime.animationState !== "sit") {
          agent.mind.primaryGoal.type = "avoid_crowd";
          agent.runtime.goalStartedAt = state.simClock;
          agent.runtime.goalChangedCount++;
          requestReplan(agentId);
        }
      }

      set({ agents: new Map(state.agents), interventionZoneId: zoneId });
      const windowMs = (state.scene.simulationConfig.cognitiveUpdateWindowSec ?? 5) * 1000;
      setTimeout(() => set({ interventionZoneId: null }), windowMs);
    }

    if (type === "make_exit_attractive") {
      if (!state.scene) return;

      // Find exit zones and boost their attractiveness
      for (const zone of state.scene.environment.semanticZones) {
        if (zone.type === "exit") {
          zone.attractivenessWeight = Math.min(1, zone.attractivenessWeight + 0.4);
        }
      }

      // Give a subset of agents the move_to_exit goal
      let redirectCount = 0;
      const maxToRedirect = Math.ceil(state.agents.size * 0.3);
      for (const [, agent] of state.agents) {
        if (redirectCount >= maxToRedirect) break;
        if (agent.mind.primaryGoal.type === "stay_put" || agent.mind.primaryGoal.type === "wander") {
          agent.mind.primaryGoal.type = "move_to_exit";
          agent.mind.primaryGoal.urgency = 0.8;
          agent.runtime.goalStartedAt = state.simClock;
          agent.runtime.goalChangedCount++;
          requestReplan(agent.id);
          redirectCount++;
        }
      }

      set({ agents: new Map(state.agents) });
    }

    if (type === "add_people") {
      const count = (params.count as number) ?? 3;
      const agents = new Map(state.agents);
      const scene = state.scene;
      if (!scene) return;

      // Find an entrance portal for spawn position
      const entrance = scene.environment.entrances[0];
      const spawnPos = entrance
        ? entrance.position
        : { x: scene.environment.bounds.width / 2, y: 0, z: 0.5 };

      const existingCount = agents.size;
      for (let i = 0; i < count; i++) {
        const id = `a${existingCount + i + 1}`;
        const offsetX = (Math.random() - 0.5) * 2;
        const offsetZ = Math.random() * 1.5;

        const newAgent: AgentModel = {
          id,
          visual: {
            assetId: `char_spawned_${i}`,
            gender: Math.random() > 0.5 ? "male" : "female",
            ageGroup: "adult",
            bodyType: "medium",
            heightBucket: "average",
            clothingColors: {
              top: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7"][i % 5],
              bottom: "#333333",
            },
            clothingStyle: "casual",
            props: [],
            initialPose: "walking",
            spatialEstimate: {
              position3d: {
                x: spawnPos.x + offsetX,
                y: 0,
                z: spawnPos.z + offsetZ,
              },
              confidence3d: 0.7,
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
            archetype: "late_arrival",
            primaryGoal: {
              type: "find_seat",
              urgency: 0.7,
            },
            currentIntent: "Looking for a place to sit",
            arousal: 0.5,
            patience: 0.6,
            curiosity: 0.4,
            conformity: 0.5,
            reactionStyle: "goal_directed",
            likelyNextActions: [
              { label: "Walk to nearest open seat", probability: 0.6 },
              { label: "Look around", probability: 0.3 },
              { label: "Wait near entrance", probability: 0.1 },
            ],
            confidence: 0.7,
          },
          locomotion: {
            speed: 0.8,
            maxSpeed: 1.4,
            acceleration: 0.5,
            isMoving: true,
            isBlocked: false,
            stuckTickCount: 0,
          },
          runtime: {
            position: {
              x: spawnPos.x + offsetX,
              y: 0,
              z: spawnPos.z + offsetZ,
            },
            velocity: { x: 0, y: 0, z: 0 },
            heading: Math.PI / 2,
            currentPath: [],
            animationState: "walk",
            blocked: false,
            lastDecisionAt: state.simClock,
            nextMindRefreshAt: state.simClock + 5000,
            goalStartedAt: state.simClock,
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
        };
        agents.set(id, newAgent);
      }
      set({ agents });
    }
  },

  fastForward: (seconds) => {
    const state = get();
    if (!state.scene) return;

    const tickMs = state.scene.simulationConfig.tickIntervalMs;
    const totalTicks = Math.round((seconds * 1000) / tickMs);
    // Cap at 200 ticks to avoid freezing UI
    const maxTicks = Math.min(totalTicks, 200);

    // Temporarily enable simulation if paused
    const wasRunning = state.simRunning;
    if (!wasRunning) set({ simRunning: true });

    runTicksBatch(maxTicks, tickMs);

    if (!wasRunning) set({ simRunning: false });
  },

  resetToIdle: () => {
    set({
      scene: null,
      sceneStatus: "idle",
      compileProgress: null,
      compileSteps: [],
      errorMessage: null,
      agents: new Map(),
      simClock: 0,
      simRunning: false,
      navEdges: [],
    });
  },

  updateAgentMind: (agentId, updates) => {
    const agents = get().agents;
    const agent = agents.get(agentId);
    if (!agent) return;

    if (updates.updatedGoal) {
      agent.mind.primaryGoal = updates.updatedGoal;
      agent.runtime.goalStartedAt = get().simClock;
      agent.runtime.goalChangedCount++;
    }
    if (updates.currentIntent !== undefined) {
      agent.mind.currentIntent = updates.currentIntent;
    }
    if (updates.reactionStyle !== undefined) {
      agent.mind.reactionStyle = updates.reactionStyle;
    }
    if (updates.likelyNextActions !== undefined) {
      agent.mind.likelyNextActions = updates.likelyNextActions;
    }
    if (updates.confidence !== undefined) {
      agent.mind.confidence = updates.confidence;
    }

    // Trigger replan after cognitive refresh
    requestReplan(agentId);

    set({ agents: new Map(agents) });
  },
}));
