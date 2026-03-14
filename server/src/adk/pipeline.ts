import type { CompiledScenePackage } from "@next-state/shared";
import { runVideoAnalysis } from "./agents/video-analysis.js";
import { runStyleExtraction } from "./agents/style-extraction.js";
import { runStructuring } from "./agents/structuring.js";
import { runMindInit } from "./agents/mind-init.js";
import type { VideoAnalysisOutput, StyleExtractionOutput } from "./schemas.js";

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

  const [videoSettled, styleSettled] = await Promise.allSettled([
    runVideoAnalysis(fileUri, fileMimeType).then((result) => {
      onProgress({ step: "video_analysis", status: "complete", progress: 0.25 });
      return result;
    }),
    runStyleExtraction(fileUri, fileMimeType).then((result) => {
      onProgress({ step: "style_extraction", status: "complete", progress: 0.4 });
      return result;
    }),
  ]);

  // Video analysis is required — if it fails, the pipeline cannot continue
  if (videoSettled.status === "rejected") {
    const message = videoSettled.reason instanceof Error
      ? videoSettled.reason.message
      : String(videoSettled.reason);
    onProgress({ step: "video_analysis", status: "error", progress: 0.25, error: message });
    throw videoSettled.reason;
  }
  const videoAnalysisResult: VideoAnalysisOutput = videoSettled.value;

  // Style extraction failure is recoverable — use neutral palette fallback
  let styleExtractionResult: StyleExtractionOutput;
  if (styleSettled.status === "rejected") {
    const message = styleSettled.reason instanceof Error
      ? styleSettled.reason.message
      : String(styleSettled.reason);
    onProgress({ step: "style_extraction", status: "error", progress: 0.4, error: message });
    console.warn("Style extraction failed, using neutral palette fallback:", message);
    styleExtractionResult = {
      environmentPalette: {
        wallPrimary: "#cccccc",
        wallSecondary: "#dddddd",
        floor: "#888888",
        accent: "#aaaaaa",
        lightingMood: "neutral",
      },
      dominantPalette: ["#cccccc", "#888888", "#aaaaaa"],
      personClothingColors: [],
      objectColors: [],
      lightingDirection: "overhead",
      overallWarmth: 0.5,
    };
  } else {
    styleExtractionResult = styleSettled.value;
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
  // Low-confidence fallback (§22.2)
  // -----------------------------------------------------------------------
  if (structuredScene.compileMetadata.sceneConfidence < 0.4) {
    console.warn(
      `Low scene confidence (${structuredScene.compileMetadata.sceneConfidence}), applying simplification`,
    );
    structuredScene.environment.spaceType = "unknown";
    structuredScene.environment.objects = structuredScene.environment.objects.slice(0, 5);
    structuredScene.agents = structuredScene.agents.slice(0, Math.max(3, structuredScene.agents.length));
    if (structuredScene.agents.length > 3) {
      structuredScene.agents = structuredScene.agents.slice(0, 3);
    }
    structuredScene.compileMetadata.uncertainty.push("low_confidence_simplification_applied");
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
