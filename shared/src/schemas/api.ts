import { z } from "zod";
import { Vec3Schema } from "./primitives.js";
import { AgentGoalSchema, AgentGoalTypeSchema, AgentMindStateSchema, AgentRuntimeStateSchema, RecentEventSchema } from "./agent.js";

// POST /api/upload-video response
export const UploadVideoResponseSchema = z.object({
  jobId: z.string(),
  fileUri: z.string(),
});

// POST /api/compile-scene request
export const CompileSceneRequestSchema = z.object({
  jobId: z.string(),
});

// POST /api/compile-scene response
export const CompileSceneResponseSchema = z.object({
  sceneId: z.string(),
  status: z.enum(["compiling", "ready", "error"]),
});

// SSE compile-progress event data
export const CompileProgressEventSchema = z.object({
  step: z.string(),
  status: z.enum(["running", "complete", "error"]),
  progress: z.number(),
});

export const CompileCompleteEventSchema = z.object({
  sceneId: z.string(),
  status: z.literal("ready"),
});

// POST /api/agent-refresh request
export const AgentSnapshotSchema = z.object({
  position: Vec3Schema,
  heading: z.number(),
  currentGoal: AgentGoalTypeSchema,
  animationState: AgentRuntimeStateSchema.shape.animationState,
  blocked: z.boolean(),
  stuckTickCount: z.number(),
  goalStartedAt: z.number(),
  lastInteractionAt: z.number().nullable(),
});

export const RuntimeSnapshotSchema = z.object({
  simClock: z.number(),
  agentStates: z.record(z.string(), AgentSnapshotSchema),
  blockedEdges: z.array(z.string()),
  recentEvents: z.array(RecentEventSchema),
});

export const AgentRefreshRequestSchema = z.object({
  sceneId: z.string(),
  agents: z.array(z.string()),
  eventContext: z.object({
    type: z.string(),
    summary: z.string(),
  }),
  runtimeSnapshot: RuntimeSnapshotSchema,
});

// POST /api/agent-refresh response (per agent)
export const AgentRefreshResultSchema = z.object({
  agentId: z.string(),
  updatedGoal: AgentGoalSchema,
  currentIntent: z.string(),
  reactionStyle: AgentMindStateSchema.shape.reactionStyle,
  likelyNextActions: AgentMindStateSchema.shape.likelyNextActions,
  confidence: z.number().min(0).max(1),
});

export const AgentRefreshResponseSchema = z.object({
  results: z.array(AgentRefreshResultSchema),
});

// POST /api/intervention request
export const InterventionRequestSchema = z.object({
  sceneId: z.string(),
  type: z.enum(["block_corridor", "add_people", "move_table", "mark_congested", "make_exit_attractive"]),
  params: z.record(z.string(), z.unknown()),
});

export const InterventionResponseSchema = z.object({
  success: z.boolean(),
  updatedEdges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    blocked: z.boolean(),
  })).optional(),
});
