import { useEffect, useCallback } from "react";
import { SceneRenderer } from "../scene/SceneRenderer";
import { AgentInspector } from "./AgentInspector";
import { InterventionToolbar } from "./InterventionToolbar";
import { startSimulation, stopSimulation } from "../simulation/engine";
import { useNextStateStore } from "../store/useNextStateStore";

export function SceneView() {
  const simRunning = useNextStateStore((s) => s.simRunning);
  const debugOverlayVisible = useNextStateStore((s) => s.debugOverlayVisible);
  const scene = useNextStateStore((s) => s.scene);

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore when typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      useNextStateStore.getState().toggleSimulation();
    }
    if (e.code === "KeyD") {
      useNextStateStore.getState().toggleDebug();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const sceneContext = scene?.sceneContext;
  const venueType = sceneContext?.estimatedLocation.venueTypeHint ?? scene?.environment.spaceType ?? "unknown";
  const timeOfDay = sceneContext?.estimatedTime.timeOfDay ?? "unknown";
  const crowdDensity = sceneContext?.crowdDensity ?? "unknown";

  return (
    <div className="relative w-full h-full">
      <SceneRenderer />

      {/* Top bar */}
      <div className="absolute top-4 left-4 flex items-center gap-3">
        <div className="bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg">
          next-state
        </div>
        <SimClock />
      </div>

      {/* Scene context info (top-left, below title) */}
      <div className="absolute top-14 left-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 space-y-0.5">
        <div className="text-neutral-400 text-[10px] uppercase tracking-wider">Scene</div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-neutral-300">{venueType.replace(/_/g, " ")}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{timeOfDay}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{crowdDensity} crowd</span>
        </div>
      </div>

      {/* Controls (bottom-left) */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <button
          className="bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors border border-white/10"
          onClick={() => useNextStateStore.getState().toggleSimulation()}
        >
          {simRunning ? "Pause" : "Play"}
        </button>
        <button
          className={`
            bg-black/60 backdrop-blur-sm text-sm px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors border border-white/10
            ${debugOverlayVisible ? "text-green-400" : "text-white"}
          `}
          onClick={() => useNextStateStore.getState().toggleDebug()}
        >
          Debug
        </button>
      </div>

      {/* Keyboard hints (bottom-left, above controls) */}
      <div className="absolute bottom-14 left-4 flex gap-2">
        <div className="text-neutral-600 text-[10px]">
          SPACE: play/pause | D: debug
        </div>
      </div>

      {/* Intervention Toolbar (bottom center) */}
      <InterventionToolbar />

      {/* Agent Inspector (right side) */}
      <AgentInspector />
    </div>
  );
}

function SimClock() {
  const simClock = useNextStateStore((s) => s.simClock);
  const sec = Math.floor(simClock / 1000);
  const min = Math.floor(sec / 60);
  const display = `${min}:${(sec % 60).toString().padStart(2, "0")}`;

  return (
    <div className="bg-black/60 backdrop-blur-sm text-neutral-300 text-sm px-3 py-1.5 rounded-lg font-mono">
      {display}
    </div>
  );
}
