import { ai } from "../../gemini.js";
import { VIDEO_ANALYSIS_PROMPT } from "../prompts/video-analysis.js";
import {
  VideoAnalysisOutputSchema,
  videoAnalysisJsonSchema,
  type VideoAnalysisOutput,
} from "../schemas.js";

const MODEL = "gemini-3.1-pro-preview";
const MAX_RETRIES = 2;

/**
 * Run video analysis using Gemini 3.1 Pro Preview.
 *
 * Sends the video file URI along with a detailed analysis prompt and
 * expects structured JSON back. Retries up to MAX_RETRIES times on
 * failure, including Zod validation errors in the retry prompt.
 */
export async function runVideoAnalysis(
  fileUri: string,
  fileMimeType: string,
): Promise<VideoAnalysisOutput> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemPrompt =
        attempt === 0
          ? VIDEO_ANALYSIS_PROMPT
          : `${VIDEO_ANALYSIS_PROMPT}\n\n## RETRY NOTICE\nYour previous response failed validation. Error:\n${lastError?.message}\n\nPlease fix the issues and return valid JSON matching the schema exactly.`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { mimeType: fileMimeType, fileUri } },
              { text: systemPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: videoAnalysisJsonSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini video analysis");
      }

      const parsed = JSON.parse(text);
      const validated = VideoAnalysisOutputSchema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Video analysis attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Video analysis failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`,
        );
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Video analysis failed unexpectedly");
}
