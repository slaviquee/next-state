/**
 * Structuring prompt for Gemini 3.1 Flash-Lite Preview.
 *
 * The model returns a compact "scene interpretation" object rather than a full
 * CompiledScenePackage. Deterministic code expands this interpretation into the
 * final runtime package.
 */

export function buildStructuringPrompt(
  videoAnalysisJson: string,
  styleExtractionJson: string,
  sceneId: string,
  videoDurationSec?: number,
): string {
  return `You are a 3D scene structuring expert.

You will be given:
1. A video analysis JSON with detected people, objects, zones, entrances/exits, and scene context
2. A style extraction JSON with palette and clothing colors

Your job is NOT to generate the full runtime package.
Instead, return a smaller JSON "scene interpretation" that refines layout semantics, zone structure, object grounding, and agent placement.

The application code will deterministically build the final CompiledScenePackage afterward.

## Input: Video Analysis
\`\`\`json
${videoAnalysisJson}
\`\`\`

## Input: Style Extraction
\`\`\`json
${styleExtractionJson}
\`\`\`

## Derived IDs to use
- Agent IDs: personIndex 0 -> "a01", 1 -> "a02", etc.
- Object IDs: object index 0 -> "obj_1", 1 -> "obj_2", etc.
- Entrance IDs: entrance index 0 -> "entrance_1", 1 -> "entrance_2", etc.
- Exit IDs: exit index 0 -> "exit_1", 1 -> "exit_2", etc.
- Zone IDs: "zone_" + label from videoAnalysis.zones

## Scene metadata
- sceneId: "${sceneId}"
- sourceVideo.durationSec default: ${videoDurationSec !== undefined ? videoDurationSec : 10}

## Return shape
Return a JSON object with ONLY these top-level fields when useful:
- sourceVideo
- sceneContext
- environment
- agents
- style
- compileMetadata

Do NOT return:
- simulationConfig
- assets
- navigationGraph
- full runtime-only state beyond agent placement/occupancy hints

## What to refine

### 1. sceneContext
Only include this if you want to refine the raw scene context.
You may improve:
- venue type wording
- geographic/cultural cues
- lighting interpretation
- dominant activity
- crowd density confidence

### 2. environment
This is the most important part.
Refine:
- spaceType
- floorPlan
- walkableZones
- blockedZones
- entrances / exits
- objects
- semanticZones

Rules:
- Polygons must be objects shaped like { "points": [{ "x": number, "z": number }, ...] }
- Keep coordinates in meters
- Use the room bounds from videoAnalysis
- Prefer simple, valid geometry over complex geometry
- Semantic zones should cover the meaningful usable areas of the room
- Use the existing object/agent IDs described above

For objects:
- Only refer to objects already implied by videoAnalysis
- Use ids like "obj_1"
- You may refine type, position, rotationY, scale, interactable, blocksMovement, and styleHints
- Do not invent dozens of extra objects

For entrances/exits:
- Use ids like "entrance_1" / "exit_1"
- You may refine position, facingAngle, width, and type

For semanticZones:
- Include descriptive zone ids like "zone_workspace" or "zone_presentation_area"
- Set type, polygon, attractivenessWeight, capacity, occupantIds, queueIds
- Occupant IDs must reference valid agent ids

### 3. agents
Only return lightweight overrides for detected agents.
Do NOT generate full minds or runtime state.

Useful agent fields:
- id
- visual.initialPose
- visual.spatialEstimate
- social.groupId
- social.companionIds
- runtime.position
- runtime.occupyingObjectId
- runtime.occupyingZoneId

Rules:
- Use only existing detected agents ("a01", "a02", ...)
- Never use null for optional string fields like groupId. Omit them instead
- If you provide likely placements, make them physically plausible relative to zones/objects

### 4. style
Only include when you want to refine:
- environmentPalette
- dominantPalette
- objectOverrides
- agentStyleOverrides

### 5. compileMetadata
Optional:
- sceneConfidence
- uncertainty

## Important constraints
1. Return valid JSON only
2. Never use null for optional fields; omit them instead
3. Do not output placeholder prose
4. Do not invent new top-level fields
5. Do not output the full CompiledScenePackage
6. Focus on semantic structure and grounded placement, not runtime simulation details

## Goal
Produce the best possible compact scene interpretation so deterministic code can expand it into a realistic, valid CompiledScenePackage for the browser runtime.`;
}
