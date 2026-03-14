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
