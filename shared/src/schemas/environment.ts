import { z } from "zod";
import { Vec3Schema, Polygon2DSchema, PortalSchema, SpatialEstimateSchema } from "./primitives.js";
import { NavigationGraphSchema } from "./navigation.js";

export const SceneObjectSchema = z.object({
  id: z.string(),
  type: z.enum([
    "table", "chair", "desk", "counter", "sofa",
    "door", "wall", "laptop", "coffee_machine",
    "screen", "plant", "bookshelf", "whiteboard",
    "window", "rug", "trash_can", "light_fixture",
    "stool", "cabinet", "unknown",
  ]),
  position: Vec3Schema,
  rotationY: z.number(),
  scale: Vec3Schema,
  interactable: z.boolean(),
  blocksMovement: z.boolean(),
  occupiedByAgentId: z.string().nullable(),
  styleHints: z.object({
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    material: z.enum(["wood", "metal", "plastic", "fabric", "glass", "stone", "unknown"]).optional(),
    shape: z.enum(["rectangular", "round", "oval", "L_shaped", "irregular", "unknown"]).optional(),
  }).optional(),
  spatialEstimate: SpatialEstimateSchema.optional(),
});

export const SemanticZoneSchema = z.object({
  id: z.string(),
  type: z.enum([
    "seating", "standing", "service", "circulation",
    "entry", "exit", "waiting", "unknown",
  ]),
  polygon: Polygon2DSchema,
  attractivenessWeight: z.number(),
  capacity: z.number().optional(),
  occupantIds: z.array(z.string()),
  queueIds: z.array(z.string()),
});

export const EnvironmentModelSchema = z.object({
  spaceType: z.enum([
    "cafe", "office", "meeting_room", "corridor",
    "classroom", "lobby", "unknown",
  ]),
  bounds: z.object({
    width: z.number(),
    depth: z.number(),
    height: z.number(),
  }),
  floorPlan: Polygon2DSchema,
  walkableZones: z.array(Polygon2DSchema),
  blockedZones: z.array(Polygon2DSchema),
  entrances: z.array(PortalSchema),
  exits: z.array(PortalSchema),
  objects: z.array(SceneObjectSchema),
  semanticZones: z.array(SemanticZoneSchema),
  navigationGraph: NavigationGraphSchema,
});
