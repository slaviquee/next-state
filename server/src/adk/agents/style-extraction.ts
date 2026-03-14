import { ai } from "../../gemini.js";
import { STYLE_EXTRACTION_PROMPT } from "../prompts/style-extraction.js";
import {
  StyleExtractionOutputSchema,
  styleExtractionJsonSchema,
  type StyleExtractionOutput,
} from "../schemas.js";

const MODEL = "gemini-3.1-flash-lite-preview";
const MAX_RETRIES = 2;

/**
 * Run style/palette extraction using Gemini 3.1 Flash-Lite Preview.
 *
 * Sends the video file URI along with the style extraction prompt and
 * expects structured JSON back. Retries up to MAX_RETRIES times on
 * failure, including Zod validation errors in the retry prompt.
 */
export async function runStyleExtraction(
  fileUri: string,
  fileMimeType: string,
): Promise<StyleExtractionOutput> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemPrompt =
        attempt === 0
          ? STYLE_EXTRACTION_PROMPT
          : `${STYLE_EXTRACTION_PROMPT}\n\n## RETRY NOTICE\nYour previous response failed validation. Error:\n${lastError?.message}\n\nPlease fix the issues and return valid JSON matching the schema exactly.`;

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
          responseJsonSchema: styleExtractionJsonSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini style extraction");
      }

      const parsed = JSON.parse(text);
      const validated = StyleExtractionOutputSchema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Style extraction attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Style extraction failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`,
        );
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Style extraction failed unexpectedly");
}
