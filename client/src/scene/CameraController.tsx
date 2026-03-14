import { useRef, useEffect } from "react";
import { OrbitControls } from "@react-three/drei";
import { useNextStateStore } from "../store/useNextStateStore";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export function CameraController() {
  const scene = useNextStateStore((s) => s.scene);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const bounds = scene?.environment.bounds;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !bounds) return;

    const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.depth * bounds.depth);
    const maxPanOffset = diagonal * 0.3;
    const centerX = bounds.width / 2;
    const centerZ = bounds.depth / 2;

    const clampPan = () => {
      const target = controls.target;
      target.x = Math.max(centerX - maxPanOffset, Math.min(centerX + maxPanOffset, target.x));
      target.z = Math.max(centerZ - maxPanOffset, Math.min(centerZ + maxPanOffset, target.z));
    };

    controls.addEventListener("change", clampPan);
    return () => controls.removeEventListener("change", clampPan);
  }, [bounds]);

  if (!scene) return null;

  const { width, depth, height } = scene.environment.bounds;
  const diagonal = Math.sqrt(width * width + depth * depth);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[width / 2, 0, depth / 2]}
      minDistance={height * 0.5}
      maxDistance={diagonal * 3}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2 - 0.05}
      enablePan
      panSpeed={0.5}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
