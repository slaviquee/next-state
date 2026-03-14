import { ai } from "../../gemini.js";
import { buildStructuringPrompt } from "../prompts/structuring.js";
import { CompiledScenePackageSchema } from "@next-state/shared";
import type { CompiledScenePackage } from "@next-state/shared";
import type { VideoAnalysisOutput, StyleExtractionOutput } from "../schemas.js";
import { zodToJsonSchema } from "zod-to-json-schema";

const compiledSceneJsonSchema = zodToJsonSchema(
  CompiledScenePackageSchema,
  { target: "openApi3", $refStrategy: "none" },
);

const MODEL = "gemini-3.1-flash-lite-preview";
const MAX_RETRIES = 3;

/**
 * Run the structuring step using Gemini 3.1 Flash-Lite Preview.
 *
 * Takes the raw video analysis and style extraction outputs, constructs
 * a detailed prompt, and asks the model to produce a CompiledScenePackage.
 *
 * Uses up to MAX_RETRIES retries with error-aware re-prompting: if a
 * Zod validation error occurs, the error details are included in the
 * retry prompt so the model can correct its output.
 */
export async function runStructuring(
  videoAnalysis: VideoAnalysisOutput,
  styleExtraction: StyleExtractionOutput,
  sceneId: string,
  videoDurationSec?: number,
): Promise<CompiledScenePackage> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const basePrompt = buildStructuringPrompt(
        JSON.stringify(videoAnalysis, null, 2),
        JSON.stringify(styleExtraction, null, 2),
        sceneId,
        videoDurationSec,
      );

      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\n## RETRY NOTICE (Attempt ${attempt + 1}/${MAX_RETRIES + 1})\nYour previous response failed schema validation. The specific errors were:\n\`\`\`\n${lastError?.message}\n\`\`\`\n\nPlease carefully review the error, fix the JSON structure, and return a valid CompiledScenePackage. Common issues:\n- Missing required fields\n- Wrong enum values (check the exact allowed values)\n- Number fields that should be strings or vice versa\n- Agent IDs must be "a01", "a02" format\n- Object IDs must be "obj_1", "obj_2" format\n- Zone IDs must start with "zone_"\n- projectionSource must be "heuristic_2d"\n- All positions must have x, y, z (y-up coordinate system)`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: compiledSceneJsonSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini structuring");
      }

      const parsed = JSON.parse(text);

      // Validate against the full CompiledScenePackage schema
      const validated = CompiledScenePackageSchema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Structuring attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );

      if (attempt === MAX_RETRIES) {
        console.warn("Structuring exhausted retries, returning raw analysis with minimal structuring");
        const w = videoAnalysis.estimatedBounds.widthMeters;
        const d = videoAnalysis.estimatedBounds.depthMeters;
        const h = videoAnalysis.estimatedBounds.heightMeters;
        const floorPoly = {
          points: [
            { x: 0, z: 0 }, { x: w, z: 0 },
            { x: w, z: d }, { x: 0, z: d },
          ],
        };
        const fallback: CompiledScenePackage = {
          sceneId,
          sourceVideo: { durationSec: videoDurationSec ?? 0, width: 0, height: 0, fpsSampled: 0 },
          sceneContext: {
            estimatedLocation: {
              type: videoAnalysis.sceneContext.locationType,
              regionHint: videoAnalysis.sceneContext.regionHint,
              venueTypeHint: videoAnalysis.sceneContext.venueTypeHint,
              culturalCues: videoAnalysis.sceneContext.culturalCues,
            },
            estimatedTime: {
              timeOfDay: videoAnalysis.sceneContext.timeOfDay,
              dayTypeHint: videoAnalysis.sceneContext.dayTypeHint,
              seasonHint: videoAnalysis.sceneContext.seasonHint,
            },
            globalSummary: videoAnalysis.sceneContext.globalSummary,
            crowdDensity: videoAnalysis.sceneContext.crowdDensity,
            dominantActivity: videoAnalysis.sceneContext.dominantActivity,
          },
          environment: {
            spaceType: videoAnalysis.spaceType,
            bounds: { width: w, depth: d, height: h },
            floorPlan: floorPoly,
            walkableZones: [floorPoly],
            blockedZones: [],
            entrances: [],
            exits: [],
            objects: [],
            semanticZones: [],
            navigationGraph: { nodes: [], edges: [] },
          },
          agents: [],
          simulationConfig: {
            tickIntervalMs: 150,
            maxAgents: 20,
            pathfindingAlgorithm: "astar",
            cognitiveUpdateWindowSec: 5,
            maxCognitiveUpdatesPerWindow: 3,
            goalTtlDefaultSec: 30,
            collisionAvoidanceRadius: 0.4,
            stuckTickThreshold: 5,
            microBehaviorChancePerTick: 0.03,
          },
          style: {
            environmentPalette: {
              wallPrimary: styleExtraction.environmentPalette.wallPrimary,
              floor: styleExtraction.environmentPalette.floor,
              accent: styleExtraction.environmentPalette.accent,
              lightingMood: styleExtraction.environmentPalette.lightingMood,
            },
            dominantPalette: styleExtraction.dominantPalette,
            objectOverrides: [],
            agentStyleOverrides: [],
          },
          assets: {
            roomShell: "fallback_room",
            furniture: [],
            characters: [],
          },
          compileMetadata: {
            sceneConfidence: 0.2,
            geminiModel: "gemini-3.1-flash-lite-preview",
            uncertainty: ["structuring_fallback — raw analysis only, no nav graph"],
          },
        };
        return fallback;
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Structuring failed unexpectedly");
}
