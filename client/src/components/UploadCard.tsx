import { useCallback, useRef, useState } from "react";
import { uploadVideo, compileScene, fetchScene, subscribeProgress } from "../api/client";
import { useNextStateStore } from "../store/useNextStateStore";

export function UploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const setSceneStatus = useNextStateStore((s) => s.setSceneStatus);
  const setCompileProgress = useNextStateStore((s) => s.setCompileProgress);
  const setError = useNextStateStore((s) => s.setError);
  const loadScene = useNextStateStore((s) => s.loadScene);
  const sceneStatus = useNextStateStore((s) => s.sceneStatus);
  const compileProgress = useNextStateStore((s) => s.compileProgress);

  const handleFile = useCallback(async (file: File) => {
    try {
      setSceneStatus("uploading");
      setError(null);

      const { jobId } = await uploadVideo(file);

      setSceneStatus("compiling");

      // Subscribe to progress
      subscribeProgress(
        jobId,
        (data) => setCompileProgress({ step: data.step, progress: data.progress }),
        async (data) => {
          const scene = await fetchScene(data.sceneId);
          loadScene(scene);
        },
        (err) => setError(err),
      );

      // Also trigger compile
      await compileScene(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }, [setSceneStatus, setCompileProgress, setError, loadScene]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isProcessing = sceneStatus === "uploading" || sceneStatus === "compiling";

  return (
    <div className="flex items-center justify-center w-full h-full bg-neutral-950">
      <div
        className={`
          relative w-[480px] rounded-2xl border-2 border-dashed p-10 text-center
          transition-all duration-200 cursor-pointer
          ${dragging ? "border-blue-400 bg-blue-400/10" : "border-neutral-600 bg-neutral-900 hover:border-neutral-400"}
          ${isProcessing ? "pointer-events-none opacity-70" : ""}
        `}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={handleChange}
        />

        {isProcessing ? (
          <div className="space-y-4">
            <div className="text-lg text-neutral-300">
              {sceneStatus === "uploading" ? "Uploading video..." : "Compiling scene..."}
            </div>
            {compileProgress && (
              <div className="space-y-2">
                <div className="text-sm text-neutral-400">
                  {compileProgress.step.replace(/_/g, " ")}
                </div>
                <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${compileProgress.progress * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">🎬</div>
            <div className="text-lg font-medium text-neutral-200">
              Drop a video to begin
            </div>
            <div className="text-sm text-neutral-500">
              MP4, MOV, or WebM — up to 20 seconds
            </div>
          </div>
        )}
      </div>

      {sceneStatus === "error" && (
        <div className="absolute bottom-8 text-red-400 text-sm">
          {useNextStateStore.getState().errorMessage}
        </div>
      )}
    </div>
  );
}
