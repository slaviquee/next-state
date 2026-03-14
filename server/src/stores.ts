import type { JobState, CompiledScenePackage } from "@next-state/shared";
import { env } from "./env.js";

export const jobStore = new Map<string, JobState>();
export const sceneStore = new Map<string, CompiledScenePackage>();

// ---------------------------------------------------------------------------
// TTL Eviction — runs every 60s, purges entries older than SCENE_TTL_MINUTES
// ---------------------------------------------------------------------------

const TTL_CHECK_INTERVAL_MS = 60_000;
const ttlMs = env.SCENE_TTL_MINUTES * 60 * 1000;

setInterval(() => {
  const now = Date.now();

  for (const [jobId, job] of jobStore) {
    if (now - job.startedAt > ttlMs) {
      jobStore.delete(jobId);
    }
  }

  for (const [sceneId, scene] of sceneStore) {
    // Use compiledAt timestamp if available, otherwise check creation order
    const createdAt = (scene as unknown as { _storedAt?: number })._storedAt ?? 0;
    if (createdAt > 0 && now - createdAt > ttlMs) {
      sceneStore.delete(sceneId);
    }
  }
}, TTL_CHECK_INTERVAL_MS);

/**
 * Store a scene with a timestamp for TTL tracking.
 */
export function storeScene(sceneId: string, scene: CompiledScenePackage): void {
  (scene as unknown as { _storedAt: number })._storedAt = Date.now();
  sceneStore.set(sceneId, scene);
}
