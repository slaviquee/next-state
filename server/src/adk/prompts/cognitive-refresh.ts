import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AgentGoalTypeSchema } from "@next-state/shared";

// ---------------------------------------------------------------------------
// Cognitive Refresh Output Schema
// ---------------------------------------------------------------------------

export const CognitiveRefreshOutputSchema = z.object({
  updated_goal: z.object({
    type: AgentGoalTypeSchema,
    targetZoneId: z.string().optional(),
    targetObjectId: z.string().optional(),
    targetAgentId: z.string().optional(),
    urgency: z.number().min(0).max(1),
    ttlSec: z.number(),
  }),
  currentIntent: z
    .string()
    .describe("Human-readable sentence of what the agent is thinking/doing right now"),
  reactionStyle: z.enum([
    "calm",
    "hesitant",
    "follow_others",
    "goal_directed",
    "anxious",
  ]),
  likelyNextActions: z
    .array(
      z.object({
        label: z.string(),
        probability: z.number().min(0).max(1),
      }),
    )
    .min(2)
    .max(5)
    .describe("Likely next actions with probabilities summing to ~1.0"),
  confidence: z.number().min(0).max(1),
});

export type CognitiveRefreshOutput = z.infer<typeof CognitiveRefreshOutputSchema>;

export const cognitiveRefreshJsonSchema = zodToJsonSchema(
  CognitiveRefreshOutputSchema,
  { target: "openApi3", $refStrategy: "none" },
);

// ---------------------------------------------------------------------------
// Prompt context types
// ---------------------------------------------------------------------------

export interface NearbyAgentContext {
  id: string;
  distance: number;
  currentGoal: string;
  relationship: string | null;
}

export interface CognitivePromptContext {
  agentId: string;
  position: { x: number; y: number; z: number };
  currentGoal: string;
  goalAgeSec: number;
  blocked: boolean;
  stuckTicks: number;
  nearbyAgents: NearbyAgentContext[];
  recentEvents: Array<{ tick: number; type: string; detail?: string }>;
  blockedEdges: string[];
  allowedGoalTypes: string[];
  // Scene grounding
  venueType: string;
  timeOfDay: string;
  spaceType: string;
  zoneIds: string[];
  objectIds: string[];
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildCognitiveRefreshPrompt(ctx: CognitivePromptContext): string {
  const nearbyBlock =
    ctx.nearbyAgents.length > 0
      ? ctx.nearbyAgents
          .map(
            (a) =>
              `  - Agent ${a.id}: ${a.distance.toFixed(1)}m away, goal="${a.currentGoal}"${a.relationship ? `, relationship=${a.relationship}` : ""}`,
          )
          .join("\n")
      : "  (none nearby)";

  const eventsBlock =
    ctx.recentEvents.length > 0
      ? ctx.recentEvents
          .slice(-10)
          .map((e) => `  - [tick ${e.tick}] ${e.type}${e.detail ? `: ${e.detail}` : ""}`)
          .join("\n")
      : "  (no recent events)";

  const blockedBlock =
    ctx.blockedEdges.length > 0
      ? ctx.blockedEdges.map((e) => `  - ${e}`).join("\n")
      : "  (none)";

  return `You are simulating a person (agent ${ctx.agentId}) in a ${ctx.venueType} (${ctx.spaceType}).
It is currently ${ctx.timeOfDay}. Think about what a real person in this situation would naturally do next.

AGENT STATE:
- Position: (${ctx.position.x.toFixed(2)}, ${ctx.position.y.toFixed(2)}, ${ctx.position.z.toFixed(2)})
- Current goal: "${ctx.currentGoal}"
- Goal age: ${ctx.goalAgeSec.toFixed(0)} seconds
- Blocked: ${ctx.blocked}
- Stuck ticks: ${ctx.stuckTicks}

NEARBY AGENTS:
${nearbyBlock}

RECENT EVENTS:
${eventsBlock}

BLOCKED PATHS:
${blockedBlock}

AVAILABLE ZONES: ${ctx.zoneIds.join(", ") || "(none)"}
AVAILABLE OBJECTS: ${ctx.objectIds.join(", ") || "(none)"}
ALLOWED GOAL TYPES: ${ctx.allowedGoalTypes.join(", ")}

INSTRUCTIONS:
1. Reason about this agent's current situation: are they stuck? bored? waiting too long? reacting to something?
2. Decide whether to keep the current goal or switch to a new one. People do not change goals frivolously — they need a reason.
3. If blocked or stuck for too long, choose a different goal or reroute (reposition, avoid_crowd, or wander).
4. If a companion is far away (>5m), consider follow_companion.
5. Choose a goal that feels natural and human — not the optimal pathfinding choice.
6. Set urgency based on how pressing the need is (0 = relaxed, 1 = urgent).
7. Set ttlSec for how long this goal should persist before re-evaluation (typically 15-120 seconds).
8. Provide 2-5 likely next actions with probabilities summing to approximately 1.0.
9. Write a brief, natural currentIntent sentence (what the person is thinking, e.g. "Looking for an open seat near the window").
10. Set confidence to how sure you are about this decision (0-1).

Respond ONLY with the JSON object. No extra text.`;
}
