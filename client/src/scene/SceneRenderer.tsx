import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import type { StyleProfile } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";
import { Environment } from "./Environment";
import { AgentCrowd } from "./AgentCrowd";
import { AgentLabels } from "./AgentLabels";
import { AgentClickHandler } from "./AgentClickHandler";
import { CameraController } from "./CameraController";
import { DebugOverlay } from "../components/DebugOverlay";
import { getLightingIntensity, getHemisphereColors } from "./StyleApplicator";

function SceneLighting({
  style,
  bounds,
}: {
  style: StyleProfile;
  bounds: { width: number; depth: number; height: number };
}) {
  const lighting = useMemo(() => getLightingIntensity(style), [style]);
  const hemisphere = useMemo(() => getHemisphereColors(style), [style]);

  const warmth = style.environmentPalette.overallWarmth ?? 0.5;
  const lightColor = useMemo(() => {
    const r = 1.0;
    const g = 0.95 + (warmth - 0.5) * 0.1;
    const b = 1.0 - (warmth - 0.5) * 0.4;
    return new THREE.Color(r, Math.min(1, Math.max(0.8, g)), Math.min(1, Math.max(0.6, b)));
  }, [warmth]);

  const dirLightPos = useMemo((): [number, number, number] => {
    const dir = style.environmentPalette.lightingDirection ?? "overhead";
    const h = bounds.height * 2;
    const cx = bounds.width / 2;
    const cz = bounds.depth / 2;
    switch (dir) {
      case "left": return [0, h, cz];
      case "right": return [bounds.width, h, cz];
      case "front": return [cx, h, 0];
      case "back": return [cx, h, bounds.depth];
      case "diffuse": return [cx, h, cz];
      default: return [cx, h, cz];
    }
  }, [style.environmentPalette.lightingDirection, bounds]);

  const shadowCamSize = Math.max(bounds.width, bounds.depth) * 0.75;

  return (
    <>
      <ambientLight intensity={lighting.ambient} color={lightColor} />
      <directionalLight
        position={dirLightPos}
        intensity={lighting.directional}
        color={lightColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowCamSize}
        shadow-camera-right={shadowCamSize}
        shadow-camera-top={shadowCamSize}
        shadow-camera-bottom={-shadowCamSize}
        shadow-camera-near={0.1}
        shadow-camera-far={bounds.height * 4}
      />
      <hemisphereLight
        args={[hemisphere.sky, hemisphere.ground, lighting.hemisphereIntensity]}
      />
    </>
  );
}

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
      <SceneLighting style={scene.style} bounds={scene.environment.bounds} />

      <Environment environment={scene.environment} style={scene.style} />
      <AgentCrowd />
      <AgentClickHandler />
      <AgentLabels />
      <DebugOverlay />
      <CameraController />
    </Canvas>
  );
}
