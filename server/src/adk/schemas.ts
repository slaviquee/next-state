import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  Polygon2DSchema,
  PortalSchema,
  SceneObjectSchema,
  SemanticZoneSchema,
  SceneContextModelSchema,
  StyleProfileSchema,
  AgentVisualProfileSchema,
  AgentSocialProfileSchema,
  AgentLocomotionStateSchema,
  AgentRuntimeStateSchema,
  AgentMindStateSchema,
} from "@next-state/shared";

// ---------------------------------------------------------------------------
// Video Analysis Raw Output — returned by gemini-3.1-pro-preview
// ---------------------------------------------------------------------------

const BoundingBox2DSchema = z.object({
  yMin: z.number().describe("Top edge, normalized 0-1000"),
  xMin: z.number().describe("Left edge, normalized 0-1000"),
  yMax: z.number().describe("Bottom edge, normalized 0-1000"),
  xMax: z.number().describe("Right edge, normalized 0-1000"),
});

const DetectedObjectSchema = z.object({
  label: z.string().describe("Object type: table, chair, desk, counter, sofa, door, wall, laptop, coffee_machine, screen, plant, bookshelf, whiteboard, window, rug, trash_can, light_fixture, stool, cabinet, or unknown"),
  boundingBox: BoundingBox2DSchema,
  confidence: z.number().min(0).max(1).describe("Detection confidence 0-1"),
  interactable: z.boolean().describe("Whether people can interact with this object"),
  blocksMovement: z.boolean().describe("Whether this object blocks walking"),
  colorHint: z.string().optional().describe("Primary color of the object as hex string"),
  secondaryColorHint: z.string().optional().describe("Secondary color of the object as hex string"),
  material: z.enum(["wood", "metal", "plastic", "fabric", "glass", "stone", "unknown"]).optional().describe("Primary material of the object"),
  shape: z.enum(["rectangular", "round", "oval", "L_shaped", "irregular", "unknown"]).optional().describe("Overall shape of the object"),
  estimatedWidthMeters: z.number().optional().describe("Estimated real-world width in meters"),
  estimatedHeightMeters: z.number().optional().describe("Estimated real-world height in meters"),
  estimatedDepthMeters: z.number().optional().describe("Estimated real-world depth in meters"),
});

const DetectedPersonSchema = z.object({
  personIndex: z.number().describe("Zero-based index for this person"),
  boundingBox: BoundingBox2DSchema,
  confidence: z.number().min(0).max(1),
  gender: z.enum(["male", "female", "ambiguous"]),
  ageGroup: z.enum(["child", "young_adult", "adult", "middle_aged", "elderly"]),
  bodyType: z.enum(["small", "medium", "large"]),
  heightBucket: z.enum(["short", "average", "tall"]),
  pose: z.enum(["standing", "sitting", "walking"]),
  clothingDescription: z.string().describe("Brief description of clothing"),
  topColor: z.string().describe("Dominant clothing top color as hex"),
  bottomColor: z.string().describe("Dominant clothing bottom color as hex"),
  accentColor: z.string().optional().describe("Accent color as hex if visible"),
  clothingStyle: z.enum(["casual", "business", "uniform", "athletic", "formal"]),
  props: z.array(z.string()).describe("Items held or nearby: laptop, phone, bag, cup, etc."),
  hairColor: z.string().optional().describe("Hair color as hex string"),
  hairLength: z.enum(["short", "medium", "long"]).optional().describe("Hair length: short (above ears), medium (ear to shoulder), long (below shoulder)"),
  apparentActivity: z.string().describe("What this person appears to be doing"),
  groupIndex: z.number().nullable().describe("Group index if this person appears to belong to a social group, null if alone"),
  facingDirection: z.enum(["toward_camera", "away_from_camera", "left", "right", "unknown"]),
});

const DetectedGroupSchema = z.object({
  groupIndex: z.number(),
  personIndices: z.array(z.number()),
  relationship: z.enum(["friends", "coworkers", "staff-customer", "strangers", "family", "unknown"]),
  interactionType: z.string().describe("What the group is doing together"),
});

const DetectedEntranceExitSchema = z.object({
  type: z.enum(["door", "opening", "corridor_end", "unknown"]),
  boundingBox: BoundingBox2DSchema,
  estimatedWidthMeters: z.number(),
  isEntrance: z.boolean(),
  isExit: z.boolean(),
});

const ZoneDescriptionSchema = z.object({
  label: z.string().describe("Zone identifier: e.g. main_seating, service_area, entrance_hall"),
  type: z.enum(["seating", "standing", "service", "circulation", "entry", "exit", "waiting", "unknown"]),
  boundingBox: BoundingBox2DSchema.describe("Approximate bounding box of the zone in frame coordinates"),
  estimatedCapacity: z.number().optional().describe("How many people this zone can hold"),
  occupantPersonIndices: z.array(z.number()).describe("Indices of persons currently in this zone"),
});

