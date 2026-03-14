import { useNextStateStore } from "./store/useNextStateStore";
import { UploadCard } from "./components/UploadCard";
import { SceneView } from "./components/SceneView";
import { CompileProgress } from "./components/CompileProgress";

export function App() {
  const sceneStatus = useNextStateStore((s) => s.sceneStatus);

  // idle -> UploadCard centered
  // uploading -> UploadCard (shows uploading state)
  // compiling -> CompileProgress
  // ready -> SceneView (full-screen)
  // error -> CompileProgress (shows error with retry) if we were compiling,
  //          otherwise UploadCard with error state
  if (sceneStatus === "ready") {
    return <SceneView />;
  }

  if (sceneStatus === "compiling") {
    return <CompileProgress />;
  }

  if (sceneStatus === "error") {
    // If we have compile progress data, show the compile progress error view
    const hasCompileData = useNextStateStore.getState().compileProgress !== null;
    if (hasCompileData) {
      return <CompileProgress />;
    }
    return <UploadCard />;
  }

  // idle, uploading
  return <UploadCard />;
}
