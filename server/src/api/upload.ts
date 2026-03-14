import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { ai } from "../gemini.js";
import { jobStore } from "../stores.js";
import { env } from "../env.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_VIDEO_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/webm", "video/mpeg", "video/avi"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video format: ${file.mimetype}`));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post("/upload-video", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    const jobId = `job_${uuid().slice(0, 8)}`;

    jobStore.set(jobId, {
      jobId,
      status: "uploading",
      fileUri: null,
      fileMimeType: null,
      sceneId: null,
      currentStep: null,
      progress: 0,
      error: null,
      videoDurationSec: null,
      startedAt: Date.now(),
    });

    // Upload to Gemini Files API
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype });
    let uploadedFile = await ai.files.upload({
      file: blob,
      config: {
        mimeType: req.file.mimetype,
        displayName: `scene_video_${jobId}`,
      },
    });

    const job = jobStore.get(jobId)!;
    job.status = "processing_file";

    // Poll until ACTIVE
    while (uploadedFile.state === "PROCESSING") {
      await new Promise((r) => setTimeout(r, 2000));
      uploadedFile = await ai.files.get({ name: uploadedFile.name! });
    }

    if (uploadedFile.state === "FAILED") {
      job.status = "error";
      job.error = "File processing failed";
      res.status(500).json({ error: "File processing failed" });
      return;
    }

    job.fileUri = uploadedFile.uri!;
    job.fileMimeType = uploadedFile.mimeType!;
    job.progress = 0.1;

    // Extract video duration from Gemini Files API metadata
    const videoMeta = uploadedFile.videoMetadata as Record<string, unknown> | undefined;
    let videoDurationSec: number | null = null;
    if (videoMeta?.videoDuration && typeof videoMeta.videoDuration === "string") {
      const stripped = videoMeta.videoDuration.replace(/s$/, "");
      videoDurationSec = parseFloat(stripped);
      if (!Number.isFinite(videoDurationSec)) {
        videoDurationSec = null;
      }
    }

    if (videoDurationSec !== null && videoDurationSec > env.MAX_VIDEO_DURATION_SEC) {
      job.status = "error";
      job.error = `Video duration ${videoDurationSec}s exceeds maximum ${env.MAX_VIDEO_DURATION_SEC}s`;
      res.status(400).json({ error: job.error });
      return;
    }

    job.videoDurationSec = videoDurationSec;

    res.json({
      jobId,
      fileUri: uploadedFile.uri,
      videoDurationSec,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});