export const VideoAnalysisOutputSchema = z.object({
  spaceType: z.enum(["cafe", "office", "meeting_room", "corridor", "classroom", "lobby", "unknown"]),
  estimatedBounds: z.object({
    widthMeters: z.number().describe("Estimated room width in meters"),
    depthMeters: z.number().describe("Estimated room depth in meters"),
    heightMeters: z.number().describe("Estimated ceiling height in meters"),
  }),
  objects: z.array(DetectedObjectSchema),
  persons: z.array(DetectedPersonSchema),
  groups: z.array(DetectedGroupSchema),
  entrancesExits: z.array(DetectedEntranceExitSchema),
  zones: z.array(ZoneDescriptionSchema),
  sceneContext: z.object({
    locationType: z.enum(["indoor", "outdoor", "semi_outdoor"]),
    regionHint: z.string().describe("Cultural/geographic region hint"),
    venueTypeHint: z.string().describe("Specific venue type: café, co-working space, library, etc."),
    culturalCues: z.array(z.string()).describe("Visible cultural indicators: signage language, decor style, etc."),
    timeOfDay: z.enum(["morning", "midday", "afternoon", "evening", "night"]),
    dayTypeHint: z.enum(["weekday", "weekend", "unknown"]),
    seasonHint: z.enum(["spring", "summer", "autumn", "winter", "unknown"]),
    lightingEvidence: z.string().describe("Description of lighting conditions"),
    crowdDensity: z.enum(["sparse", "moderate", "dense"]),
    dominantActivity: z.string().describe("The main activity happening in the scene"),
    globalSummary: z.string().describe("2-3 sentence summary of the entire scene"),
  }),
});

export type VideoAnalysisOutput = z.infer<typeof VideoAnalysisOutputSchema>;

// ---------------------------------------------------------------------------
// Style Extraction Output — returned by gemini-3.1-flash-lite-preview
// ---------------------------------------------------------------------------

export const StyleExtractionOutputSchema = z.object({
  environmentPalette: z.object({
    wallPrimary: z.string().describe("Primary wall color as hex"),
    wallSecondary: z.string().optional().describe("Secondary wall color as hex"),
    floor: z.string().describe("Floor color as hex"),
    accent: z.string().optional().describe("Accent color for trim, fixtures as hex"),
    lightingMood: z.enum(["neutral", "warm", "cool", "dim", "bright"]),
  }),
  dominantPalette: z.array(z.string()).min(3).max(7).describe("Top 5-7 dominant hex colors across the entire scene"),
  personClothingColors: z.array(
    z.object({
      personIndex: z.number(),
      topColor: z.string().describe("Top clothing hex color"),
      bottomColor: z.string().describe("Bottom clothing hex color"),
      accentColor: z.string().optional().describe("Accent hex color"),
    })
  ),
  objectColors: z.array(
    z.object({
      objectIndex: z.number().describe("Index into the objects array from video analysis"),
      primaryColor: z.string().describe("Primary color as hex"),
      secondaryColor: z.string().optional().describe("Secondary color as hex"),
    })
  ),
  lightingDirection: z.enum(["overhead", "left", "right", "front", "back", "diffuse"]).describe("Dominant light source direction"),
  overallWarmth: z.number().min(0).max(1).describe("0=very cool/blue, 1=very warm/amber"),
  floorMaterial: z.enum(["wood", "tile", "carpet", "concrete", "stone", "unknown"]).describe("Floor surface material"),
  wallMaterial: z.enum(["painted", "brick", "wood_panel", "glass", "concrete", "unknown"]).describe("Wall surface material"),
});

export type StyleExtractionOutput = z.infer<typeof StyleExtractionOutputSchema>;

// ---------------------------------------------------------------------------
// Mind Init Output — returned by gemini-3.1-flash-lite-preview (per agent)
// ---------------------------------------------------------------------------

