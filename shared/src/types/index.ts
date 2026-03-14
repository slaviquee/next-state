import { z } from "zod";
import {
  Vec3Schema, Polygon2DSchema, PortalSchema,
  LikelyActionSchema, SpatialEstimateSchema,
} from "../schemas/primitives.js";
import { NavNodeSchema, NavEdgeSchema, NavigationGraphSchema } from "../schemas/navigation.js";
import {
  SceneObjectSchema, SemanticZoneSchema, EnvironmentModelSchema,
} from "../schemas/environment.js";
import {
  AgentGoalTypeSchema, AgentGoalSchema,
  AgentVisualProfileSchema, AgentSocialProfileSchema,
  AgentMindStateSchema, AgentLocomotionStateSchema,
  AgentInteractionSchema, AgentRuntimeStateSchema, AgentModelSchema,
  RecentEventSchema,
} from "../schemas/agent.js";
import {
  SceneContextModelSchema, StyleProfileSchema, AssetBindingsSchema,
  SimulationConfigSchema, CompiledScenePackageSchema,
} from "../schemas/scene.js";
import { JobStateSchema } from "../schemas/store.js";
import {
  UploadVideoResponseSchema, CompileSceneRequestSchema,
  CompileSceneResponseSchema, CompileProgressEventSchema,
  CompileCompleteEventSchema, AgentRefreshRequestSchema,
  AgentRefreshResponseSchema, AgentRefreshResultSchema,
  InterventionRequestSchema, InterventionResponseSchema,
  RuntimeSnapshotSchema, AgentSnapshotSchema,
} from "../schemas/api.js";

// Primitive types
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Polygon2D = z.infer<typeof Polygon2DSchema>;
export type Portal = z.infer<typeof PortalSchema>;
export type LikelyAction = z.infer<typeof LikelyActionSchema>;
export type SpatialEstimate = z.infer<typeof SpatialEstimateSchema>;

// Navigation types
export type NavNode = z.infer<typeof NavNodeSchema>;
export type NavEdge = z.infer<typeof NavEdgeSchema>;
export type NavigationGraph = z.infer<typeof NavigationGraphSchema>;

// Environment types
export type SceneObject = z.infer<typeof SceneObjectSchema>;
export type SemanticZone = z.infer<typeof SemanticZoneSchema>;
export type EnvironmentModel = z.infer<typeof EnvironmentModelSchema>;

// Agent types
export type AgentGoalType = z.infer<typeof AgentGoalTypeSchema>;
export type AgentGoal = z.infer<typeof AgentGoalSchema>;
export type AgentVisualProfile = z.infer<typeof AgentVisualProfileSchema>;
export type AgentSocialProfile = z.infer<typeof AgentSocialProfileSchema>;
export type AgentMindState = z.infer<typeof AgentMindStateSchema>;
export type AgentLocomotionState = z.infer<typeof AgentLocomotionStateSchema>;
export type AgentInteraction = z.infer<typeof AgentInteractionSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
export type AgentModel = z.infer<typeof AgentModelSchema>;
export type RecentEvent = z.infer<typeof RecentEventSchema>;

// Scene types
export type SceneContextModel = z.infer<typeof SceneContextModelSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type AssetBindings = z.infer<typeof AssetBindingsSchema>;
export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;
export type CompiledScenePackage = z.infer<typeof CompiledScenePackageSchema>;

// Store types
export type JobState = z.infer<typeof JobStateSchema>;

// API types
export type UploadVideoResponse = z.infer<typeof UploadVideoResponseSchema>;
export type CompileSceneRequest = z.infer<typeof CompileSceneRequestSchema>;
export type CompileSceneResponse = z.infer<typeof CompileSceneResponseSchema>;
export type CompileProgressEvent = z.infer<typeof CompileProgressEventSchema>;
export type CompileCompleteEvent = z.infer<typeof CompileCompleteEventSchema>;
export type AgentRefreshRequest = z.infer<typeof AgentRefreshRequestSchema>;
export type AgentRefreshResponse = z.infer<typeof AgentRefreshResponseSchema>;
export type AgentRefreshResult = z.infer<typeof AgentRefreshResultSchema>;
export type InterventionRequest = z.infer<typeof InterventionRequestSchema>;
export type InterventionResponse = z.infer<typeof InterventionResponseSchema>;
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>;
export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;
