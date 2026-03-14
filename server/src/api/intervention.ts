import { Router } from "express";
import { InterventionRequestSchema } from "@next-state/shared";
import type { InterventionResponse } from "@next-state/shared";
import { sceneStore } from "../stores.js";

export const interventionRouter = Router();

interventionRouter.post("/intervention", (req, res) => {
  try {
    const parsed = InterventionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
      return;
    }

    const { sceneId, type, params } = parsed.data;

    const scene = sceneStore.get(sceneId);
    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    switch (type) {
      // -----------------------------------------------------------------
      // block_corridor: find edges that touch the specified zone and block them
      // -----------------------------------------------------------------
      case "block_corridor": {
        const zoneId = params.zoneId as string | undefined;
        if (!zoneId) {
          res.status(400).json({ error: "params.zoneId is required for block_corridor" });
          return;
        }

        // Find nav nodes that belong to the target zone
        const zoneNodeIds = new Set(
          scene.environment.navigationGraph.nodes
            .filter((n) => n.zoneId === zoneId)
            .map((n) => n.id),
        );

        if (zoneNodeIds.size === 0) {
          res.status(404).json({ error: `No nav nodes found for zone ${zoneId}` });
          return;
        }

        // Block edges that touch any node in the zone
        const updatedEdges: InterventionResponse["updatedEdges"] = [];
        for (const edge of scene.environment.navigationGraph.edges) {
          if (zoneNodeIds.has(edge.from) || zoneNodeIds.has(edge.to)) {
            edge.blocked = true;
            updatedEdges.push({
              from: edge.from,
              to: edge.to,
              blocked: true,
            });
          }
        }

        const response: InterventionResponse = {
          success: true,
          updatedEdges,
        };
        res.json(response);
        return;
      }

      // -----------------------------------------------------------------
      // add_people: generate placeholder agent stubs
      // -----------------------------------------------------------------
      case "add_people": {
        const count = typeof params.count === "number" ? params.count : 1;
        const newAgents: Array<{ id: string; placeholder: true }> = [];

        const existingCount = scene.agents.length;
        for (let i = 0; i < count; i++) {
          const id = `a${existingCount + i + 1}`;
          newAgents.push({ id, placeholder: true });
        }

        const response: InterventionResponse = {
          success: true,
          // Client will fill in full agent data; we just acknowledge
        };
        // Attach the new agent stubs as extra data
        res.json({ ...response, newAgents });
        return;
      }

      // -----------------------------------------------------------------
      // move_table: return the updated object position
      // -----------------------------------------------------------------
      case "move_table": {
        const objectId = params.objectId as string | undefined;
        const newPosition = params.newPosition as
          | { x: number; y: number; z: number }
          | undefined;

        if (!objectId || !newPosition) {
          res.status(400).json({
            error: "params.objectId and params.newPosition are required for move_table",
          });
          return;
        }

        const obj = scene.environment.objects.find((o) => o.id === objectId);
        if (!obj) {
          res.status(404).json({ error: `Object ${objectId} not found` });
          return;
        }

        // Update position in the scene store
        obj.position.x = newPosition.x;
        obj.position.y = newPosition.y;
        obj.position.z = newPosition.z;

        const response: InterventionResponse = {
          success: true,
        };
        res.json({
          ...response,
          movedObject: {
            objectId,
            newPosition: obj.position,
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // mark_congested: reduce zone attractiveness (client handles behavior)
      // -----------------------------------------------------------------
      case "mark_congested": {
        const zoneId = params.zoneId as string | undefined;
        if (!zoneId) {
          res.status(400).json({ error: "params.zoneId is required for mark_congested" });
          return;
        }

        const zone = scene.environment.semanticZones.find((z) => z.id === zoneId);
        if (!zone) {
          res.status(404).json({ error: `Zone ${zoneId} not found` });
          return;
        }

        zone.attractivenessWeight = Math.max(0, zone.attractivenessWeight - 0.5);

        const response: InterventionResponse = { success: true };
        res.json({ ...response, updatedZone: { zoneId, attractivenessWeight: zone.attractivenessWeight } });
        return;
      }

      // -----------------------------------------------------------------
      // make_exit_attractive: boost exit zone attractiveness
      // -----------------------------------------------------------------
      case "make_exit_attractive": {
        const updatedZones: Array<{ zoneId: string; attractivenessWeight: number }> = [];
        for (const zone of scene.environment.semanticZones) {
          if (zone.type === "exit") {
            zone.attractivenessWeight = Math.min(1, zone.attractivenessWeight + 0.4);
            updatedZones.push({ zoneId: zone.id, attractivenessWeight: zone.attractivenessWeight });
          }
        }

        const response: InterventionResponse = { success: true };
        res.json({ ...response, updatedZones });
        return;
      }

      default: {
        res.status(400).json({ error: `Unknown intervention type: ${type}` });
        return;
      }
    }
  } catch (err) {
    console.error("Intervention error:", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Intervention failed" });
  }
});