export const MindInitOutputSchema = z.object({
  archetype: z.enum([
    "waiting_guest", "staff", "seated_worker",
    "late_arrival", "person_leaving",
    "social_group_member", "uncertain_visitor", "unknown",
  ]),
  primaryGoal: z.object({
    type: z.enum([
      "stay_put", "find_seat", "follow_companion",
      "approach_counter", "move_to_exit",
      "wait_for_someone", "wander",
      "reposition", "avoid_crowd",
    ]),
    targetZoneId: z.string().optional(),
    targetObjectId: z.string().optional(),
    targetAgentId: z.string().optional(),
    urgency: z.number().min(0).max(1),
    ttlSec: z.number(),
  }),
  secondaryGoal: z.object({
    type: z.enum([
      "stay_put", "find_seat", "follow_companion",
      "approach_counter", "move_to_exit",
      "wait_for_someone", "wander",
      "reposition", "avoid_crowd",
    ]),
    urgency: z.number().min(0).max(1),
    ttlSec: z.number(),
  }).optional(),
  currentIntent: z.string().describe("Human-readable sentence describing what this person is likely thinking/doing"),
  arousal: z.number().min(0).max(1).describe("Energy/alertness level: 0=drowsy, 1=highly alert"),
  patience: z.number().min(0).max(1).describe("Tolerance for waiting: 0=very impatient, 1=very patient"),
  curiosity: z.number().min(0).max(1).describe("Interest in surroundings: 0=focused, 1=highly curious"),
  conformity: z.number().min(0).max(1).describe("Tendency to follow social norms: 0=independent, 1=highly conformist"),
  reactionStyle: z.enum(["calm", "hesitant", "follow_others", "goal_directed", "anxious"]),
  likelyNextActions: z.array(z.object({
    label: z.string(),
    probability: z.number().min(0).max(1),
  })).min(2).max(5).describe("Likely next actions with probabilities summing to ~1.0"),
  socialLinks: z.array(z.object({
    targetAgentId: z.string(),
    relationship: z.enum(["friend", "coworker", "staff-customer", "stranger", "unknown"]),
    followTendency: z.number().min(0).max(1),
  })),
  confidence: z.number().min(0).max(1).describe("Confidence in this mind initialization"),
});

export type MindInitOutput = z.infer<typeof MindInitOutputSchema>;

// ---------------------------------------------------------------------------
// Structuring Interpretation Output — smaller than full CompiledScenePackage
// ---------------------------------------------------------------------------

const SourceVideoOverrideSchema = z.object({
  durationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fpsSampled: z.number().optional(),
});

const StructuringEnvironmentInterpretationSchema = z.object({
  spaceType: VideoAnalysisOutputSchema.shape.spaceType.optional(),
  floorPlan: Polygon2DSchema.optional(),
  walkableZones: z.array(Polygon2DSchema).optional(),
  blockedZones: z.array(Polygon2DSchema).optional(),
  entrances: z.array(PortalSchema.deepPartial()).optional(),
  exits: z.array(PortalSchema.deepPartial()).optional(),
  objects: z.array(SceneObjectSchema.deepPartial()).optional(),
  semanticZones: z.array(SemanticZoneSchema.deepPartial()).optional(),
});

const StructuringAgentInterpretationSchema = z.object({
  id: z.string(),
  visual: AgentVisualProfileSchema.deepPartial().optional(),
  social: AgentSocialProfileSchema.deepPartial().optional(),
  locomotion: AgentLocomotionStateSchema.deepPartial().optional(),
  runtime: AgentRuntimeStateSchema.deepPartial().optional(),
  mind: AgentMindStateSchema.deepPartial().optional(),
});

export const StructuringInterpretationOutputSchema = z.object({
  sourceVideo: SourceVideoOverrideSchema.optional(),
  sceneContext: SceneContextModelSchema.deepPartial().optional(),
  environment: StructuringEnvironmentInterpretationSchema.optional(),
  agents: z.array(StructuringAgentInterpretationSchema).optional(),
  style: StyleProfileSchema.deepPartial().optional(),
  compileMetadata: z.object({
    sceneConfidence: z.number().min(0).max(1).optional(),
    geminiModel: z.string().optional(),
    uncertainty: z.array(z.string()).optional(),
  }).optional(),
});

export type StructuringInterpretationOutput = z.infer<
  typeof StructuringInterpretationOutputSchema
>;

// ---------------------------------------------------------------------------
// Derived JSON Schemas for Gemini structured output
// ---------------------------------------------------------------------------

export const videoAnalysisJsonSchema = zodToJsonSchema(
  VideoAnalysisOutputSchema,
  { target: "openApi3", $refStrategy: "none" }
);

export const styleExtractionJsonSchema = zodToJsonSchema(
  StyleExtractionOutputSchema,
  { target: "openApi3", $refStrategy: "none" }
);

export const mindInitJsonSchema = zodToJsonSchema(
  MindInitOutputSchema,
  { target: "openApi3", $refStrategy: "none" }
);

export const structuringInterpretationJsonSchema = zodToJsonSchema(
  StructuringInterpretationOutputSchema,
  { target: "openApi3", $refStrategy: "none" }
);
