import { Router } from "express";
import { jobStore } from "../stores.js";

export const progressRouter = Router();

progressRouter.get("/compile-progress/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Track what we have already sent so we only emit deltas
  let lastStep: string | null = null;
  let lastProgress = 0;
  let sentComplete = false;

  /**
   * Poll the in-memory job state and emit SSE events when the step
   * or progress changes. The pipeline updates the job store directly
   * from its onProgress callback, so this poller picks up those updates.
   */
  const interval = setInterval(() => {
    const currentJob = jobStore.get(req.params.jobId);
    if (!currentJob) {
      clearInterval(interval);
      res.end();
      return;
    }

    // Emit a step event whenever the step or progress changes
    const stepChanged = currentJob.currentStep !== lastStep;
    const progressChanged = currentJob.progress !== lastProgress;

    if ((stepChanged || progressChanged) && currentJob.currentStep) {
      const status =
        currentJob.status === "error"
          ? "error"
          : currentJob.status === "complete"
            ? "complete"
            : "running";

      // Determine the step-level status
      // If the overall job is still compiling, the current step is "running"
      // unless the progress has advanced past the step (meaning it completed)
      let stepStatus: "running" | "complete" | "error" = "running";
      if (currentJob.currentStep === "complete") {
        stepStatus = "complete";
      } else if (currentJob.error && currentJob.status === "error") {
        stepStatus = "error";
      } else if (stepChanged && lastStep && lastStep !== "starting") {
        // If we moved to a new step, the previous step completed
        // Emit a completion event for the previous step
        res.write(
          `event: step\ndata: ${JSON.stringify({
            step: lastStep,
            status: "complete",
            progress: lastProgress,
          })}\n\n`,
        );
      }

      res.write(
        `event: step\ndata: ${JSON.stringify({
          step: currentJob.currentStep,
          status: stepStatus,
          progress: currentJob.progress,
        })}\n\n`,
      );

      lastStep = currentJob.currentStep;
      lastProgress = currentJob.progress;
    }

    // Emit the complete event once the job is done
    if (
      !sentComplete &&
      (currentJob.status === "complete" || currentJob.status === "error")
    ) {
      sentComplete = true;

      if (currentJob.status === "complete" && currentJob.sceneId) {
        res.write(
          `event: complete\ndata: ${JSON.stringify({
            sceneId: currentJob.sceneId,
            status: "ready",
            ...(currentJob.error ? { warning: currentJob.error } : {}),
          })}\n\n`,
        );
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: currentJob.error ?? "Unknown error",
          })}\n\n`,
        );
      }

      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
  });
});
