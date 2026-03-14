import type { CompiledScenePackage } from "@next-state/shared";
import { runVideoAnalysis } from "./agents/video-analysis.js";
import { runStyleExtraction } from "./agents/style-extraction.js";
import { runStructuring } from "./agents/structuring.js";
import { runMindInit } from "./agents/mind-init.js";

/**
 * Progress event emitted by the pipeline as it moves through stages.
 */
export interface PipelineProgressEvent {
  step: string;
  status: "running" | "complete" | "error";
  progress: number;
  error?: string;
}

/**
 * Callback function to receive progress updates from the pipeline.
 */
export type ProgressCallback = (event: PipelineProgressEvent) => void;

/**
 * Run the full ADK compile pipeline.
 *
 * Pipeline stages:
 *   1. Video Analysis + Style Extraction (parallel via Promise.all)
 *   2. Structuring (sequential — depends on step 1)
 *   3. Mind Initialization (sequential — depends on step 2)
 *
 * Uses Promise.all for the parallel step because the ADK ParallelAgent
 * may misbehave in the TS SDK v0.4.0 (per project caveat).
 *
 * Emits progress events via the onProgress callback so that SSE
 * consumers can stream real-time updates.
 */
export async function runCompilePipeline(
  fileUri: string,
  fileMimeType: string,
  sceneId: string,
  onProgress: ProgressCallback,
): Promise<CompiledScenePackage> {
  // -----------------------------------------------------------------------
  // Step 1: Video Analysis + Style Extraction (parallel)
  // -----------------------------------------------------------------------
  onProgress({ step: "video_analysis", status: "running", progress: 0.05 });
  onProgress({ step: "style_extraction", status: "running", progress: 0.05 });

  let videoAnalysisResult;
  let styleExtractionResult;

  try {
    [videoAnalysisResult, styleExtractionResult] = await Promise.all([
      runVideoAnalysis(fileUri, fileMimeType).then((result) => {
        onProgress({ step: "video_analysis", status: "complete", progress: 0.25 });
        return result;
      }),
      runStyleExtraction(fileUri, fileMimeType).then((result) => {
        onProgress({ step: "style_extraction", status: "complete", progress: 0.4 });
        return result;
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Determine which step failed based on the error message
    if (message.includes("Video analysis")) {
      onProgress({ step: "video_analysis", status: "error", progress: 0.25, error: message });
    } else if (message.includes("Style extraction")) {
      onProgress({ step: "style_extraction", status: "error", progress: 0.4, error: message });
    } else {
      onProgress({ step: "video_analysis", status: "error", progress: 0.25, error: message });
      onProgress({ step: "style_extraction", status: "error", progress: 0.4, error: message });
    }
    throw err;
  }

  // -----------------------------------------------------------------------
  // Step 2: Structuring
  // -----------------------------------------------------------------------
  onProgress({ step: "structuring", status: "running", progress: 0.45 });

  let structuredScene: CompiledScenePackage;
  try {
    structuredScene = await runStructuring(
      videoAnalysisResult,
      styleExtractionResult,
      sceneId,
    );
    onProgress({ step: "structuring", status: "complete", progress: 0.7 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress({ step: "structuring", status: "error", progress: 0.7, error: message });
    throw err;
  }

  // -----------------------------------------------------------------------
  // Step 3: Mind Initialization
  // -----------------------------------------------------------------------
  onProgress({ step: "mind_initialization", status: "running", progress: 0.75 });

  let finalScene: CompiledScenePackage;
  try {
    finalScene = await runMindInit(structuredScene);
    onProgress({ step: "mind_initialization", status: "complete", progress: 0.95 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress({ step: "mind_initialization", status: "error", progress: 0.95, error: message });
    throw err;
  }

  return finalScene;
}
