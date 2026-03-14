import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { useNextStateStore } from "../store/useNextStateStore";
import { Environment } from "./Environment";
import { AgentCrowd } from "./AgentCrowd";
import { AgentLabels } from "./AgentLabels";
import { AgentClickHandler } from "./AgentClickHandler";
import { CameraController } from "./CameraController";
import { DebugOverlay } from "../components/DebugOverlay";

export function SceneRenderer() {
  const scene = useNextStateStore((s) => s.scene);
  if (!scene) return null;

  const { width, depth, height } = scene.environment.bounds;

  return (
    <Canvas
      camera={{
        position: [width / 2, height * 1.2, depth * 1.5],
        fov: 50,
        near: 0.1,
        far: 200,
      }}
      gl={async ({ canvas }) => {
        const renderer = new WebGPURenderer({ canvas: canvas as HTMLCanvasElement, antialias: true });
        await renderer.init();
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        return renderer;
      }}
      style={{ width: "100%", height: "100%" }}
      onPointerMissed={() => useNextStateStore.getState().selectAgent(null)}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[width, height * 2, depth / 2]}
        intensity={0.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <hemisphereLight
        args={["#ffeedd", "#334455", 0.3]}
      />

      <Environment environment={scene.environment} style={scene.style} />
      <AgentCrowd />
      <AgentClickHandler />
      <AgentLabels />
      <DebugOverlay />
      <CameraController />
    </Canvas>
  );
}
