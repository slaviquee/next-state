import { z } from "zod";
import { Vec3Schema, LikelyActionSchema, SpatialEstimateSchema } from "./primitives.js";

export const AgentGoalTypeSchema = z.enum([
  "stay_put", "find_seat", "follow_companion",
  "approach_counter", "move_to_exit",
  "wait_for_someone", "wander",
  "reposition", "avoid_crowd",
]);

export const AgentGoalSchema = z.object({
  type: AgentGoalTypeSchema,
  targetZoneId: z.string().optional(),
  targetObjectId: z.string().optional(),
  targetAgentId: z.string().optional(),
  urgency: z.number().min(0).max(1),
  ttlSec: z.number().optional(),
});

export const AgentVisualProfileSchema = z.object({
  assetId: z.string(),
  gender: z.enum(["male", "female", "ambiguous"]),
  ageGroup: z.enum(["child", "young_adult", "adult", "middle_aged", "elderly"]),
  bodyType: z.enum(["small", "medium", "large"]),
  heightBucket: z.enum(["short", "average", "tall"]),
  clothingColors: z.object({
    top: z.string().optional(),
    bottom: z.string().optional(),
    accent: z.string().optional(),
  }),
  clothingStyle: z.enum(["casual", "business", "uniform", "athletic", "formal"]).optional(),
  props: z.array(z.string()).optional(),
  initialPose: z.enum(["standing", "sitting", "walking"]),
  spatialEstimate: SpatialEstimateSchema,
});

export const AgentSocialProfileSchema = z.object({
  groupId: z.string().optional(),
  companionIds: z.array(z.string()),
  likelyRelationships: z.array(
    z.enum(["friend", "coworker", "staff-customer", "stranger", "unknown"])
  ).optional(),
  followTendency: z.number().min(0).max(1),
  sociability: z.number().min(0).max(1),
  interactionCooldownSec: z.number(),
});

export const AgentMindStateSchema = z.object({
  archetype: z.enum([
    "waiting_guest", "staff", "seated_worker",
    "late_arrival", "person_leaving",
    "social_group_member", "uncertain_visitor", "unknown",
  ]),
  primaryGoal: AgentGoalSchema,
  secondaryGoal: AgentGoalSchema.optional(),
  currentIntent: z.string(),
  arousal: z.number().min(0).max(1),
  patience: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  conformity: z.number().min(0).max(1),
  reactionStyle: z.enum([
    "calm", "hesitant", "follow_others",
    "goal_directed", "anxious",
  ]),
  likelyNextActions: z.array(LikelyActionSchema),
  confidence: z.number().min(0).max(1),
});

export const AgentLocomotionStateSchema = z.object({
  speed: z.number(),
  maxSpeed: z.number(),
  acceleration: z.number(),
  isMoving: z.boolean(),
  isBlocked: z.boolean(),
  stuckTickCount: z.number(),
});

export const AgentInteractionSchema = z.object({
  type: z.enum([
    "greeting", "conversation", "ask_directions",
    "join_group", "yield_space", "service_exchange",
    "shared_reaction",
  ]),
  initiatorId: z.string(),
  targetId: z.string(),
  durationSec: z.number(),
  animationHint: z.enum(["face_each_other", "side_by_side", "brief_pause", "gesture"]),
  triggerCondition: z.string(),
});

export const RecentEventSchema = z.object({
  tick: z.number(),
  type: z.string(),
  detail: z.string().optional(),
});

export const AgentRuntimeStateSchema = z.object({
  position: Vec3Schema,
  velocity: Vec3Schema,
  heading: z.number(),
  currentPath: z.array(Vec3Schema),
  animationState: z.enum([
    "idle", "walk", "sit", "turn", "wait",
    "react", "talk", "glance", "fidget",
  ]),
  blocked: z.boolean(),
  lastDecisionAt: z.number(),
  nextMindRefreshAt: z.number(),
  goalStartedAt: z.number(),
  goalChangedCount: z.number(),
  lastInteractionAt: z.number().nullable(),
  lastInteractionPartnerId: z.string().nullable(),
  activeInteractionId: z.string().nullable(),
  occupyingObjectId: z.string().nullable(),
  occupyingZoneId: z.string().nullable(),
  queuePosition: z.number().nullable(),
  queueTargetZoneId: z.string().nullable(),
  recentEvents: z.array(RecentEventSchema),
});

export const AgentModelSchema = z.object({
  id: z.string(),
  visual: AgentVisualProfileSchema,
  social: AgentSocialProfileSchema,
  mind: AgentMindStateSchema,
  locomotion: AgentLocomotionStateSchema,
  runtime: AgentRuntimeStateSchema,
});
