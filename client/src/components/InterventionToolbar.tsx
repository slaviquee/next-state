import { useState, useCallback } from "react";
import { useNextStateStore } from "../store/useNextStateStore";
import { sendIntervention } from "../api/client";

export function InterventionToolbar() {
  const scene = useNextStateStore((s) => s.scene);
  const triggerIntervention = useNextStateStore((s) => s.triggerIntervention);
  const fastForward = useNextStateStore((s) => s.fastForward);
  const [busy, setBusy] = useState<string | null>(null);

  const handleBlockCorridor = useCallback(async () => {
    if (!scene || busy) return;
    setBusy("block_corridor");
    try {
      await sendIntervention({
        sceneId: scene.sceneId,
        type: "block_corridor",
        params: { zoneId: "zone_main_corridor" },
      });
    } catch {
      // Server may not be running; apply locally anyway
    }
    triggerIntervention("block_corridor", { zoneId: "zone_main_corridor" });
    setBusy(null);
  }, [scene, busy, triggerIntervention]);

  const handleAddPeople = useCallback(async () => {
    if (!scene || busy) return;
    setBusy("add_people");
    try {
      await sendIntervention({
        sceneId: scene.sceneId,
        type: "add_people",
        params: { count: 3 },
      });
    } catch {
      // Server may not be running; apply locally anyway
    }
    triggerIntervention("add_people", { count: 3 });
    setBusy(null);
  }, [scene, busy, triggerIntervention]);

  const handleMoveTable = useCallback(() => {
    if (!scene || busy) return;
    setBusy("move_table");
    // Find first table and move it to a random position within bounds
    const table = scene.environment.objects.find((o) => o.type === "table");
    if (table) {
      const newX = Math.random() * scene.environment.bounds.width * 0.6 + scene.environment.bounds.width * 0.2;
      const newZ = Math.random() * scene.environment.bounds.depth * 0.6 + scene.environment.bounds.depth * 0.2;
      triggerIntervention("move_table", { objectId: table.id, position: { x: newX, z: newZ } });
    }
    setBusy(null);
  }, [scene, busy, triggerIntervention]);

  const handleMarkCongested = useCallback(() => {
    if (!scene || busy) return;
    setBusy("mark_congested");
    // Find first non-exit zone with occupants
    const zones = scene.environment.semanticZones;
    const zone = zones.find((z) => z.type !== "exit" && z.type !== "entry");
    if (zone) {
      triggerIntervention("mark_congested", { zoneId: zone.id });
    }
    setBusy(null);
  }, [scene, busy, triggerIntervention]);

  const handleMakeExitAttractive = useCallback(() => {
    if (!scene || busy) return;
    setBusy("make_exit_attractive");
    triggerIntervention("make_exit_attractive", {});
    setBusy(null);
  }, [scene, busy, triggerIntervention]);

  const handleFastForward = useCallback(() => {
    if (busy) return;
    fastForward(10);
  }, [busy, fastForward]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-2">
      <ToolbarButton
        label="Block Corridor"
        loading={busy === "block_corridor"}
        onClick={handleBlockCorridor}
      />
      <ToolbarButton
        label="Add People"
        loading={busy === "add_people"}
        onClick={handleAddPeople}
      />
      <ToolbarButton
        label="Move Table"
        loading={busy === "move_table"}
        onClick={handleMoveTable}
      />
      <ToolbarButton
        label="Mark Congested"
        loading={busy === "mark_congested"}
        onClick={handleMarkCongested}
      />
      <ToolbarButton
        label="Exit Attractive"
        loading={busy === "make_exit_attractive"}
        onClick={handleMakeExitAttractive}
      />
      <ToolbarButton
        label="Fast Forward 10s"
        loading={false}
        onClick={handleFastForward}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`
        bg-black/60 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg
        hover:bg-black/80 active:bg-black/90 transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        border border-white/10
      `}
      disabled={loading}
      onClick={onClick}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
