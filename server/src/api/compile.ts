import { Router } from "express";
import { v4 as uuid } from "uuid";
import { CompileSceneRequestSchema } from "@next-state/shared";
import { jobStore, storeScene } from "../stores.js";
import { createHardcodedScene } from "../fixtures/hardcoded-scene.js";
import { runCompilePipeline } from "../adk/pipeline.js";
import type { PipelineProgressEvent } from "../adk/pipeline.js";

export const compileRouter = Router();

compileRouter.post("/compile-scene", async (req, res) => {
  try {
    const parsed = CompileSceneRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
      return;
    }

    const { jobId } = parsed.data;
    const job = jobStore.get(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!job.fileUri || !job.fileMimeType) {
      res.status(400).json({ error: "Video file not yet processed" });
      return;
    }

    const sceneId = `scene_${uuid().slice(0, 8)}`;
    job.sceneId = sceneId;
    job.status = "compiling";
    job.currentStep = "starting";
    job.progress = 0.05;

    // Respond immediately — the pipeline runs in the background
    res.json({ sceneId, status: "compiling" });

    // Run the real ADK pipeline in the background
    const onProgress: (event: PipelineProgressEvent) => void = (event) => {
      const currentJob = jobStore.get(jobId);
      if (currentJob) {
        currentJob.currentStep = event.step;
        currentJob.progress = event.progress;
        if (event.error) {
          currentJob.error = event.error;
        }
      }
    };

    runCompilePipeline(job.fileUri, job.fileMimeType, sceneId, onProgress, job.videoDurationSec ?? undefined)
      .then((scene) => {
        storeScene(sceneId, scene);
        const currentJob = jobStore.get(jobId);
        if (currentJob) {
          currentJob.status = "complete";
          currentJob.progress = 1.0;
          currentJob.currentStep = "complete";
        }
        console.log(`Pipeline complete for job ${jobId}, scene ${sceneId}`);
      })
      .catch((err) => {
        console.error(`Pipeline failed for job ${jobId}:`, err);
        const currentJob = jobStore.get(jobId);
        if (currentJob) {
          // Fall back to hardcoded scene so the client still gets something
          const fallbackScene = createHardcodedScene(sceneId);
          storeScene(sceneId, fallbackScene);
          currentJob.status = "complete";
          currentJob.progress = 1.0;
          currentJob.currentStep = "complete";
          currentJob.error = `Pipeline failed, using fallback scene: ${err instanceof Error ? err.message : String(err)}`;
        }
      });
  } catch (err) {
    console.error("Compile error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Compile failed" });
  }
});
