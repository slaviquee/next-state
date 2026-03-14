import { useEffect, useRef } from "react";
import { useNextStateStore } from "../store/useNextStateStore";

const COMPILE_STEP_LABELS = [
  "Analyzing scene...",
  "Extracting style...",
  "Structuring world...",
  "Initializing agents...",
];

/**
 * Full-screen compile progress overlay.
 * Maps the server's compile progress (step name + 0-1 progress) to a
 * 4-step visual sequence.
 */
export function CompileProgress() {
  const compileProgress = useNextStateStore((s) => s.compileProgress);
  const sceneStatus = useNextStateStore((s) => s.sceneStatus);
  const errorMessage = useNextStateStore((s) => s.errorMessage);
  const setSceneStatus = useNextStateStore((s) => s.setSceneStatus);
  const setError = useNextStateStore((s) => s.setError);
  const resetToIdle = useNextStateStore((s) => s.resetToIdle);

  // Determine which step index we are on based on progress
  const progress = compileProgress?.progress ?? 0;
  const activeStepIndex = Math.min(
    Math.floor(progress * COMPILE_STEP_LABELS.length),
    COMPILE_STEP_LABELS.length - 1,
  );

  const isError = sceneStatus === "error";

  // Pulsing dot animation
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isError) return;
    const id = setInterval(() => {
      if (dotRef.current) {
        const dots = dotRef.current.textContent ?? "";
        dotRef.current.textContent = dots.length >= 3 ? "" : dots + ".";
      }
    }, 500);
    return () => clearInterval(id);
  }, [isError]);

  const handleRetry = () => {
    setError(null);
    resetToIdle();
  };

  return (
    <div className="flex items-center justify-center w-full h-full bg-neutral-950">
      <div className="w-[420px] bg-neutral-900/90 backdrop-blur-md rounded-2xl border border-neutral-700/50 p-8 space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-white">
            {isError ? "Compile Failed" : "Compiling Scene"}
          </h2>
          {!isError && (
            <p className="text-neutral-500 text-sm">
              Building your 3D world
              <span ref={dotRef} className="inline-block w-4 text-left" />
            </p>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {COMPILE_STEP_LABELS.map((label, i) => {
            let status: "pending" | "running" | "complete" | "error";
            if (isError) {
              status = i <= activeStepIndex ? (i === activeStepIndex ? "error" : "complete") : "pending";
            } else if (i < activeStepIndex) {
              status = "complete";
            } else if (i === activeStepIndex) {
              status = "running";
            } else {
              status = "pending";
            }

            return (
              <StepRow key={i} label={label} status={status} />
            );
          })}
        </div>

        {/* Error message */}
        {isError && errorMessage && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-3">
            <p className="text-red-400 text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Retry button */}
        {isError && (
          <div className="flex justify-center">
            <button
              className="bg-white/10 hover:bg-white/20 text-white text-sm px-6 py-2 rounded-lg transition-colors border border-white/10"
              onClick={handleRetry}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Progress bar */}
        {!isError && (
          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({
  label,
  status,
}: {
  label: string;
  status: "pending" | "running" | "complete" | "error";
}) {
  return (
    <div className="flex items-center gap-3">
      <StepIcon status={status} />
      <span
        className={`text-sm ${
          status === "pending"
            ? "text-neutral-600"
            : status === "error"
              ? "text-red-400"
              : status === "complete"
                ? "text-neutral-300"
                : "text-white"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepIcon({ status }: { status: "pending" | "running" | "complete" | "error" }) {
  if (status === "complete") {
    return (
      <div className="w-5 h-5 flex items-center justify-center rounded-full bg-green-500/20">
        <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="w-5 h-5 flex items-center justify-center">
        <svg className="animate-spin w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500/20">
        <svg className="w-3 h-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // pending
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-neutral-700" />
    </div>
  );
}
