import type {
  UploadVideoResponse,
  CompileSceneResponse,
  CompiledScenePackage,
  AgentRefreshRequest,
  AgentRefreshResponse,
  InterventionRequest,
  InterventionResponse,
} from "@next-state/shared";

const BASE = "/api";

export async function uploadVideo(file: File): Promise<UploadVideoResponse> {
  const form = new FormData();
  form.append("video", file);
  const res = await fetch(`${BASE}/upload-video`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  return res.json();
}

export async function compileScene(jobId: string): Promise<CompileSceneResponse> {
  const res = await fetch(`${BASE}/compile-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) throw new Error(`Compile failed: ${res.statusText}`);
  return res.json();
}

export async function fetchScene(sceneId: string): Promise<CompiledScenePackage> {
  const res = await fetch(`${BASE}/scene/${sceneId}`);
  if (!res.ok) throw new Error(`Fetch scene failed: ${res.statusText}`);
  return res.json();
}

export function subscribeProgress(
  jobId: string,
  onStep: (data: { step: string; status: string; progress: number }) => void,
  onComplete: (data: { sceneId: string; status: string }) => void,
  onError: (err: string) => void,
): () => void {
  const es = new EventSource(`${BASE}/compile-progress/${jobId}`);

  es.addEventListener("step", (e) => {
    onStep(JSON.parse(e.data));
  });

  es.addEventListener("complete", (e) => {
    const data = JSON.parse(e.data);
    onComplete(data);
    es.close();
  });

  es.addEventListener("error", (e) => {
    if (e instanceof MessageEvent) {
      onError(JSON.parse(e.data).error);
    }
    es.close();
  });

  return () => es.close();
}

export async function refreshAgents(
  request: AgentRefreshRequest,
): Promise<AgentRefreshResponse> {
  const res = await fetch(`${BASE}/agent-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Agent refresh failed: ${res.statusText}`);
  return res.json();
}

export async function sendIntervention(
  request: InterventionRequest,
): Promise<InterventionResponse> {
  const res = await fetch(`${BASE}/intervention`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Intervention failed: ${res.statusText}`);
  return res.json();
}
