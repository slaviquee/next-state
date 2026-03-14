import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MAX_VIDEO_DURATION_SEC: z.coerce.number().default(20),
  MAX_VIDEO_SIZE_MB: z.coerce.number().default(100),
  SCENE_TTL_MINUTES: z.coerce.number().default(60),
});

export const env = EnvSchema.parse(process.env);
