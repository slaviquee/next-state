import { Router } from "express";
import {
  AgentRefreshRequestSchema,
  AgentRefreshResultSchema,
  AgentGoalTypeSchema,
} from "@next-state/shared";
import type {
  AgentRefreshResult,
  AgentRefreshResponse,
  AgentSnapshot,
  CompiledScenePackage,
  AgentModel,
} from "@next-state/shared";
import { sceneStore } from "../stores.js";
import { ai } from "../gemini.js";
import {
  buildCognitiveRefreshPrompt,
  CognitiveRefreshOutputSchema,
  cognitiveRefreshJsonSchema,
} from "../adk/prompts/cognitive-refresh.js";
import type { CognitivePromptContext, NearbyAgentContext } from "../adk/prompts/cognitive-refresh.js";

export const agentRefreshRouter = Router();

const COGNITIVE_MODEL = "gemini-3.1-flash-lite-preview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Euclidean distance on the XZ plane. */
function xzDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Find nearby agents within 8 m of the given agent. */
function findNearbyAgents(
  agentId: string,
  agentSnapshot: AgentSnapshot,
  allSnapshots: Record<string, AgentSnapshot>,
  scene: CompiledScenePackage,
): NearbyAgentContext[] {
  const nearby: NearbyAgentContext[] = [];
  const agentModel = scene.agents.find((a) => a.id === agentId);

  for (const [otherId, otherSnap] of Object.entries(allSnapshots)) {
    if (otherId === agentId) continue;
    const dist = xzDistance(agentSnapshot.position, otherSnap.position);
    if (dist > 8) continue;

    // Try to find relationship from social profile
    let relationship: string | null = null;
    if (agentModel) {
      const otherModel = scene.agents.find((a) => a.id === otherId);
      if (otherModel && agentModel.social.companionIds.includes(otherId)) {
        const rel = agentModel.social.likelyRelationships;
        relationship = rel && rel.length > 0 ? rel[0] : "unknown";
      }
    }

    nearby.push({
      id: otherId,
      distance: dist,
      currentGoal: otherSnap.currentGoal,
      relationship,
    });
  }

  // Sort by distance ascending, take top 6
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, 6);
}

/** Build fallback result when Gemini call fails for an agent. */
function buildFallbackResult(
  agentId: string,
  snapshot: AgentSnapshot,
): AgentRefreshResult {
  return {
    agentId,
    updatedGoal: {
      type: "stay_put",
      urgency: 0.3,
      ttlSec: 30,
    },
    currentIntent: "Continuing what I was doing.",
    reactionStyle: "calm",
    likelyNextActions: [
      { label: "continue_current_activity", probability: 0.7 },
      { label: "look_around", probability: 0.3 },
    ],
    confidence: 0.2,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

agentRefreshRouter.post("/agent-refresh", async (req, res) => {
  try {
    const parsed = AgentRefreshRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
      return;
    }

    const { sceneId, agents: requestedAgentIds, runtimeSnapshot, eventContext } = parsed.data;

    const scene = sceneStore.get(sceneId);
    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    const allowedGoalTypes = AgentGoalTypeSchema.options;
    const zoneIds = scene.environment.semanticZones.map((z) => z.id);
    const objectIds = scene.environment.objects
      .filter((o) => o.interactable)
      .map((o) => o.id);

    const results: AgentRefreshResult[] = [];

    // Process agents in parallel
    const promises = requestedAgentIds.map(async (agentId) => {
      const snapshot = runtimeSnapshot.agentStates[agentId];
      if (!snapshot) {
        return buildFallbackResult(agentId, {
          position: { x: 0, y: 0, z: 0 },
          heading: 0,
          currentGoal: "stay_put",
          animationState: "idle",
          blocked: false,
          stuckTickCount: 0,
          goalStartedAt: 0,
          lastInteractionAt: null,
        });
      }

      const nearbyAgents = findNearbyAgents(
        agentId,
        snapshot,
        runtimeSnapshot.agentStates,
        scene,
      );

      const goalAgeSec =
        (runtimeSnapshot.simClock - snapshot.goalStartedAt) / 1000;

      const promptCtx: CognitivePromptContext = {
        agentId,
        position: snapshot.position,
        currentGoal: snapshot.currentGoal,
        goalAgeSec,
        blocked: snapshot.blocked,
        stuckTicks: snapshot.stuckTickCount,
        nearbyAgents,
        recentEvents: runtimeSnapshot.recentEvents,
        blockedEdges: runtimeSnapshot.blockedEdges,
        allowedGoalTypes: [...allowedGoalTypes],
        venueType: scene.sceneContext.estimatedLocation.venueTypeHint ?? "unknown venue",
        timeOfDay: scene.sceneContext.estimatedTime.timeOfDay,
        spaceType: scene.environment.spaceType,
        zoneIds,
        objectIds,
      };

      const prompt = buildCognitiveRefreshPrompt(promptCtx);

      try {
        const response = await ai.models.generateContent({
          model: COGNITIVE_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: cognitiveRefreshJsonSchema as Record<string, unknown>,
          },
        });

        const text = response.text ?? "";
        const raw = JSON.parse(text);
        const validated = CognitiveRefreshOutputSchema.parse(raw);

        return {
          agentId,
          updatedGoal: validated.updated_goal,
          currentIntent: validated.currentIntent,
          reactionStyle: validated.reactionStyle,
          likelyNextActions: validated.likelyNextActions,
          confidence: validated.confidence,
        } satisfies AgentRefreshResult;
      } catch (err) {
        console.error(`Cognitive refresh failed for agent ${agentId}:`, err);
        return buildFallbackResult(agentId, snapshot);
      }
    });

    const settled = await Promise.all(promises);
    results.push(...settled);

    const response: AgentRefreshResponse = { results };
    res.json(response);
  } catch (err) {
    console.error("Agent refresh error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Agent refresh failed" });
  }
});
