import * as THREE from "three";
import type { StyleProfile } from "@next-state/shared";

/**
 * Applies StyleProfile colors to Three.js materials.
 * Used by Environment, FurnitureLoader, and AgentCrowd to ground
 * the scene visually in the uploaded video's palette.
 */

export function getWallMaterial(style: StyleProfile): THREE.MeshStandardMaterial {
  const color = style.environmentPalette.wallPrimary ?? "#d4c5b0";
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
}

export function getFloorMaterial(style: StyleProfile): THREE.MeshStandardMaterial {
  const color = style.environmentPalette.floor ?? "#6b5a4e";
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
  });
}

export function getObjectColor(
  objectId: string,
  defaultColor: string,
  style: StyleProfile,
): string {
  const override = style.objectOverrides.find((o) => o.objectId === objectId);
  return override?.primaryColor ?? defaultColor;
}

export function getAgentColor(
  agentId: string,
  defaultColor: string,
  style: StyleProfile,
): { top: string; bottom: string; accent: string } {
  const override = style.agentStyleOverrides.find((a) => a.agentId === agentId);
  return {
    top: override?.topColor ?? defaultColor,
    bottom: override?.bottomColor ?? defaultColor,
    accent: override?.accentColor ?? defaultColor,
  };
}

export function getLightingIntensity(
  style: StyleProfile,
): { ambient: number; directional: number; hemisphereIntensity: number } {
  const mood = style.environmentPalette.lightingMood ?? "neutral";
  switch (mood) {
    case "warm":
      return { ambient: 0.45, directional: 0.75, hemisphereIntensity: 0.35 };
    case "cool":
      return { ambient: 0.35, directional: 0.85, hemisphereIntensity: 0.25 };
    case "dim":
      return { ambient: 0.25, directional: 0.5, hemisphereIntensity: 0.2 };
    case "bright":
      return { ambient: 0.55, directional: 1.0, hemisphereIntensity: 0.4 };
    default:
      return { ambient: 0.4, directional: 0.8, hemisphereIntensity: 0.3 };
  }
}

export function getHemisphereColors(
  style: StyleProfile,
): { sky: string; ground: string } {
  const mood = style.environmentPalette.lightingMood ?? "neutral";
  switch (mood) {
    case "warm":
      return { sky: "#ffeedd", ground: "#443322" };
    case "cool":
      return { sky: "#ddeeff", ground: "#223344" };
    case "dim":
      return { sky: "#999999", ground: "#222222" };
    case "bright":
      return { sky: "#ffffff", ground: "#dddddd" };
    default:
      return { sky: "#ffeedd", ground: "#334455" };
  }
}

export function getMaterialProps(
  material: string | undefined,
): { roughness: number; metalness: number; opacity?: number } {
  switch (material) {
    case "wood": return { roughness: 0.65, metalness: 0.0 };
    case "metal": return { roughness: 0.3, metalness: 0.6 };
    case "plastic": return { roughness: 0.4, metalness: 0.1 };
    case "fabric": return { roughness: 0.85, metalness: 0.0 };
    case "glass": return { roughness: 0.05, metalness: 0.1, opacity: 0.3 };
    case "stone": return { roughness: 0.75, metalness: 0.0 };
    default: return { roughness: 0.7, metalness: 0.0 };
  }
}

export function getObjectMaterialProps(
  objectType: string,
): { roughness: number; metalness: number; emissive?: string; emissiveIntensity?: number } {
  switch (objectType) {
    case "table":
    case "desk":
    case "counter":
      return { roughness: 0.6, metalness: 0.0 };
    case "sofa":
      return { roughness: 0.85, metalness: 0.0 };
    case "laptop":
      return { roughness: 0.1, metalness: 0.7 };
    case "screen":
      return { roughness: 0.05, metalness: 0.3, emissive: "#2244aa", emissiveIntensity: 0.3 };
    case "plant":
      return { roughness: 0.9, metalness: 0.0 };
    case "coffee_machine":
      return { roughness: 0.3, metalness: 0.5 };
    case "whiteboard":
      return { roughness: 0.3, metalness: 0.0 };
    case "window":
      return { roughness: 0.05, metalness: 0.1 };
    case "bookshelf":
    case "cabinet":
      return { roughness: 0.65, metalness: 0.0 };
    case "stool":
      return { roughness: 0.5, metalness: 0.1 };
    case "trash_can":
      return { roughness: 0.4, metalness: 0.3 };
    case "light_fixture":
      return { roughness: 0.2, metalness: 0.5, emissive: "#ffffcc", emissiveIntensity: 0.5 };
    default:
      return { roughness: 0.7, metalness: 0.0 };
  }
}

function createFloorTexture(
  floorMaterial: string,
  baseColor: THREE.Color,
): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const hex = `#${baseColor.getHexString()}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);

  const darker = baseColor.clone().multiplyScalar(0.85);
  const darkerHex = `#${darker.getHexString()}`;

  switch (floorMaterial) {
    case "wood": {
      ctx.strokeStyle = darkerHex;
      ctx.lineWidth = 1;
      for (let y = 0; y < size; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      break;
    }
    case "tile": {
      ctx.strokeStyle = darkerHex;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, size, size);
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      break;
    }
    case "carpet": {
      const lighter = baseColor.clone().multiplyScalar(1.05);
      const lighterHex = `#${lighter.getHexString()}`;
      for (let x = 0; x < size; x += 4) {
        for (let y = 0; y < size; y += 4) {
          ctx.fillStyle = Math.random() > 0.5 ? darkerHex : lighterHex;
          ctx.fillRect(x, y, 2, 2);
        }
      }
      break;
    }
    // concrete, stone, unknown — flat (no pattern)
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

export function getFloorMaterialWithTexture(
  style: StyleProfile,
  boundsWidth: number,
  boundsDepth: number,
): THREE.MeshStandardMaterial {
  const color = style.environmentPalette.floor ?? "#6b5a4e";
  const floorMat = style.environmentPalette.floorMaterial ?? "concrete";
  const baseColor = new THREE.Color(color);

  if (floorMat === "concrete" || floorMat === "stone" || floorMat === "unknown") {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  }

  const texture = createFloorTexture(floorMat, baseColor);
  const repeatX = Math.max(1, Math.round(boundsWidth / 2));
  const repeatZ = Math.max(1, Math.round(boundsDepth / 2));
  texture.repeat.set(repeatX, repeatZ);

  return new THREE.MeshStandardMaterial({
    map: texture,
    color,
    roughness: floorMat === "carpet" ? 0.95 : 0.8,
  });
}

export function darkenColor(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return `#${c.getHexString()}`;
}
