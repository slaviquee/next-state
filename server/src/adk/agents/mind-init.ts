import { ai } from "../../gemini.js";
import { buildMindInitPrompt } from "../prompts/mind-init.js";
import {
  MindInitOutputSchema,
  mindInitJsonSchema,
  type MindInitOutput,
} from "../schemas.js";
import type { CompiledScenePackage } from "@next-state/shared";

const MODEL = "gemini-3.1-flash-lite-preview";
const MAX_RETRIES = 2;

/**
 * Build a concise summary of all agents for context in the mind-init prompt.
 */
function buildAgentSummaries(scene: CompiledScenePackage): string {
  const summaries = scene.agents.map((agent) => ({
    id: agent.id,
    position: agent.visual.spatialEstimate.position3d,
    pose: agent.visual.initialPose,
    archetype: agent.mind.archetype,
    clothingStyle: agent.visual.clothingStyle,
    apparentActivity: agent.mind.currentIntent,
    groupId: agent.social.groupId ?? null,
    companionIds: agent.social.companionIds,
  }));
  return JSON.stringify(summaries, null, 2);
}

/**
 * Build a concise summary of zones for context.
 */
function buildZonesSummary(scene: CompiledScenePackage): string {
  const zones = scene.environment.semanticZones.map((z) => ({
    id: z.id,
    type: z.type,
    capacity: z.capacity,
    occupantIds: z.occupantIds,
  }));
  return JSON.stringify(zones, null, 2);
}

/**
 * Run mind initialization for a single agent.
 */
async function initSingleAgentMind(
  agent: CompiledScenePackage["agents"][number],
  scene: CompiledScenePackage,
  agentSummaries: string,
  zonesSummary: string,
): Promise<MindInitOutput> {
  let lastError: Error | null = null;

  const agentJson = JSON.stringify(
    {
      id: agent.id,
      visual: {
        gender: agent.visual.gender,
        ageGroup: agent.visual.ageGroup,
        clothingStyle: agent.visual.clothingStyle,
        clothingColors: agent.visual.clothingColors,
        props: agent.visual.props,
        initialPose: agent.visual.initialPose,
        position: agent.visual.spatialEstimate.position3d,
      },
      social: agent.social,
      currentArchetype: agent.mind.archetype,
      currentIntent: agent.mind.currentIntent,
    },
    null,
    2,
  );

  const sceneContextJson = JSON.stringify(scene.sceneContext, null, 2);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const basePrompt = buildMindInitPrompt(
        agent.id,
        agentJson,
        sceneContextJson,
        agentSummaries,
        zonesSummary,
      );

      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\n## RETRY NOTICE\nYour previous response failed validation. Error:\n${lastError?.message}\n\nPlease fix the issues and return valid JSON matching the schema exactly.`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: mindInitJsonSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error(`Empty response from Gemini mind-init for agent ${agent.id}`);
      }

      const parsed = JSON.parse(text);
      const validated = MindInitOutputSchema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Mind-init for ${agent.id} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );

      if (attempt === MAX_RETRIES) {
        console.warn(`Mind-init for ${agent.id} exhausted retries, using default fallback`);
        return {
          archetype: "unknown",
          primaryGoal: {
            type: "wander",
            urgency: 0.3,
            ttlSec: 30,
          },
          currentIntent: "Looking around.",
          arousal: 0.3,
          patience: 0.5,
          curiosity: 0.5,
          conformity: 0.5,
          reactionStyle: "calm",
          likelyNextActions: [
            { label: "wander", probability: 0.6 },
            { label: "stay_put", probability: 0.4 },
          ],
          socialLinks: [],
          confidence: 0.1,
        } satisfies MindInitOutput;
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error(`Mind-init for ${agent.id} failed unexpectedly`);
}

/**
 * Run mind initialization for all agents in the scene.
 *
 * Processes agents sequentially to avoid overwhelming the API and to
 * ensure each agent's context is stable. Returns the scene with updated
 * mind states.
 */
export async function runMindInit(
  scene: CompiledScenePackage,
): Promise<CompiledScenePackage> {
  const agentSummaries = buildAgentSummaries(scene);
  const zonesSummary = buildZonesSummary(scene);

  const updatedAgents = [];

  for (const agent of scene.agents) {
    const mindOutput = await initSingleAgentMind(
      agent,
      scene,
      agentSummaries,
      zonesSummary,
    );

    // Apply the mind-init output to the agent
    const updatedAgent = {
      ...agent,
      social: {
        ...agent.social,
        // Update social links from mind-init if there are companions
        companionIds: mindOutput.socialLinks
          .filter((link) => link.relationship === "friend" || link.relationship === "coworker")
          .map((link) => link.targetAgentId),
        likelyRelationships: mindOutput.socialLinks.map((link) => link.relationship),
        followTendency: mindOutput.socialLinks.length > 0
          ? Math.max(...mindOutput.socialLinks.map((l) => l.followTendency))
          : agent.social.followTendency,
      },
      mind: {
        archetype: mindOutput.archetype,
        primaryGoal: mindOutput.primaryGoal,
        secondaryGoal: mindOutput.secondaryGoal,
        currentIntent: mindOutput.currentIntent,
        arousal: mindOutput.arousal,
        patience: mindOutput.patience,
        curiosity: mindOutput.curiosity,
        conformity: mindOutput.conformity,
        reactionStyle: mindOutput.reactionStyle,
        likelyNextActions: mindOutput.likelyNextActions,
        confidence: mindOutput.confidence,
      },
    };

    updatedAgents.push(updatedAgent);
  }

  return {
    ...scene,
    agents: updatedAgents,
  };
}
