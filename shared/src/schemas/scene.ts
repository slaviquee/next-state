import { z } from "zod";
import { EnvironmentModelSchema } from "./environment.js";
import { AgentModelSchema } from "./agent.js";

export const SceneContextModelSchema = z.object({
  estimatedLocation: z.object({
    type: z.enum(["indoor", "outdoor", "semi_outdoor"]),
    regionHint: z.string().optional(),
    venueTypeHint: z.string().optional(),
    culturalCues: z.array(z.string()).optional(),
  }),
  estimatedTime: z.object({
    timeOfDay: z.enum(["morning", "midday", "afternoon", "evening", "night"]),
    dayTypeHint: z.enum(["weekday", "weekend", "unknown"]).optional(),
    seasonHint: z.enum(["spring", "summer", "autumn", "winter", "unknown"]).optional(),
    lightingEvidence: z.string().optional(),
  }),
  globalSummary: z.string(),
  crowdDensity: z.enum(["sparse", "moderate", "dense"]),
  dominantActivity: z.string(),
});

export const StyleProfileSchema = z.object({
  environmentPalette: z.object({
    wallPrimary: z.string().optional(),
    wallSecondary: z.string().optional(),
    floor: z.string().optional(),
    accent: z.string().optional(),
    lightingMood: z.enum(["neutral", "warm", "cool", "dim", "bright"]).optional(),
    lightingDirection: z.enum(["overhead", "left", "right", "front", "back", "diffuse"]).optional(),
    overallWarmth: z.number().min(0).max(1).optional(),
    floorMaterial: z.enum(["wood", "tile", "carpet", "concrete", "stone", "unknown"]).optional(),
    wallMaterial: z.enum(["painted", "brick", "wood_panel", "glass", "concrete", "unknown"]).optional(),
  }),
  dominantPalette: z.array(z.string()),
  objectOverrides: z.array(z.object({
    objectId: z.string(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
  })),
  agentStyleOverrides: z.array(z.object({
    agentId: z.string(),
    topColor: z.string().optional(),
    bottomColor: z.string().optional(),
    accentColor: z.string().optional(),
  })),
});

export const AssetBindingsSchema = z.object({
  roomShell: z.string(),
  furniture: z.array(z.object({
    objectId: z.string(),
    assetPath: z.string(),
    variant: z.string().optional(),
  })),
  characters: z.array(z.object({
    agentId: z.string(),
    assetPath: z.string(),
    animationClips: z.object({
      idle: z.string(),
      walk: z.string(),
      sit: z.string(),
      talk: z.string().optional(),
      fidget: z.string().optional(),
    }),
  })),
});

export const SimulationConfigSchema = z.object({
  tickIntervalMs: z.number().min(100).max(200),
  maxAgents: z.number().min(1),
  pathfindingAlgorithm: z.literal("astar"),
  collisionAvoidanceRadius: z.number().min(0),
  cognitiveUpdateWindowSec: z.number().min(0),
  maxCognitiveUpdatesPerWindow: z.number().min(1),
  microBehaviorChancePerTick: z.number().min(0).max(1),
  goalTtlDefaultSec: z.number().min(1),
  stuckTickThreshold: z.number().min(1),
});

export const CompiledScenePackageSchema = z.object({
  sceneId: z.string(),
  sourceVideo: z.object({
    durationSec: z.number(),
    width: z.number(),
    height: z.number(),
    fpsSampled: z.number(),
  }),
  sceneContext: SceneContextModelSchema,
  environment: EnvironmentModelSchema,
  agents: z.array(AgentModelSchema),
  simulationConfig: SimulationConfigSchema,
  style: StyleProfileSchema,
  assets: AssetBindingsSchema,
  compileMetadata: z.object({
    sceneConfidence: z.number().min(0).max(1),
    geminiModel: z.string(),
    uncertainty: z.array(z.string()),
  }),
});
