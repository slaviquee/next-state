import { z } from "zod";

export const NavNodeSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), z: z.number() }),
  zoneId: z.string().optional(),
  isPortal: z.boolean().optional(),
});

export const NavEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number(),
  blocked: z.boolean(),
});

export const NavigationGraphSchema = z.object({
  nodes: z.array(NavNodeSchema),
  edges: z.array(NavEdgeSchema),
});
