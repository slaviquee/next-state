import { z } from "zod";

export const JobStateSchema = z.object({
  jobId: z.string(),
  status: z.enum(["uploading", "processing_file", "compiling", "complete", "error"]),
  fileUri: z.string().nullable(),
  fileMimeType: z.string().nullable(),
  sceneId: z.string().nullable(),
  currentStep: z.string().nullable(),
  progress: z.number().min(0).max(1),
  error: z.string().nullable(),
  videoDurationSec: z.number().nullable(),
  startedAt: z.number(),
});
