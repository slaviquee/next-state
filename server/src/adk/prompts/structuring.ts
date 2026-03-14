/**
 * JSON structuring prompt for Gemini 3.1 Flash-Lite Preview.
 *
 * Takes raw video analysis + style extraction outputs and produces a fully
 * structured CompiledScenePackage-compatible format. Performs 2D->3D projection,
 * generates navigation graph, and runs consistency checks.
 */

/**
 * Build the structuring prompt with the actual analysis and style data injected.
 */
export function buildStructuringPrompt(
  videoAnalysisJson: string,
  styleExtractionJson: string,
  sceneId: string,
  videoDurationSec?: number,
): string {
  return `You are a 3D scene structuring expert. You will be given two JSON inputs:
1. A video analysis containing detected objects, persons, zones, entrances/exits, and scene context
2. A style extraction containing colors and lighting information

Your task is to merge these into a single, fully structured scene package ready for a 3D simulation engine.

## Input: Video Analysis
\`\`\`json
${videoAnalysisJson}
\`\`\`

## Input: Style Extraction
\`\`\`json
${styleExtractionJson}
\`\`\`

## Scene ID
Use this exact sceneId: "${sceneId}"

## Your task

Produce a JSON object that conforms to the CompiledScenePackage schema. You must:

### 1. Source video metadata
Set sourceVideo:
- durationSec: ${videoDurationSec !== undefined ? videoDurationSec : "unknown — estimate from video content, default to 10"}
- width: Estimate from video content (common values: 1920, 1280, 3840). Default to 1920 if unclear.
- height: Estimate from video content (common values: 1080, 720, 2160). Default to 1080 if unclear.
- fpsSampled: 2

### 2. Scene context
Map the videoAnalysis.sceneContext fields directly:
- estimatedLocation.type = sceneContext.locationType
- estimatedLocation.regionHint = sceneContext.regionHint
- estimatedLocation.venueTypeHint = sceneContext.venueTypeHint
- estimatedLocation.culturalCues = sceneContext.culturalCues
- estimatedTime.timeOfDay = sceneContext.timeOfDay
- estimatedTime.dayTypeHint = sceneContext.dayTypeHint
- estimatedTime.seasonHint = sceneContext.seasonHint
- estimatedTime.lightingEvidence = sceneContext.lightingEvidence
- globalSummary = sceneContext.globalSummary
- crowdDensity = sceneContext.crowdDensity
- dominantActivity = sceneContext.dominantActivity

### 3. Environment model

#### spaceType
Use the videoAnalysis.spaceType directly. Must be one of: cafe, office, meeting_room, corridor, classroom, lobby, unknown.

#### bounds
Use the videoAnalysis.estimatedBounds:
- width = estimatedBounds.widthMeters
- depth = estimatedBounds.depthMeters
- height = estimatedBounds.heightMeters

#### floorPlan
Create a rectangular polygon from the bounds:
points: [{x:0, z:0}, {x:width, z:0}, {x:width, z:depth}, {x:0, z:depth}]

#### walkableZones
Create walkable zone polygons. Start with a polygon slightly inset from the floor plan (0.3m margin). Then subtract areas occupied by large blocking objects. Return at least one walkable zone polygon.

#### blockedZones
Create blocked zone polygons around large objects that block movement (tables, counters, etc.). Each blocked zone should be a tight rectangle around the object footprint.

#### 2D to 3D projection (CRITICAL)

For each detected object and person, convert their 2D bounding box (normalized 0-1000) to 3D world coordinates using this heuristic:

Given room bounds (W = width, D = depth, H = height) and a bounding box {xMin, xMax, yMin, yMax}:

- horizontal center in frame: cx = (xMin + xMax) / 2000.0  (normalized 0-1)
- vertical center in frame: cy = (yMin + yMax) / 2000.0  (normalized 0-1)
- x position = cx * W  (maps horizontal frame position to room width)
- z position = cy * D  (maps vertical frame position to room depth — things at bottom of frame are close/near, things at top are far)
- y position = 0 for floor-standing objects, appropriate height for elevated objects

This is the "heuristic_2d" projection method. All spatialEstimate.projectionSource fields MUST be set to "heuristic_2d".

#### objects
For each detected object, create a SceneObject:
- id: "obj_" followed by 1-based index (e.g., "obj_1", "obj_2")
- type: Map the label to the enum. Valid types: table, chair, desk, counter, sofa, door, wall, laptop, coffee_machine, screen, plant, unknown
- position: {x, y, z} from 2D->3D projection. y=0 for floor objects.
- rotationY: 0 (default, no rotation data available)
- scale: Use estimated dimensions if available. Otherwise use sensible defaults:
  - table: {x:1.2, y:0.75, z:0.8}
  - chair: {x:0.5, y:0.85, z:0.5}
  - desk: {x:1.4, y:0.75, z:0.7}
  - counter: {x:2.0, y:1.0, z:0.6}
  - sofa: {x:1.8, y:0.8, z:0.8}
  - laptop: {x:0.35, y:0.02, z:0.25}
  - coffee_machine: {x:0.4, y:0.5, z:0.35}
  - screen: {x:0.6, y:0.4, z:0.05}
  - plant: {x:0.3, y:0.6, z:0.3}
  - default: {x:0.5, y:0.5, z:0.5}
- interactable: from detection
- blocksMovement: from detection
- occupiedByAgentId: null (will be set during simulation)
- styleHints: Use colors from style extraction's objectColors array if available. Match by objectIndex.

#### entrances and exits
For each detected entrance/exit, create a Portal:
- id: "entrance_" or "exit_" followed by 1-based index
- position: 2D->3D projected position. For entrances near the bottom of frame, z should be near 0. For exits, place at the appropriate edge.
- facingAngle: Angle in radians. 0 = facing +z, PI/2 = facing +x, PI = facing -z, -PI/2 = facing -x. Infer from position relative to room center.
- width: estimatedWidthMeters from detection
- type: from detection (door, opening, corridor_end, unknown)

If a portal is both entrance and exit, create both with the same position.

#### semanticZones
For each detected zone, create a SemanticZone:
- id: "zone_" + label (e.g., "zone_main_seating")
- type: from detection
- polygon: Convert the zone boundingBox to a floor-plane polygon using the same 2D->3D heuristic. A bounding box becomes 4 corner points: {x:x1, z:z1}, {x:x2, z:z1}, {x:x2, z:z2}, {x:x1, z:z2}
- attractivenessWeight: 0.8 for seating, 0.6 for service, 0.2 for circulation, 0.1 for entry/exit, 0.5 for others
- capacity: from detection
- occupantIds: Map occupantPersonIndices to agent IDs ("a" + padded two-digit index, e.g., person 0 -> "a01")
- queueIds: empty array

#### navigationGraph
Generate a navigation graph:

1. Create a nav node at the centroid of each semantic zone:
   - id: "nav_" + zone label (e.g., "nav_main_seating")
   - position: centroid {x, z} of the zone polygon
   - zoneId: the zone's id
   - isPortal: true only for entry/exit zone nodes

2. Create a nav node at each entrance/exit portal:
   - id: "nav_portal_" + portal id
   - position: portal's {x, z}
   - isPortal: true

3. Create edges between nodes:
   - Connect each portal node to the nearest zone centroid node
   - Connect adjacent zone centroid nodes (zones that share a boundary or are close together)
   - Connect circulation zone nodes to all neighboring zone nodes
   - Weight = Euclidean distance between the two node positions
   - blocked: false for all initial edges

4. Ensure the graph is connected — every node should be reachable from every other node. If not, add edges to connect isolated components.

### 4. Agents
For each detected person, create an AgentModel:
- id: "a" + zero-padded two-digit personIndex+1 (e.g., person 0 -> "a01", person 1 -> "a02")
- visual.assetId: "char_" + agent id (e.g., "char_a01")
- visual.gender, ageGroup, bodyType, heightBucket: from detection
- visual.clothingColors: {top: topColor, bottom: bottomColor, accent: accentColor} from style extraction's personClothingColors. Fall back to the person detection colors if not available in style data.
- visual.clothingStyle: from detection
- visual.props: from detection
- visual.initialPose: from detection (standing, sitting, walking)
- visual.spatialEstimate: 2D->3D projected position, with projectionSource "heuristic_2d", confidence3d between 0.5-0.9 based on detection confidence, and the original videoBoundingBox
- social: Initialize with groupId from detection (format: "group_" + groupIndex if in a group), companionIds from group members, followTendency 0.7 for group members else 0.1, sociability 0.8 for staff else 0.3-0.6, interactionCooldownSec 10
- mind: Initialize with a basic archetype guess based on apparent activity:
  - Staff/employee -> "staff"
  - Working alone at desk/laptop -> "seated_worker"
  - In a social group -> "social_group_member"
  - Standing near entrance -> "waiting_guest" or "uncertain_visitor"
  - Walking toward exit -> "person_leaving"
  - Recently arrived -> "late_arrival"
  - Default -> "unknown"
- mind.primaryGoal: type "stay_put" for seated/working, "find_seat" for standing guests, "approach_counter" for people near service area. urgency 0.3-0.8 based on apparent activity. ttlSec 30.
- mind.currentIntent: the person's apparentActivity
- mind.arousal, patience, curiosity, conformity: Reasonable defaults 0.3-0.7 based on archetype
- mind.reactionStyle: "calm" for seated, "hesitant" for visitors, "goal_directed" for staff
- mind.likelyNextActions: 3 actions with probabilities summing to ~1.0
- mind.confidence: from detection confidence
- locomotion: speed 0 if sitting else 0.8, maxSpeed 1.4, acceleration 0.8, isMoving true only if walking, isBlocked false, stuckTickCount 0
- runtime: position from spatial estimate, velocity {x:0,y:0,z:0}, heading 0, currentPath [], animationState "sit"/"walk"/"idle" based on pose, blocked false, lastDecisionAt 0, nextMindRefreshAt 5000, goalStartedAt 0, goalChangedCount 0, lastInteractionAt null, lastInteractionPartnerId null, activeInteractionId null, occupyingObjectId (assign to nearest chair/seat if sitting, null otherwise), occupyingZoneId null, queuePosition null, queueTargetZoneId null, recentEvents []

### 5. Simulation config
Use these fixed values:
- tickIntervalMs: 150
- maxAgents: 25
- pathfindingAlgorithm: "astar"
- collisionAvoidanceRadius: 0.5
- cognitiveUpdateWindowSec: 3
- maxCognitiveUpdatesPerWindow: 3
- microBehaviorChancePerTick: 0.05
- goalTtlDefaultSec: 30
- stuckTickThreshold: 5

### 6. Style
- environmentPalette: from style extraction
- dominantPalette: from style extraction (top 5)
- objectOverrides: Map style extraction objectColors to {objectId: "obj_N", primaryColor, secondaryColor}
- agentStyleOverrides: Map style extraction personClothingColors to {agentId: "aNN", topColor, bottomColor, accentColor}

### 7. Assets
- roomShell: "parametric"
- furniture: For each object, {objectId, assetPath: "parametric"}
- characters: empty array (no character models in MVP)

### 8. Compile metadata
- sceneConfidence: Average of all detection confidences (objects + persons), clamped 0.5-0.95
- geminiModel: "gemini-3.1-flash-lite-preview"
- uncertainty: List any issues found during consistency checks as string array

## Consistency checks

Before finalizing, verify:
1. All agent IDs referenced in occupantIds, companionIds, etc. actually exist in the agents array
2. All object IDs referenced exist in the objects array
3. All zone IDs referenced in nav graph nodes exist in semanticZones
4. All nav edges reference valid node IDs
5. The navigation graph is connected
6. No two objects occupy the exact same position
7. Agent positions are within the room bounds
8. Zone polygons don't extend beyond room bounds

If any check fails, fix the issue and add a note to compileMetadata.uncertainty.

## Important rules

1. IDs must follow the naming convention: agents "a01"-"a99", objects "obj_1"-"obj_999", zones "zone_*"
2. All positions use Y-up coordinate system: x = left-right, y = up (0 = floor level), z = near-far
3. All spatial values are in meters
4. projectionSource MUST be "heuristic_2d" for all spatial estimates
5. Return valid JSON matching the CompiledScenePackage schema exactly
6. Do NOT invent people or objects not present in the analysis input`;
}
