import { OrbitControls } from "@react-three/drei";
import { useNextStateStore } from "../store/useNextStateStore";

export function CameraController() {
  const scene = useNextStateStore((s) => s.scene);
  if (!scene) return null;

  const { width, depth, height } = scene.environment.bounds;
  const diagonal = Math.sqrt(width * width + depth * depth);

  return (
    <OrbitControls
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
