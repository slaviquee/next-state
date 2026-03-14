import type { JobState, CompiledScenePackage } from "@next-state/shared";

export const jobStore = new Map<string, JobState>();
export const sceneStore = new Map<string, CompiledScenePackage>();
