import { Router } from "express";
import { sceneStore } from "../stores.js";

export const sceneRouter = Router();

sceneRouter.get("/scene/:sceneId", (req, res) => {
  const scene = sceneStore.get(req.params.sceneId);
  if (!scene) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }
  res.json(scene);
});
