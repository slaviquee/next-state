import { z } from "zod";

export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const Point2DSchema = z.object({
  x: z.number(),
  z: z.number(),
});

export const Polygon2DSchema = z.object({
  points: z.array(Point2DSchema),
});

export const PortalSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  facingAngle: z.number(),
  width: z.number(),
  type: z.enum(["door", "opening", "corridor_end", "unknown"]),
});

export const LikelyActionSchema = z.object({
  label: z.string(),
  probability: z.number().min(0).max(1),
});

export const SpatialEstimateSchema = z.object({
  position3d: Vec3Schema,
  confidence3d: z.number().min(0).max(1),
  projectionSource: z.enum(["gemini_3d", "heuristic_2d"]),
  videoBoundingBox: z.object({
    yMin: z.number(),
    xMin: z.number(),
    yMax: z.number(),
    xMax: z.number(),
  }),
  depthHint: z.enum(["near", "mid", "far"]).optional(),
});
