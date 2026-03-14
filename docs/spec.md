# next-state — Technical Specification & Architecture
**Revision 4.0 — March 2026**

---

## 1. Overview

### Working title
**Transform any video into a live simulation**

### One-line summary
Upload a short real-world video of a physical space. The system compiles it into a stylized 3D scene, instantiates plausible agents with LLM-driven minds, and simulates what happens next.

### Product thesis
Humans do not just look at scenes — they mentally simulate them.
This product turns video into a predictive world model for physical spaces.

### Core demo promise
- User uploads a 10–15 second video in the browser.
- Backend extracts scene structure, people, style cues, and plausible intents using **Gemini 3.1 Pro Preview** for scene reasoning and **Gemini 3.1 Flash-Lite Preview** for fast tasks, via the **Files API**.
- Frontend builds a video-grounded 3D scene in **Three.js r183** with `WebGPURenderer`.
- Agents continue acting inside the scene, driven by a **utility-based simulation engine** with sparse **Gemini 3.1 Flash-Lite Preview** cognitive updates.
- User can inspect agents, fast-forward the scene, and trigger world interventions.

---

## 2. Product goals

### Primary goal
Deliver a **credible, impressive browser demo** that feels like a new primitive:
**video → world model → agents → live simulation**.

### Secondary goals
- Make the scene feel grounded in the uploaded video through layout, palette, and agent placement.
- Make agents feel alive — not scripted mannequins.
- Keep architecture hackathon-feasible while leaning into the latest Google AI capabilities (ADK, Gemini 3.1 video understanding, structured outputs).
- Preserve a path toward future use cases: crowd simulation, venue stress tests, robotics training, safety analysis, what-if scenarios.

### Non-goals for MVP
- Photoreal 1:1 reconstruction of any environment.
- Identity cloning of real people in the video.
- Full physics simulation.
- High-fidelity social psychology.
- Safety-grade evacuation prediction.
- Live streaming reconstruction.

---

## 3. Product principles

1. **Video-grounded, not video-copied** — the output feels tied to the source through layout, palette, visible objects, and agent placement. No perfect reconstruction required.
2. **Stylized over photoreal** — a coherent stylized scene beats an unstable realistic one.
3. **Local simulation, sparse cognition** — motion runs locally and continuously; LLM calls happen only at compile time and sparse cognitive update points.
4. **Stateful world, not animation playback** — the simulation is a live world state, not a pre-rendered clip.
5. **One magical loop**: upload video → compile scene → watch agents continue living → inspect / predict / intervene.

---

## 4. User experience

### MVP user flow
1. User lands on web app.
2. User uploads a short video (10–15 seconds, MP4/MOV/WebM).
3. UI shows "understanding scene…" progress state.
4. Backend uploads video to Gemini Files API, runs compile pipeline, returns `CompiledScenePackage`.
5. Browser builds stylized 3D environment in Three.js.
6. Agents appear at approximate positions and begin behaving.
7. User can:
   - Orbit or move camera.
   - Click an agent to inspect role / goal / likely next action.
   - Fast-forward 10 seconds.
   - Trigger simple world interventions (block corridor, add people, etc.).

### Key demo moments
- "Your video becomes a world."
- "The system knows it's an afternoon café in Tokyo — and the agents act like it."
- "The people keep behaving after the video ends — and they interact with each other."
- "Each person has a role, goals, personality, and reactions."
- "If the world changes, the agents replan."

---

## 5. System architecture

### 5.1 High-level architecture

```
Browser Upload
    ↓
Backend Ingestion (Node.js / TypeScript)
    ↓
Video Upload to Gemini Files API
    ↓
Google ADK Pipeline (progress streamed via SSE)
    ├─ ParallelAgent
    │    ├─ VideoAnalysisAgent    (Gemini 3.1 Pro Preview — scene analysis + 2D detection)
    │    └─ StyleExtractionAgent  (Gemini 3.1 Flash-Lite Preview — palette + visual cues)
    ├─ StructuringAgent           (Gemini 3.1 Flash-Lite Preview — JSON schema enforcement)
    └─ MindInitAgent              (Gemini 3.1 Flash-Lite Preview — agent archetype inference)
    ↓
Compiled Scene Package (JSON)
    ↓
Three.js r183 Frontend Runtime
    ├─ WebGPURenderer + InstancedMesh crowd rendering
    ├─ Agent simulation engine (utility-based, fixed tick, Timer-based)
    ├─ Sparse Gemini 3.1 Flash-Lite Preview cognitive updates
    └─ UI / inspection / intervention layer (shadcn/ui + Tailwind)
```

### 5.2 Main layers

**A. Perception / compile layer** — turns raw video into a machine-readable scene state using Gemini's native video understanding.

**B. ADK orchestration layer** — coordinates the multi-step compile pipeline using Google Agent Development Kit (TypeScript SDK).

**C. Runtime simulation layer** — runs live deterministic simulation locally in the browser on top of compiled world state.

**D. Cognitive layer** — sparse, event-driven Gemini calls that give agents contextual meaning and replanning ability.

**E. Presentation layer** — Three.js r183 with `WebGPURenderer`, `InstancedMesh`, and `@react-three/fiber` v9.

### 5.3 State authority model

**The browser owns all live world state. The server is stateless at runtime.**

The simulation runs entirely in the browser. The server has no authoritative view of agent positions, blocked edges, occupied targets, or interaction history. It only stores the original `CompiledScenePackage` and serves it on request.

This means every runtime API call that needs world context (`/api/agent-refresh`, `/api/intervention`) must include a sufficient runtime snapshot from the browser. The server cannot infer current state from `sceneId` alone — it would be stale the moment the first tick runs.

**Why not server-authoritative:** Server-authoritative simulation would require syncing every tick (100–200ms) over the wire, adding latency to movement and making the sim dependent on network quality. The "local simulation, sparse cognition" principle (§3) explicitly avoids this. The tradeoff is larger request payloads on cognitive refresh calls (~2–5KB of runtime context per call), which is negligible compared to the LLM inference cost.

---

## 6. Technical stack

### 6.1 Frontend
- **Vite** + **React 19** — no SSR needed; Vite gives fastest HMR and simplest config for a canvas-heavy app
- **Three.js r183** with `WebGPURenderer` (WebGL 2 fallback automatic; Safari supports WebGPU since Sept 2025)
- **`@react-three/fiber` v9.5** — React integration for Three.js
- **`@react-three/drei` v10.7** — helpers: `<Instances>`, `OrbitControls`, `Html`, `useGLTF`
- **`@react-three/rapier`** — optional lightweight physics (collision, stack)
- **Zustand** for world/sim state — single store model fits the simulation's centralized world state; Jotai's atomic model adds unnecessary indirection here
- **shadcn/ui** + **Tailwind CSS** — UI overlay components (upload card, progress bar, agent inspector panel, intervention toolbar, tooltips, debug overlay)
- **Vitest** for unit and integration tests

### 6.2 Backend
- **Node.js / TypeScript** API server
- **`@google/genai`** (unified Google Gen AI SDK) — **do not use the old `@google/generative-ai` or `vertexai` package**
- **`@google/adk` v0.4.0** — Agent Development Kit for multi-step compile pipeline (`ParallelAgent`, `SequentialAgent`, streaming via `runAsync()`)
- No separate Python worker needed; Gemini handles all video/vision analysis natively

> **ADK TypeScript maturity caveat:** The TS SDK is pre-GA (v0.4.0 as of March 2026). `ParallelAgent` is documented but sub-agents do not automatically share state — results must be manually merged after parallel execution. `ReflectAndRetryToolPlugin` is documented for Python; TS availability is unverified. **Implementation fallback:** If ADK's `ParallelAgent` doesn't behave as expected, replace it with `Promise.all([videoAnalysisAgent.run(), styleExtractionAgent.run()])` inside a plain `SequentialAgent`. If `ReflectAndRetryToolPlugin` is unavailable in TS, implement retry with try/catch + Zod validation + re-prompt with error context. The pipeline architecture does not depend on any ADK feature that can't be replicated with ~20 lines of manual orchestration.

### 6.3 AI / analysis services

| Service | Role | Model / API |
|---------|------|-------------|
| Gemini Files API | Upload video for analysis | `https://generativelanguage.googleapis.com/upload/v1beta/files` |
| Gemini 3.1 Pro Preview | Deep scene reasoning, layout inference | `gemini-3.1-pro-preview` |
| Gemini 3.1 Flash-Lite Preview | Scene structuring, agent minds, runtime | `gemini-3.1-flash-lite-preview` |
| Video Intelligence API | Optional: precise 2D pose landmarks | `v1/videos:annotate` with `PERSON_DETECTION` |
| MediaPipe Pose Landmarker | Optional: single-person joint extraction | `@mediapipe/tasks-vision` |

**Paid Google AI account** is used for development — no free-tier constraints apply. Rate limits are not a concern for this project.

> **Note on Video Intelligence API:** Gemini's native video understanding now covers scene type, objects, bounding boxes, and person descriptions with sufficient fidelity for this use case. The Video Intelligence API is still active (not deprecated) and adds value if precise 2D pose landmarks per-frame are needed. For MVP, **Gemini alone is sufficient**.

### 6.4 Rendering / asset layer
- Three.js r183 for all browser rendering
- `WebGPURenderer` as primary (auto-fallback to `WebGLRenderer`)
- `InstancedMesh` / `BatchedMesh` for crowd agents
- GLB / glTF assets for furniture and characters
- Mixamo or Kenney character animation clips

---

## 7. Core system model

**The scene is compiled once from video. Behavior is simulated live.**

The uploaded video does not become a playback clip. It becomes an internal world representation. This is the fundamental architectural principle.

---

## 8. Scene representation

### 8.0 Shared primitive types

All spatial types used across the scene package:

```ts
/** 3D vector used for positions, velocities, and scales. Y-up coordinate system. */
type Vec3 = { x: number; y: number; z: number };

/** 2D polygon on the XZ ground plane. Points are ordered clockwise. */
type Polygon2D = { points: { x: number; z: number }[] };

/** Entry/exit point connecting the scene to the outside world. */
interface Portal {
  id: string;
  position: Vec3;
  facingAngle: number;         // radians, direction agents face when entering
  width: number;               // meters
  type: 'door' | 'opening' | 'corridor_end' | 'unknown';
}

/** An action the agent is likely to take next, with probability. */
interface LikelyAction {
  label: string;               // human-readable, e.g. "turn toward side corridor"
  probability: number;         // 0..1, all actions for an agent should sum to ~1
}

/** Waypoint-based navigation graph for A* pathfinding. */
interface NavigationGraph {
  nodes: NavNode[];
  edges: NavEdge[];
}

interface NavNode {
  id: string;
  position: { x: number; z: number };  // XZ ground plane
  zoneId?: string;                       // which SemanticZone this node belongs to
  isPortal?: boolean;                    // true if this node sits at an entrance/exit
}

interface NavEdge {
  from: string;                // NavNode id
  to: string;                 // NavNode id
  weight: number;             // traversal cost (base = Euclidean distance; multiplied by congestion factor at runtime)
  blocked: boolean;           // set to true by interventions; A* skips blocked edges
}

/** Locomotion state — tracks movement mechanics separately from runtime decision state. */
interface AgentLocomotionState {
  speed: number;               // current m/s (0 when stationary)
  maxSpeed: number;            // personality-dependent max (e.g. 1.2–1.8 m/s walk)
  acceleration: number;        // m/s², used for smooth start/stop
  isMoving: boolean;
  isBlocked: boolean;
  stuckTickCount: number;      // increments each tick agent can't move; triggers replan at threshold
}

/** Maps abstract scene objects to concrete Three.js asset files. */
interface AssetBindings {
  roomShell: string;           // GLB path for room walls/floor/ceiling
  furniture: {
    objectId: string;          // matches SceneObject.id
    assetPath: string;         // GLB path
    variant?: string;          // e.g. "wood_dark", "metal_chrome"
  }[];
  characters: {
    agentId: string;           // matches AgentModel.id
    assetPath: string;         // GLB path for character rig
    animationClips: {
      idle: string;
      walk: string;
      sit: string;
      talk?: string;
      fidget?: string;
    };
  }[];
}

/** Global simulation parameters. */
interface SimulationConfig {
  tickIntervalMs: number;          // 100–200ms
  maxAgents: number;               // hard cap for InstancedMesh allocation
  pathfindingAlgorithm: 'astar';   // only A* for MVP
  collisionAvoidanceRadius: number; // meters; agents steer to avoid within this radius
  cognitiveUpdateWindowSec: number; // min seconds between batched LLM refresh calls (e.g. 2–5)
  maxCognitiveUpdatesPerWindow: number; // e.g. 3 agents per window
  microBehaviorChancePerTick: number;   // probability of idle fidget/glance per tick (e.g. 0.05)
  goalTtlDefaultSec: number;       // default TTL before goal decays (e.g. 30)
  stuckTickThreshold: number;      // ticks of being blocked before triggering replan (e.g. 5)
}
```

### 8.1 Compiled scene package

The backend emits a single compiled artifact consumed by the browser runtime:

```ts
interface CompiledScenePackage {
  sceneId: string;
  sourceVideo: {
    durationSec: number;
    width: number;
    height: number;
    fpsSampled: number;
  };
  sceneContext: SceneContextModel;
  environment: EnvironmentModel;
  agents: AgentModel[];
  simulationConfig: SimulationConfig;
  style: StyleProfile;
  assets: AssetBindings;
  compileMetadata: {
    sceneConfidence: number;
    geminiModel: string;
    uncertainty: string[];
  };
}
```

### 8.2 Scene context model

The system extracts global spatiotemporal context from the video to ground agent personas, schedules, and behavioral plausibility.

```ts
interface SceneContextModel {
  estimatedLocation: {
    type: 'indoor' | 'outdoor' | 'semi_outdoor';
    regionHint?: string;           // e.g. "East Asia", "Western Europe", "North America"
    venueTypeHint?: string;        // e.g. "university campus café", "airport terminal"
    culturalCues?: string[];       // e.g. ["Japanese signage", "metric units on menu"]
  };
  estimatedTime: {
    timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
    dayTypeHint?: 'weekday' | 'weekend' | 'unknown';
    seasonHint?: 'spring' | 'summer' | 'autumn' | 'winter' | 'unknown';
    lightingEvidence?: string;     // e.g. "warm afternoon sunlight from west-facing windows"
  };
  globalSummary: string;           // 1–2 sentence high-level description of what's happening
  crowdDensity: 'sparse' | 'moderate' | 'dense';
  dominantActivity: string;        // e.g. "casual dining", "waiting in queue", "collaborative work"
}
```

This context feeds into agent mind initialization (archetype selection, goal plausibility), schedule inference (are people arriving, leaving, on lunch break?), and synthetic persona generation (culturally and temporally appropriate behaviors).

### 8.3 Environment model

```ts
interface EnvironmentModel {
  spaceType:
    | 'cafe' | 'office' | 'meeting_room' | 'corridor'
    | 'classroom' | 'lobby' | 'unknown';
  bounds: { width: number; depth: number; height: number };
  floorPlan: Polygon2D;
  walkableZones: Polygon2D[];
  blockedZones: Polygon2D[];
  entrances: Portal[];
  exits: Portal[];
  objects: SceneObject[];
  semanticZones: SemanticZone[];
  navigationGraph: NavigationGraph;
}
```

### 8.4 Scene objects

```ts
interface SceneObject {
  id: string;
  type:
    | 'table' | 'chair' | 'desk' | 'counter' | 'sofa'
    | 'door' | 'wall' | 'laptop' | 'coffee_machine'
    | 'screen' | 'plant' | 'unknown';
  position: Vec3;
  rotationY: number;
  scale: Vec3;
  interactable: boolean;
  blocksMovement: boolean;
  occupiedByAgentId: string | null;    // runtime: agent currently using this object (e.g. sitting in chair)
  styleHints?: {
    primaryColor?: string;   // hex
    secondaryColor?: string;
  };
  // Spatial estimate from compile pipeline (see §8.6)
  spatialEstimate?: SpatialEstimate;
}
```

### 8.5 Semantic zones

```ts
interface SemanticZone {
  id: string;
  type:
    | 'seating' | 'standing' | 'service' | 'circulation'
    | 'entry' | 'exit' | 'waiting' | 'unknown';
  polygon: Polygon2D;
  attractivenessWeight: number;
  capacity?: number;                   // max agents this zone can hold (e.g. 4 seats in a seating zone)
  occupantIds: string[];               // runtime: agent IDs currently in this zone (updated each tick)
  queueIds: string[];                  // runtime: agent IDs waiting for this zone, in order
}
```

---

### 8.6 2D → 3D spatial projection strategy

The hardest subproblem in the compile pipeline: turning Gemini's 2D video observations into 3D world positions.

> **Honesty note:** Gemini's official video docs describe description, segmentation, timestamps, and FPS sampling — they do not explicitly document native 3D bounding boxes or calibrated room coordinates from monocular video. The approach below is designed to work reliably with what Gemini definitely can do (2D bounding boxes, scene descriptions, room type inference), with an experimental path for prompted 3D estimates.

### Primary approach: 2D heuristic projection (reliable)

The default pipeline uses Gemini's 2D bounding boxes (normalized 0–1000 grid, documented and reliable) plus scene-level metadata to project into 3D:

1. **Gemini outputs 2D bounding boxes and room metadata.** The `VideoAnalysisAgent` returns per-object 2D bounding boxes and a coarse room layout (type, estimated dimensions, which walls are visible). This is within Gemini's documented capabilities.

2. **Heuristic 2D → 3D projection.** The `StructuringAgent` maps 2D detections to 3D positions:
   - `z` (depth) from vertical position in frame: `z = bounds.depth * (1 - yCenter / frameHeight)` — objects lower in frame are closer to camera.
   - `x` (lateral) from horizontal center: `x = bounds.width * (xCenter / frameWidth)`.
   - `y` is 0 for floor-level objects; inferred from object type for elevated objects (e.g. screens at 1.5m, shelves at 0.8m).
   - Object scale is estimated from bounding box area relative to frame size, cross-referenced with known real-world dimensions per object type (e.g. a table is ~0.75m tall, a chair is ~0.45m wide).

3. **Depth ordering from occlusion.** Objects that occlude others are placed nearer. Gemini can reliably describe "table in front of counter" — this relative ordering constrains the z-axis even without precise depth values.

4. **Consistency pass.** The `StructuringAgent` runs a plausibility check: no two solid objects overlap, all objects fit within `bounds`, agents stand on walkable zones, furniture aligns with semantic zones. Violations are resolved by nudging positions along the least-constrained axis.

### Experimental: Gemini prompted 3D estimates (opt-in)

As an enhancement, the `VideoAnalysisAgent` prompt can request direct 3D coordinates: "Assume a standard ceiling height of ~3m. Use the floor plane as y=0. Estimate object positions in meters relative to the room's near-left corner as origin." Early testing suggests Gemini can produce plausible estimates this way, but the quality is unverified at scale and not documented as a supported capability.

When this mode is enabled, the `SpatialEstimate.confidence3d` field indicates Gemini's self-assessed reliability. The `StructuringAgent` uses `position3d` only when `confidence3d >= 0.5`; otherwise it falls back to the 2D heuristic above.

### Schema

```ts
interface SpatialEstimate {
  position3d: Vec3;                    // 3D position (meters) — from Gemini prompt or 2D heuristic
  confidence3d: number;                // 0..1 — high if from Gemini 3D prompt with self-assessed confidence, low if from heuristic
  projectionSource: 'gemini_3d' | 'heuristic_2d';  // which method produced this estimate
  videoBoundingBox: {                  // raw 2D detection (normalized 0–1000) — always present
    yMin: number; xMin: number;
    yMax: number; xMax: number;
  };
  depthHint?: 'near' | 'mid' | 'far'; // coarse relative depth from Gemini description
}
```

Objects and agents both carry a `SpatialEstimate`. The `StructuringAgent` uses `position3d` when `confidence3d >= 0.5` and `projectionSource === 'gemini_3d'`, otherwise regenerates `position3d` from the 2D heuristic. Either way, the consistency pass runs afterward.

---

## 9. Agent architecture

### 9.1 Philosophy
Agents should feel **alive and unpredictable** — not like mannequins following a script.

**Best approach: emergent behavior from simple rules + stochastic variation + sparse LLM mind updates.**

Key principles for avoiding robotic behavior:
- **Weighted randomness in action selection** — the utility system doesn't always pick the top-scoring action. Use weighted random sampling from the top 2–3 actions so agents occasionally make surprising but plausible choices.
- **Personality-driven variation** — trait weights (curiosity, patience, conformity) meaningfully alter behavior. A curious agent explores; a conformist follows the crowd.
- **Micro-behaviors** — agents don't just walk and stop. They pause to look around, shift weight, glance at nearby objects or people, adjust pace. These are lightweight animation variations triggered by small random timers.
- **Goal drift** — goals have TTLs and can decay. An agent waiting too long may get bored and wander. A patient agent sticks to plan longer. This emerges from trait weights, not hard-coded scripts.
- **Environmental responsiveness** — agents notice and react to nearby events (someone passing quickly, a sudden noise from intervention, crowding) even without an LLM update, through local arousal/attention mechanics.

```ts
interface AgentModel {
  id: string;
  visual: AgentVisualProfile;
  social: AgentSocialProfile;
  mind: AgentMindState;
  locomotion: AgentLocomotionState;
  runtime: AgentRuntimeState;
}
```

### 9.2 Agent visual profile

```ts
interface AgentVisualProfile {
  assetId: string;
  gender: 'male' | 'female' | 'ambiguous';
  ageGroup: 'child' | 'young_adult' | 'adult' | 'middle_aged' | 'elderly';
  bodyType: 'small' | 'medium' | 'large';
  heightBucket: 'short' | 'average' | 'tall';
  clothingColors: {
    top?: string;    // hex from video
    bottom?: string;
    accent?: string;
  };
  clothingStyle?: 'casual' | 'business' | 'uniform' | 'athletic' | 'formal';
  props?: string[];
  initialPose: 'standing' | 'sitting' | 'walking';
  spatialEstimate: SpatialEstimate;  // compile-time position from video (see §8.6)
}
```

### 9.3 Agent social profile

```ts
interface AgentSocialProfile {
  groupId?: string;
  companionIds: string[];
  likelyRelationships?: ('friend' | 'coworker' | 'staff-customer' | 'stranger' | 'unknown')[];
  followTendency: number;       // 0..1
  sociability: number;          // 0..1 — likelihood of initiating interaction with others
  interactionCooldownSec: number; // min seconds between spontaneous interactions
}
```

### 9.4 Agent mind state

```ts
interface AgentMindState {
  archetype:
    | 'waiting_guest' | 'staff' | 'seated_worker'
    | 'late_arrival' | 'person_leaving'
    | 'social_group_member' | 'uncertain_visitor' | 'unknown';
  primaryGoal: AgentGoal;
  secondaryGoal?: AgentGoal;
  currentIntent: string;        // human-readable, shown in UI
  arousal: number;              // 0..1
  patience: number;             // 0..1
  curiosity: number;            // 0..1
  conformity: number;           // 0..1
  reactionStyle:
    | 'calm' | 'hesitant' | 'follow_others'
    | 'goal_directed' | 'anxious';
  likelyNextActions: LikelyAction[];
  confidence: number;           // 0..1
}
```

### 9.5 Agent goals

```ts
type AgentGoalType =
  | 'stay_put' | 'find_seat' | 'follow_companion'
  | 'approach_counter' | 'move_to_exit'
  | 'wait_for_someone' | 'wander'
  | 'reposition' | 'avoid_crowd';

interface AgentGoal {
  type: AgentGoalType;
  targetZoneId?: string;
  targetObjectId?: string;
  targetAgentId?: string;
  urgency: number;  // 0..1
  ttlSec?: number;
}
```

### 9.6 Agent interactions

Agents can spontaneously interact with nearby agents, adding emergent social dynamics to the simulation. Interactions are not pre-scripted — they arise from proximity, sociability traits, and situational context.

```ts
interface AgentInteraction {
  type:
    | 'greeting'          // brief acknowledgment when passing
    | 'conversation'      // stop and talk for a few seconds
    | 'ask_directions'    // uncertain_visitor approaches staff
    | 'join_group'        // lone agent merges with nearby group
    | 'yield_space'       // polite spatial negotiation
    | 'service_exchange'  // staff-customer transaction
    | 'shared_reaction';  // multiple agents react to same event
  initiatorId: string;
  targetId: string;
  durationSec: number;          // how long the interaction lasts
  animationHint: 'face_each_other' | 'side_by_side' | 'brief_pause' | 'gesture';
  triggerCondition: string;      // human-readable, e.g. "both waiting near counter"
}
```

**Interaction triggers:**
- Two non-companion agents are within 1.5m for >2 seconds and both have sociability > 0.4
- An `uncertain_visitor` archetype is near a `staff` archetype
- Multiple agents witness the same event (intervention, path blocked) simultaneously
- A lone agent lingers near a social group with high `attractivenessWeight`

**Interaction resolution:**
- Interactions pause both agents' current movement for the interaction duration
- After interaction, agents may gain updated goals (e.g., a visitor who asked directions now has a `move_to_exit` goal)
- Interactions can trigger sparse LLM cognitive updates for richer narrative content
- Frequency is governed by `sociability` and `interactionCooldownSec` to prevent constant chattering

### 9.7 Agent runtime state

```ts
interface AgentRuntimeState {
  position: Vec3;
  velocity: Vec3;
  heading: number;
  currentPath: Vec3[];
  animationState: 'idle' | 'walk' | 'sit' | 'turn' | 'wait' | 'react' | 'talk' | 'glance' | 'fidget';
  blocked: boolean;
  lastDecisionAt: number;     // sim time ms
  nextMindRefreshAt: number;  // sim time ms

  // Goal lifecycle (needed for boredom/TTL, cognitive refresh context)
  goalStartedAt: number;      // sim time ms — when the current goal was set
  goalChangedCount: number;   // total goal changes since sim start

  // Interaction tracking (needed for cooldowns, interaction utility scoring)
  lastInteractionAt: number | null;    // sim time ms — null if never interacted
  lastInteractionPartnerId: string | null;
  activeInteractionId: string | null;  // null if not in an interaction

  // Occupancy / queuing (needed for seat-finding, "target becomes occupied", queue behavior)
  occupyingObjectId: string | null;    // SceneObject.id this agent is sitting at / using
  occupyingZoneId: string | null;      // SemanticZone.id this agent is occupying
  queuePosition: number | null;        // position in service zone queue (0 = being served), null if not queued
  queueTargetZoneId: string | null;    // which service zone the agent is queued for

  // Event log (needed for runtime snapshot sent to cognitive refresh)
  recentEvents: { tick: number; type: string; detail?: string }[];  // ring buffer, last ~20 events
}
```

---

## 10. Simulation engine

### 10.1 Runtime loop
The simulation runs entirely in the browser at a fixed timestep of 100–200ms.

**Per tick, for each agent:**
1. Observe local environment
2. Update utility scores for competing actions
3. Choose or maintain current goal
4. Plan / replan path if needed
5. Apply local movement rules
6. Resolve collisions and congestion
7. Update animation state
8. Trigger sparse cognitive update if warranted

### 10.2 Utility-based behavior with stochastic selection
Each agent continuously scores competing actions: stay, move, wait, follow companion, approach target, avoid congestion, reroute, interact with nearby agent, look around, fidget.

**Selection is stochastic, not deterministic.** The top 2–3 actions are sampled with probability proportional to their utility scores (softmax with temperature derived from the agent's `arousal` trait — higher arousal = more decisive, lower arousal = more exploratory). This means agents occasionally make suboptimal but human-like choices: lingering a moment longer, taking an indirect route, pausing to observe something.

Additionally, agents have a small chance per tick of injecting **idle micro-behaviors** (glance left/right, shift weight, check phone, adjust bag) that don't affect pathfinding but make them visually alive. These are weighted by personality — a `calm` agent fidgets less; an `anxious` agent fidgets more.

#### Utility function definitions

Each action has a scoring function that returns a value in `[0, 1]`. All scores are computed per tick per agent.

```ts
/** Snapshot of the world state available to utility functions each tick. */
interface WorldState {
  environment: EnvironmentModel;
  agents: Map<string, AgentModel>;
  activeInteractions: ActiveInteraction[];
  simClock: number;                    // ms since sim start
  navGraph: NavigationGraph;           // live graph with blocked edges
  zoneOccupancy: Map<string, string[]>;    // zoneId → list of agent IDs currently inside
  objectOccupancy: Map<string, string | null>;  // objectId → agent using it, or null
}

type UtilityFn = (agent: AgentModel, world: WorldState) => number;

const utilityFunctions: Record<string, UtilityFn> = {
  stay_put:         (a, w) => a.mind.patience * goalMatch(a, 'stay_put') * (1 - boredomFactor(a)),
  move_to_target:   (a, w) => a.mind.primaryGoal.urgency * goalMatch(a, 'find_seat', 'approach_counter', 'move_to_exit') * pathAvailability(a, w),
  follow_companion: (a, w) => a.social.followTendency * companionDistance(a, w) * goalMatch(a, 'follow_companion'),
  avoid_crowd:      (a, w) => localDensity(a, w) * (1 - a.mind.conformity),
  wander:           (a, w) => boredomFactor(a) * a.mind.curiosity * (1 - localDensity(a, w)),
  interact:         (a, w) => nearbyInteractableScore(a, w) * a.social.sociability * interactionCooldownOk(a),
  wait:             (a, w) => goalMatch(a, 'wait_for_someone') * a.mind.patience,
  reroute:          (a, w) => a.runtime.blocked ? 0.9 : 0,
};
```

**Helper functions:**
- `goalMatch(a, ...types)` → 1.0 if agent's current goal matches any listed type, 0.1 otherwise (small base so agents can still switch)
- `boredomFactor(a)` → increases linearly from 0 to 1 as time since last goal change approaches `goalTtlDefaultSec`; scales inversely with `patience`
- `pathAvailability(a, w)` → 1.0 if A* finds a path, 0.2 if blocked (still scores nonzero so agent tries reroute)
- `companionDistance(a, w)` → 0 if no companion; ramps from 0→1 as companion distance exceeds 3m
- `localDensity(a, w)` → number of agents within `collisionAvoidanceRadius * 2`, normalized to `[0, 1]`
- `nearbyInteractableScore(a, w)` → max sociability of agents within 1.5m who are also off cooldown
- `interactionCooldownOk(a)` → 1.0 if enough time has passed since last interaction, 0.0 otherwise

**Softmax selection:**
```ts
const temperature = 0.3 + (1 - agent.mind.arousal) * 0.7; // high arousal → low temp → more decisive
const topN = scores.sort(desc).slice(0, 3);
const probs = softmax(topN.map(s => s.value / temperature));
const chosen = weightedRandomSample(topN, probs);
```

### 10.3 Local movement stack

**Navigation graph:** A waypoint graph (not a grid, not a navmesh). Nodes are placed at semantic zone centers, portals, and intermediate points by the `StructuringAgent`. Edges connect walkable node pairs with Euclidean distance as base weight. See `NavigationGraph`, `NavNode`, `NavEdge` in §8.0.

**Pathfinding:** A* on the waypoint graph. Edge weights are `baseDistance * congestionMultiplier`, where congestion is computed from the number of agents near the edge midpoint. Blocked edges (from interventions) are skipped entirely. Paths are cached per agent and only recomputed on replan events.

**Collision avoidance:** Simple steering-based avoidance. Each tick, agents check for other agents within `collisionAvoidanceRadius` (default 0.5m). If a neighbor is ahead and within the cone of movement (±45°), the agent applies a lateral steering force proportional to proximity. This is cheaper than ORCA and sufficient for 5–25 agents.

**Movement stack per tick:**
1. A* pathfinding on `NavigationGraph` (cached, recomputed on replan)
2. Steering toward next waypoint on path
3. Collision avoidance lateral force
4. Speed modulation: slow down in dense zones, speed up in open zones
5. Group following: companions match leader's speed and maintain 0.5–1.5m offset
6. Queue behavior: agents approaching the same `service` zone form a line based on arrival order

### 10.4 Event-driven replanning
Agents replan when:
- path becomes blocked
- target becomes occupied
- group splits
- global event is triggered (intervention)
- local density exceeds threshold
- sparse LLM cognitive update changes the goal
- an interaction completes (may yield new goal from conversation outcome)
- agent has been idle too long and goal TTL expires (boredom drift)

### 10.5 Interaction / tick integration

Agent interactions (§9.6) are state machines that run within the tick loop:

```ts
type InteractionPhase = 'approaching' | 'active' | 'cooldown';

interface ActiveInteraction {
  id: string;
  type: AgentInteraction['type'];
  initiatorId: string;
  targetId: string;
  phase: InteractionPhase;
  startTick: number;
  durationTicks: number;      // derived from durationSec / tickIntervalMs
  ticksRemaining: number;
}
```

**Per tick, for agents in an active interaction:**
1. **Approaching phase** (2–4 ticks): agents turn to face each other; movement continues toward interaction point. Utility scoring is paused.
2. **Active phase** (duration from `AgentInteraction.durationSec`): both agents play `talk` or `gesture` animation. No movement. Utility scoring is paused. If an intervention occurs, the interaction is interrupted — both agents immediately enter cooldown and trigger a replan.
3. **Cooldown phase** (1–2 ticks): agents resume utility scoring. Goals may be updated (e.g., `uncertain_visitor` who interacted with `staff` gets a new `move_to_exit` goal). `interactionCooldownSec` timer starts.

Interactions are singleton per agent — an agent in an active interaction cannot start or join another.

### 10.6 Cognitive refresh trigger logic

The frontend sim engine decides when to call `POST /api/agent-refresh`. Triggers are checked once per `cognitiveUpdateWindowSec` (e.g. every 3 seconds), not every tick.

```ts
interface RefreshTrigger {
  condition: (agent: AgentModel, world: WorldState) => boolean;
  priority: number;  // higher = more likely to be selected if we hit the per-window cap
}

const refreshTriggers: RefreshTrigger[] = [
  { condition: (a, w) => a.runtime.blocked && a.locomotion.stuckTickCount >= stuckTickThreshold, priority: 5 },
  { condition: (a, w) => a.runtime.animationState === 'react' /* intervention just happened */, priority: 5 },
  { condition: (a, w) => companionDistance(a, w) > 5 /* group split */, priority: 4 },
  { condition: (a, w) => goalTtlExpired(a), priority: 3 },
  { condition: (a, w) => localDensity(a, w) > 0.8, priority: 2 },
  { condition: (a, w) => userInspecting(a) /* user clicked this agent */, priority: 1 },
];
```

**Batching rules:**
- At most `maxCognitiveUpdatesPerWindow` agents (e.g. 3) are refreshed per window.
- If more agents trigger, select the top N by priority. Ties broken by longest time since last refresh.
- Debounce: an agent cannot be refreshed more than once per `cognitiveUpdateWindowSec * 2`.
- On intervention: all agents within the affected zone are candidates regardless of cooldown.

### 10.7 WebGPU crowd rendering
Three.js r183's `WebGPURenderer` (production-ready since r171) enables GPU-side agent simulation via compute shaders. For MVP, use `InstancedMesh` with CPU-side position updates. For stretch, migrate agent movement to a compute shader (see `webgpu_compute_birds` example in Three.js).

```ts
// MVP: CPU-side instanced agents
const agentMesh = new THREE.InstancedMesh(agentGeometry, agentMaterial, MAX_AGENTS);
// Per tick: update matrix for each agent
dummy.position.set(agent.position.x, 0, agent.position.z);
dummy.rotation.y = agent.heading;
dummy.updateMatrix();
agentMesh.setMatrixAt(i, dummy.matrix);
agentMesh.instanceMatrix.needsUpdate = true;
```

---

## 11. Cognitive layer (LLM minds)

### 11.1 Principle
LLM is used for **meaning**, not for every motion frame.

| Responsibility | LLM | Local engine |
|---------------|-----|--------------|
| Infer archetypes | ✅ | |
| Infer intentions | ✅ | |
| Social relationships | ✅ | |
| Reaction to events | ✅ | |
| "Why" explanations | ✅ | |
| Movement / pathfinding | | ✅ |
| Collision avoidance | | ✅ |
| Animation switching | | ✅ |
| Queues / spacing | | ✅ |

### 11.2 LLM call types

**A. Scene compile pass** — one large structured extraction via ADK pipeline (Gemini 3.1 Pro Preview).

**B. Mind initialization pass** — archetype, goals, traits, social links per agent (Gemini 3.1 Flash-Lite Preview).

**C. Sparse runtime cognitive updates** — triggered when:
- event occurs (path blocked, intervention, group split)
- ambiguity occurs
- agent gets stuck repeatedly
- user explicitly inspects an agent

### 11.3 Frequency guidance
- Compile pass: once per uploaded video
- Mind init: once per compile
- Runtime updates: at most 0–3 agents per 2–5 second window
- Runtime updates: Gemini 3.1 Flash-Lite Preview for all sparse cognitive updates (paid account, no quota concerns)

### 11.4 Cognitive update payload

The LLM prompt for a cognitive update is constructed server-side from the `runtimeSnapshot` included in the `/api/agent-refresh` request (see §18.1). The server extracts the relevant agent's state and nearby context, then formats it as a prompt:

```json
{
  "agent_id": "a12",
  "position": { "x": 3.1, "y": 0, "z": 5.8 },
  "situation_summary": "Main route to exit blocked. Companion moved toward side corridor. Density increasing.",
  "current_goal": "move_to_exit",
  "goal_age_sec": 5.8,
  "blocked": true,
  "stuck_ticks": 7,
  "nearby_agents": [
    { "id": "a03", "distance": 1.2, "goal": "follow_companion", "relationship": "companion" }
  ],
  "recent_events": ["path_blocked", "group_split"],
  "blocked_edges": ["e_corr_1_to_exit_1"],
  "allowed_goal_types": [
    "move_to_exit", "follow_companion",
    "wait_for_someone", "avoid_crowd", "reposition"
  ]
}
```

### 11.5 Cognitive update response

```json
{
  "updated_goal": {
    "type": "follow_companion",
    "targetAgentId": "a07",
    "urgency": 0.72,
    "ttlSec": 8
  },
  "currentIntent": "stay with companion and avoid congested exit",
  "reactionStyle": "follow_others",
  "likelyNextActions": [
    { "label": "turn toward side corridor", "probability": 0.58 },
    { "label": "pause and scan route", "probability": 0.26 },
    { "label": "continue toward blocked exit briefly", "probability": 0.16 }
  ],
  "confidence": 0.74
}
```

---

## 12. Scene compile pipeline (ADK-orchestrated)

The compile pipeline is implemented using **Google ADK (`@google/adk` v0.4.0)**, which orchestrates Gemini-backed agents. The pipeline uses both `ParallelAgent` and `SequentialAgent` to maximize throughput: steps that only depend on the uploaded video run concurrently, while steps that depend on prior outputs run sequentially.

```ts
import { SequentialAgent, ParallelAgent, LlmAgent } from '@google/adk';

// Step 2 + 3 run in parallel — both only need the uploaded video file
const perceptionParallel = new ParallelAgent({
  name: 'perception_parallel',
  subAgents: [
    videoAnalysisAgent,    // Gemini 3.1 Pro Preview — deep scene analysis + 2D detection
    styleExtractionAgent,  // Gemini 3.1 Flash-Lite Preview — extract palette + visual profile
  ]
});

// Full pipeline: parallel perception → sequential synthesis
const compilePipeline = new SequentialAgent({
  name: 'video_compile_pipeline',
  subAgents: [
    perceptionParallel,    // VideoAnalysis + StyleExtraction run concurrently
    structuringAgent,      // Gemini 3.1 Flash-Lite Preview — enforce CompiledScenePackage schema (needs analysis output)
    mindInitAgent,         // Gemini 3.1 Flash-Lite Preview — initialize agent minds (needs structured scene)
  ]
});
```

ADK's `runAsync()` returns an async iterable of events, enabling real-time progress streaming to the frontend (see §18.1, `GET /api/compile-progress/:jobId`).

### Step 1 — Upload and preprocessing
- Accept MP4/MOV/WebM, validate duration (≤20s) and size (≤100MB — Gemini now supports up to 100MB inline)
- Upload to Gemini Files API; wait for `state: ACTIVE`
- Store `file.uri` and `file.mimeType` for subsequent LLM calls

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let uploadedFile = await ai.files.upload({
  file: videoBlob,
  config: { mimeType: "video/mp4", displayName: "scene_video" }
});
// Poll until state === "ACTIVE"
while (uploadedFile.state === "PROCESSING") {
  await sleep(2000);
  uploadedFile = await ai.files.get({ name: uploadedFile.name });
}
```

### Step 2a — Perception extraction (VideoAnalysisAgent) — runs in parallel with Step 2b
Uses **Gemini 3.1 Pro Preview** with `responseMimeType: "application/json"` and a `responseJsonSchema`. Provides the uploaded file URI as a `fileData` part — no re-upload needed.

**Extracts:**
- Space type, rough layout and dimensions
- All visible objects with **2D bounding boxes** (normalized 0–1000) — reliable, documented capability. Optionally prompts for 3D estimates (experimental, see §8.6).
- `SpatialEstimate` per object and per person (see §8.6) — populated via 2D heuristic by default, Gemini 3D if opted in
- Walkable zones and blocked areas
- Entrances and exits
- **Estimated location context** (region, venue type, cultural cues from signage/decor/language)
- **Estimated time context** (time of day from lighting, season hints, weekday/weekend cues)
- **Global scene summary** — what's happening, crowd density, dominant activity
- Person count and positions (3D)
- **Per-person demographics** — estimated gender, age group, clothing style
- Rough person tracks (start/end position, direction of movement)
- Pose class per person (standing / sitting / moving)
- Groups and social clusters
- Visible interpersonal dynamics (who is talking to whom, who is serving whom)

```ts
const response = await ai.models.generateContent({
  model: "gemini-3.1-pro-preview",
  contents: [
    {
      role: "user",
      parts: [
        { fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } },
        { text: SCENE_ANALYSIS_PROMPT }
      ]
    }
  ],
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: sceneAnalysisSchema,  // Zod-derived JSON Schema
  }
});
```

### Step 2b — Style extraction (StyleExtractionAgent) — runs in parallel with Step 2a
Uses **Gemini 3.1 Flash-Lite Preview** on the same file URI. Extracts:
- Wall primary/secondary colors (hex)
- Floor color
- Room brightness / warmth mood
- Per-person clothing colors
- Dominant palette (top 5 hex values)

### Step 3 — Scene graph synthesis (StructuringAgent)
Normalizes extracted data into a canonical `EnvironmentModel` with:
- World bounds
- Mapped objects
- Semantic zones
- Navigation graph nodes and edges
- Initial agent placement coordinates

### Step 4 — Mind initialization (MindInitAgent)
For each detected person, infers via Gemini 3.1 Flash-Lite Preview (using scene context for culturally and temporally grounded inference):
- Archetype (informed by demographics, location, and time of day)
- Demographic profile: gender, age group, clothing style
- Primary and secondary goals (plausible given the scene context — e.g., morning café → "get coffee before work")
- Trait weights (arousal, patience, curiosity, conformity)
- Sociability score and interaction tendencies
- Social links and companion groups
- Likely next actions with probability scores
- Potential interaction partners and triggers

### Step 5 — Asset binding
Map abstract scene objects to concrete Three.js assets:
- Select room shell pieces
- Select furniture GLB variants
- Select character asset + animation clip set
- Apply video-grounded style overrides

### Step 6 — Emit CompiledScenePackage
Serialize to JSON, return to browser runtime. Delete uploaded file from Files API after 48 hours (auto-expires) or immediately post-compile for privacy.

---

## 13. Structured output pattern

Use the **unified Google Gen AI SDK** (`@google/genai`) throughout. The old `@google/generative-ai` and `vertexai.generative_models` packages are deprecated and will be removed June 24, 2026.

```ts
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define schema with Zod for type safety
const AgentMindSchema = z.object({
  archetype: z.enum(['waiting_guest', 'staff', 'seated_worker', 'late_arrival',
    'person_leaving', 'social_group_member', 'uncertain_visitor', 'unknown']),
  primaryGoal: z.object({
    type: z.enum(['stay_put', 'find_seat', 'follow_companion',
      'approach_counter', 'move_to_exit', 'wait_for_someone',
      'wander', 'reposition', 'avoid_crowd']),
    urgency: z.number().min(0).max(1),
    ttlSec: z.number().optional(),
  }),
  currentIntent: z.string(),
  arousal: z.number().min(0).max(1),
  patience: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  conformity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-lite-preview",
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(AgentMindSchema),
  }
});

const mind = AgentMindSchema.parse(JSON.parse(response.text));
```

---

## 14. Style grounding

### 14.1 Goal
Use generic assets while making the scene feel visibly tied to the uploaded video.

### 14.2 Style profile schema

```ts
interface StyleProfile {
  environmentPalette: {
    wallPrimary?: string;
    wallSecondary?: string;
    floor?: string;
    accent?: string;
    lightingMood?: 'neutral' | 'warm' | 'cool' | 'dim' | 'bright';
  };
  dominantPalette: string[];   // top 5 hex values from video
  objectOverrides: {
    objectId: string;
    primaryColor?: string;
    secondaryColor?: string;
  }[];
  agentStyleOverrides: {
    agentId: string;
    topColor?: string;
    bottomColor?: string;
    accentColor?: string;
  }[];
}
```

### 14.3 What to preserve
- 1–2 dominant wall/floor colors
- Clothing colors of key visible agents
- Major visible objects (tables, coffee machine, laptop, counter)
- Approximate object placement from Gemini bounding boxes

### 14.4 What not to attempt
- Exact face or identity reconstruction
- Exact textures or photogrammetry
- More than ~10 distinct object types per scene

---

## 15. Browser rendering architecture (Three.js r183)

### 15.1 Renderer setup

```ts
import * as THREE from 'three';
import { WebGPURenderer } from 'three/examples/jsm/renderers/WebGPURenderer.js';

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // async with WebGPU
// Falls back to WebGL 2 automatically on unsupported browsers (including Safari since Sept 2025)
```

> **r183 note:** Use `Timer` instead of the deprecated `Clock` for all timing. `PostProcessing` is renamed to `RenderPipeline`. Use `CubeRenderTarget` instead of `WebGLCubeRenderTarget` when working with WebGPURenderer.

### 15.2 Core Three.js components
- `PerspectiveCamera`
- `WebGPURenderer` (r183, with WebGL 2 fallback)
- `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js`
- `GLTFLoader` for room, furniture, and character assets
- `AnimationMixer` for character clips
- `Timer` for simulation and render timing (replaces deprecated `Clock`)
- `InstancedMesh` for crowd agents (MVP)
- `BatchedMesh` for varied furniture geometries (preferred when mixing different furniture meshes with shared materials)
- `<Html>` from drei for agent name labels and interaction bubbles (chosen over `CSS2DRenderer` for React integration consistency)

### 15.3 Camera system

Camera initialization and constraints are derived from the compiled room bounds.

```ts
interface CameraConfig {
  // Derived from EnvironmentModel.bounds at scene build time
  initialPosition: Vec3;          // offset from room center: (width/2, height*1.2, depth*1.5)
  lookAt: Vec3;                   // room center: (width/2, 0, depth/2)
  fov: 50;                        // degrees

  // OrbitControls constraints
  minDistance: number;             // bounds.height * 0.5 — don't clip through floor
  maxDistance: number;             // max(bounds.width, bounds.depth) * 3 — don't lose the scene
  minPolarAngle: number;          // 0.2 rad (~11°) — prevent looking from directly above
  maxPolarAngle: number;          // Math.PI / 2 - 0.05 — prevent going underground
  enablePan: true;
  panSpeed: 0.5;
  maxPanOffset: number;           // bounds diagonal * 0.3 — keep scene roughly centered

  // Smooth damping
  enableDamping: true;
  dampingFactor: 0.08;
}
```

The camera is initialized once when the `CompiledScenePackage` is loaded. OrbitControls target is the room center. Zoom and pan are bounded to prevent the user from losing the scene.

### 15.4 React Three Fiber integration

```tsx
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Instances, Instance } from '@react-three/drei';

function AgentCrowd({ agents }: { agents: AgentRuntimeState[] }) {
  return (
    <Instances limit={50}>
      <capsuleGeometry args={[0.2, 1.2, 4, 8]} />
      <meshStandardMaterial color="#8888ff" />
      {agents.map(agent => (
        <Instance
          key={agent.id}
          position={[agent.position.x, 0.9, agent.position.z]}
          rotation={[0, agent.heading, 0]}
        />
      ))}
    </Instances>
  );
}
```

### 15.5 Agent rendering levels

**Level 1 (MVP):** Low-poly humanoid shapes differentiated by gender and age group (distinct silhouettes for male/female, young/old), walk / idle / sit / talk animation clips, per-agent color from `clothingColors`.

**Level 2:** Differentiated archetype silhouettes (staff uniform, seated worker, casual visitor), varied props, interaction animations (face-each-other, gesture).

**Level 3:** Speech bubble overlays, path preview lines, group relationship indicators, interaction state visualization.

---

## 16. Asset strategy

### 16.1 Philosophy
Do not model from scratch. Use generic low-poly or stylized assets and recolor / rescale them at runtime.

### 16.2 Asset sources
- **Kenney.nl** — free CC0 character and furniture packs (GLB-ready)
- **Sketchfab** — CC-licensed low-poly environment packs
- **Mixamo** — free character animation clips (FBX → GLB conversion)
- **Quaternius** — free stylized character packs

### 16.3 Runtime asset adaptation
At scene creation:
- Pick asset variant from type lookup table
- Scale to environment bounds
- Place at Gemini-extracted position
- Apply `StyleProfile` color overrides via `MeshStandardMaterial` properties

---

## 17. Interventions and world manipulation

### 17.1 MVP interventions
Interventions mutate world state and trigger agent replanning.

- Add 3 more people (spawn agents at entrance)
- Block a corridor (add blockedZone polygon)
- Move a table (update object position, rebuild navgraph)
- Mark area congested (raise density score for zone)
- Make an exit attractive (raise zone `attractivenessWeight`)
- Fast-forward 10 seconds (advance sim clock, run N ticks)

### 17.2 Stretch interventions
- Alarm event (raise arousal for all agents)
- Staff starts directing crowd
- Sudden obstacle appears
- One group decides to leave simultaneously
- Global objective change ("everyone wants coffee")

### 17.3 Architecture rule
Intervention changes **world state only**. Then:
1. Local sim responds immediately (next tick)
2. Selected agents get sparse cognitive refresh (Gemini 3.1 Flash-Lite Preview)
3. World evolves forward from new state

---

## 18. API design

### 18.1 Backend endpoints

#### `POST /api/upload-video`
Uploads source video to Gemini Files API. Validates duration (≤20s) and size (≤100MB — Gemini now supports up to 100MB inline).
```json
Response: { "jobId": "job_123", "fileUri": "files/abc..." }
```

#### `POST /api/compile-scene`
Starts ADK compile pipeline. Returns immediately; progress is streamed via SSE.
```json
Request: { "jobId": "job_123" }
Response: { "sceneId": "scene_456", "status": "compiling" }
```

#### `GET /api/compile-progress/:jobId` (SSE)
**Server-Sent Events** stream for real-time compile progress. Replaces polling. The backend hooks into ADK's `runAsync()` event stream and forwards step transitions as SSE events.

```
event: step
data: { "step": "video_analysis", "status": "running", "progress": 0.25 }

event: step
data: { "step": "style_extraction", "status": "complete", "progress": 0.25 }

event: step
data: { "step": "structuring", "status": "running", "progress": 0.55 }

event: step
data: { "step": "mind_initialization", "status": "running", "progress": 0.80 }

event: complete
data: { "sceneId": "scene_456", "status": "ready" }

event: error
data: { "error": "Scene analysis failed", "fallback": true }
```

Frontend connects with `EventSource` and updates the compile progress UI in real time ("analyzing space… extracting style… initializing agents…").

#### `GET /api/scene/:sceneId`
Returns full `CompiledScenePackage` JSON.

#### `POST /api/agent-refresh`
Sparse mind refresh for one or more agents. Called by the frontend sim engine when trigger conditions are met (see §10.6). **Must include a runtime snapshot** because the server has no authoritative view of live world state (see §5.3).
```json
Request: {
  "sceneId": "scene_456",
  "agents": ["a12", "a03"],
  "eventContext": {
    "type": "path_blocked",
    "summary": "Main corridor blocked by intervention"
  },
  "runtimeSnapshot": {
    "simClock": 14200,
    "agentStates": {
      "a12": {
        "position": { "x": 3.1, "y": 0, "z": 5.8 },
        "heading": 1.57,
        "currentGoal": "move_to_exit",
        "animationState": "wait",
        "blocked": true,
        "stuckTickCount": 7,
        "goalStartedAt": 8400,
        "lastInteractionAt": 6000
      },
      "a03": {
        "position": { "x": 4.2, "y": 0, "z": 6.1 },
        "heading": 0.3,
        "currentGoal": "follow_companion",
        "animationState": "walk",
        "blocked": false,
        "stuckTickCount": 0,
        "goalStartedAt": 12000,
        "lastInteractionAt": null
      }
    },
    "blockedEdges": ["e_corr_1_to_exit_1"],
    "recentEvents": [
      { "tick": 13800, "type": "intervention", "detail": "block_corridor zone_main_corridor" },
      { "tick": 14000, "type": "path_blocked", "agentId": "a12" }
    ]
  }
}
```

The `runtimeSnapshot` gives the LLM enough context to reason about each agent's current situation without the server maintaining a parallel simulation. Only agents listed in `agents` need full state; nearby agent positions can be summarized. Payload is typically 2–5KB — negligible next to LLM inference cost.

#### `POST /api/intervention`
Applies a world-state mutation, returns updated environment delta.
```json
Request: {
  "sceneId": "scene_456",
  "type": "block_corridor",
  "params": { "zoneId": "zone_main_corridor" }
}
```

### 18.2 Persistence layer

For MVP, all server-side state is held in two in-memory `Map`s. This is an explicit simplification — no database, no file system persistence.

```ts
/** Job lifecycle: tracks uploads and compile progress. */
interface JobState {
  jobId: string;
  status: 'uploading' | 'processing_file' | 'compiling' | 'complete' | 'error';
  fileUri: string | null;              // Gemini file URI, set after upload
  fileMimeType: string | null;
  sceneId: string | null;              // set when compile starts
  currentStep: string | null;          // e.g. 'video_analysis', 'structuring'
  progress: number;                    // 0..1
  error: string | null;
  startedAt: number;                   // Date.now()
}

const jobStore = new Map<string, JobState>();
// POST /api/upload-video  → jobStore.set(jobId, { status: 'uploading', ... })
// File ready              → jobStore.get(jobId).status = 'processing_file'
// POST /api/compile-scene → jobStore.get(jobId).status = 'compiling'
// ADK step event          → jobStore.get(jobId).currentStep = step
// Compile complete        → jobStore.get(jobId).status = 'complete', sceneStore.set(sceneId, pkg)
// SSE reads from          → jobStore.get(jobId)

const sceneStore = new Map<string, CompiledScenePackage>();
// On compile complete: sceneStore.set(sceneId, pkg);
// On scene request:    sceneStore.get(sceneId);
```

**State machine: `jobId` lifecycle**
```
upload-video → uploading → processing_file → compiling → complete
                                                ↘ error
```

The SSE endpoint (`GET /api/compile-progress/:jobId`) reads from `jobStore` and streams step transitions. When compile completes, the `sceneId` is set on the job and the package is written to `sceneStore`.

**Implications and constraints:**
- Server restart loses all jobs and compiled scenes. This is acceptable for a demo.
- No duplicate detection — uploading the same video twice creates two independent jobs.
- Memory-bound: ~25 concurrent scenes is a practical ceiling (each package is ~50–200KB JSON).
- Stale jobs are cleaned up by the same TTL eviction as scenes (`SCENE_TTL_MINUTES`).
- For production, migrate to Redis or a file-backed store with TTL eviction.

### 18.3 Environment configuration

```
# .env (not committed to git)
GEMINI_API_KEY=<paid account key>
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173    # Vite dev server
MAX_VIDEO_DURATION_SEC=20
MAX_VIDEO_SIZE_MB=100
SCENE_TTL_MINUTES=60                 # auto-evict from memory after 1 hour
```

Both frontend and backend use TypeScript. Environment variables are validated at startup with Zod — the server refuses to start if `GEMINI_API_KEY` is missing.

---

## 19. Prompting strategy

### 19.1 Scene compile prompt goals
- Output must be **strict JSON only** — no prose, no markdown fences
- Infer coarse geometry, not perfect measurements
- Assign plausible roles, not certain identities
- Include uncertainty scores
- No face or identity inference
- Use `responseJsonSchema` to enforce schema at the API level (not just in the prompt)

### 19.2 Video resolution and token budget
Gemini 3.1 Pro Preview processes video at ~300 tokens/second at default resolution. A 15-second clip ≈ 4,500 tokens of video input. The 1M token context window of 3.1 Pro Preview is more than sufficient for a 15-second clip. Use `mediaResolution: "low"` if the compile call approaches context limits.

### 19.3 Example compile output structure

```json
{
  "spaceType": "cafe",
  "environment": {
    "bounds": { "width": 8, "depth": 12, "height": 3 },
    "objects": [
      {
        "id": "obj_1",
        "type": "table",
        "position": { "x": 2.5, "y": 0, "z": 4 },
        "spatialEstimate": {
          "position3d": { "x": 2.5, "y": 0, "z": 4 },
          "confidence3d": 0.72,
          "videoBoundingBox": { "yMin": 400, "xMin": 200, "yMax": 600, "xMax": 450 }
        }
      }
    ]
  },
  "agents": [ ... ],
  "style": {
    "environmentPalette": {
      "wallPrimary": "#d4c5b0",
      "floor": "#6b5a4e",
      "lightingMood": "warm"
    },
    "dominantPalette": ["#d4c5b0", "#6b5a4e", "#2c1e0f", "#f0e8d8", "#8b7355"]
  },
  "compileMetadata": {
    "sceneConfidence": 0.81,
    "geminiModel": "gemini-3.1-pro-preview",
    "uncertainty": [
      "right-side exit may be partially occluded",
      "object near back wall: shelf or counter ambiguous"
    ]
  }
}
```

---

## 20. Performance strategy

### 20.1 Why this is feasible
All heavy computation (Gemini video analysis) is compile-time, not runtime. The browser sim is deliberately lightweight.

### 20.2 Performance rules

**Guiding principle: never sacrifice simulation quality or visual fidelity for marginal performance gains.** The paid API account and modern hardware mean we can prioritize richness. Optimize rendering and networking, not the AI or behavioral depth.

- Cap video duration (≤20s) and sampled frame count (≤24 frames via 1–2 FPS sampling) — this is an input constraint, not a quality compromise
- Use `InstancedMesh` for all agent geometry — single draw call for entire crowd
- Use distinct character rigs per demographic category (gender × age group); vary color, animation clip, and props within each rig
- LLM cognitive updates: prioritize quality of each update over throttling frequency — allow more updates if the scene demands it (e.g., during interventions or high-density moments)
- Separate sim tick (100–200ms) from render FPS (60fps)
- WebGPURenderer: enables compute shaders for future GPU-side sim
- Agent micro-behaviors (glances, fidgets, gestures) run at negligible cost — do not cut them for performance

### 20.3 MVP limits

| Parameter | Limit |
|-----------|-------|
| Video duration | ≤ 20s |
| Sampled frames | 12–24 |
| Agent count | 5–25 |
| Runtime LLM updates | 0–3 agents / 2s |
| Scene scope | One room |
| Gemini Files API storage | 2GB per file, 20GB project total |

---

## 21. Rate limit strategy

A paid Google AI account is used — rate limits and quota are not a constraint for this project. No fallback models or defensive retry logic is needed.

- Route all sparse runtime updates to **Gemini 3.1 Flash-Lite Preview** for speed and cost efficiency.
- Reserve **Gemini 3.1 Pro Preview** for the scene analysis compile pass where deep reasoning matters.
- Standard error handling (network failures, transient 5xx) is sufficient — no special 429 backoff logic required.

---

## 22. Reliability strategy

### 22.1 ADK pipeline error recovery

Each sub-agent in the pipeline is wrapped with error handling. If ADK's `ReflectAndRetryToolPlugin` is available in TS, use it; otherwise implement equivalent logic with try/catch + Zod validation + re-prompt (see §6.2 caveat).

**Per-agent retry strategy:**
- `VideoAnalysisAgent` (Gemini 3.1 Pro Preview): max 2 retries. If all fail, emit a minimal scene with `spaceType: 'unknown'`, default bounds (8×12×3m), and 0 objects. The `StyleExtractionAgent` result (which ran in parallel) is still usable.
- `StyleExtractionAgent` (Gemini 3.1 Flash-Lite Preview): max 2 retries. If all fail, use a neutral default palette (`#cccccc` walls, `#888888` floor, `neutral` mood).
- `StructuringAgent` (Gemini 3.1 Flash-Lite Preview): max 3 retries. This agent is most likely to produce invalid JSON. On failure, validate the raw output with Zod, log the specific validation errors, and retry with an error-aware prompt that includes the validation message. If all retries fail, use the raw `VideoAnalysisAgent` output with minimal structuring (no nav graph — agents wander randomly).
- `MindInitAgent` (Gemini 3.1 Flash-Lite Preview): max 2 retries. On failure, assign all agents the `unknown` archetype with default trait values (`patience: 0.5, curiosity: 0.5, conformity: 0.5, arousal: 0.3`) and a `wander` goal. The simulation will still run — just with less personality.

**Pipeline-level handling:**
- If the `ParallelAgent` (Step 2a+2b) partially fails, the pipeline continues with whatever succeeded. A failed style extraction just means neutral colors; a failed video analysis is more serious and triggers the minimal scene fallback.
- All errors are logged with the SSE `error` event so the frontend can show "Scene compiled with reduced detail" rather than a hard failure.

### 22.2 Compile fallbacks
If Gemini returns low-confidence scene data (`sceneConfidence < 0.4`):
- Use a simpler room shell (default `spaceType: 'unknown'` template) while retaining all extracted style/palette data
- Reduce object count to essentials
- Place fewer agents (minimum 3)
- Preserve palette-only style grounding

### 22.3 Agent fallback behavior
If an LLM cognitive update fails or times out:
- Keep current goal unchanged
- Continue with local utility system (which is already rich enough for plausible behavior)
- Choose conservative wait / reroute behavior

### 22.4 UX honesty
The UI communicates that this is a **plausible simulation**, not a literal replay.

Use language like:
- "Plausible agents" ✅
- "Inferred roles" ✅
- "Likely next actions" ✅
- "Situational simulation" ✅

Avoid:
- "Cloned people" ❌
- "Exact prediction" ❌
- "Reading their thoughts" ❌

---

## 23. Privacy and safety

- No identity matching or face recognition
- No biometric data stored
- Uploaded video deleted from Gemini Files API after compile (48h auto-expiry, or explicit delete call)
- No claims of predicting exact real-world outcomes
- Agent personas are fictional constructs, not representations of the real individuals in the video

---

## 24. MVP scope

### Must-have
- Upload short video → compile scene package via ADK + Gemini
- Extract scene context (location, time, global summary) for grounded agent generation
- Build stylized Three.js r183 scene with WebGPURenderer
- Spawn 5–15 agents with InstancedMesh, visually differentiated by gender and age group
- Run local live simulation (stochastic utility-based, fixed tick) with micro-behaviors
- Occasional spontaneous agent-to-agent interactions
- Click agent to inspect role / goal / likely next action / demographics
- Fast-forward 10 seconds
- Apply style grounding from video palette

### Nice-to-have
- One or two interactive interventions
- Path visualization
- Group interaction indicators and conversation bubbles
- Sparse runtime mind refresh via Gemini 3.1 Flash-Lite Preview

### Cut if needed
- Complex object extraction (>10 types)
- Full social relationship graph
- Rich animation library (>3 clips)
- Many intervention types
- More than one room

---

## 25. Recommended implementation phases

### Phase 1 — Skeleton
- Upload video → Gemini Files API upload
- Stub backend ADK pipeline
- Hardcoded room scene in Three.js r183 with WebGPURenderer
- One character asset walking around with InstancedMesh

### Phase 2 — Scene compile
- Wire up ADK pipeline (`ParallelAgent` for perception + `SequentialAgent` for synthesis)
- Gemini 3.1 Pro Preview scene analysis → structured JSON via `responseJsonSchema`
- Build room shell from JSON output
- Add furniture asset binding

### Phase 3 — Agent runtime
- Spawn agents from compile output
- A* pathfinding on navigation graph
- Utility scoring loop
- Click-to-inspect panel

### Phase 4 — Style grounding
- Recolor room and agent clothing from extracted palette
- Add 2–3 key props from source video bounding boxes

### Phase 5 — Live cognition
- Wire sparse Gemini 3.1 Flash-Lite Preview cognitive updates
- Handle path-blocked and group-split events
- Trigger updates on intervention

### Phase 6 — Demo polish
- Loading states with ADK step progress
- Agent labels via `<Html>` (drei)
- Fast-forward button
- Intervention buttons (block corridor, add people)
- Debug overlay (nav graph, agent goals)

---

## 26. Example demo narrative

1. User uploads a 12-second cafe video.
2. System: "Compiling scene… analyzing space… initializing agents…"
3. Browser reveals a stylized 3D cafe whose warm palette and object layout match the video. System notes: "Afternoon, likely East Asian café, moderate crowd."
4. Five detected people become plausible agents — visually distinct (young woman in business attire, elderly man in casual wear, etc.).
5. Roles shown on click: seated worker (young female, patient, low sociability), waiting guest (middle-aged male, curious), friend following companion, staff member.
6. User watches: the waiting guest glances around, then spontaneously approaches the staff member to ask something. The two seated friends lean toward each other briefly.
7. User presses "Predict next 10s" — agents continue moving and reacting with natural variation.
8. User clicks "Block corridor" — obstacle appears in main path.
9. Agents reroute; one gets a cognitive update: goal changes from `move_to_exit` to `follow_companion`. Another agent pauses, looks confused, fidgets.
10. User sees a world that is alive, not pre-scripted.

---

## 27. Future directions

- Crowd stress testing and bottleneck analysis
- Venue rehearsal and event planning
- Accessibility-aware space simulation
- Robot situational awareness training
- Counterfactual "what-if" physical space design
- Multi-room world models
- Live camera → continuous simulation update (Gemini Live API)
- Richer social interaction systems

---

## 28. Final architecture summary

### Three layers

#### 1. Compiled world from video
Gemini 3.1 Pro Preview + ADK compile pipeline produces:
- Scene graph and layout
- Semantic zones and walkable area
- Styled environment (palette from video)
- Plausible agent initialization with archetypes and goals

#### 2. Live local simulation
Three.js r183 browser runtime runs:
- Movement and pathfinding
- Collision avoidance
- Queues, following, spacing
- Utility-based replanning
- InstancedMesh crowd rendering

#### 3. Sparse LLM cognition
Gemini 3.1 Flash-Lite Preview updates:
- Meaning, motives, and intent
- Likely next actions
- Reactions to ambiguity and interventions

### Core sentence
**The world is compiled from video, but behavior is simulated live.**

---

## 29. Zustand store architecture

The frontend uses a single Zustand store split into logical slices. This keeps sim state, UI state, and scene data co-located but independently updatable.

```ts
interface NextStateStore {
  // Scene data (set once after compile)
  scene: CompiledScenePackage | null;
  sceneStatus: 'idle' | 'uploading' | 'compiling' | 'ready' | 'error';
  compileProgress: { step: string; progress: number } | null;

  // Simulation state (updated every tick)
  agents: Map<string, AgentRuntimeState>;
  simClock: number;              // ms since sim start
  simRunning: boolean;
  simSpeed: number;              // 1.0 = realtime, 10.0 = fast-forward

  // UI state
  selectedAgentId: string | null;
  inspectorOpen: boolean;
  debugOverlayVisible: boolean;
  interventionMode: string | null;  // e.g. 'block_corridor', null when inactive

  // Actions
  loadScene: (pkg: CompiledScenePackage) => void;
  tick: (dt: number) => void;
  selectAgent: (id: string | null) => void;
  triggerIntervention: (type: string, params: Record<string, unknown>) => void;
  setSimSpeed: (speed: number) => void;
  toggleDebug: () => void;
}
```

---

## 30. Testing strategy

### 30.1 Unit tests
- **Utility functions:** Each `UtilityFn` tested in isolation with mock `AgentModel` and `WorldState`. Verify score ranges, edge cases (zero patience, max density, expired TTL).
- **A* pathfinding:** Test on small known graphs. Verify blocked edges are skipped, congestion multipliers affect path choice, unreachable targets return empty path.
- **Navigation graph generation:** Given a simple `EnvironmentModel`, verify nodes are placed at portals and zone centers, edges connect walkable pairs only.

### 30.2 Integration tests
- **Compile pipeline:** Feed a known test video to the full ADK pipeline. Verify the output parses as a valid `CompiledScenePackage` via Zod. Run against multiple scene types (café, office, corridor).
- **API round-trip:** `POST /api/upload-video` → `POST /api/compile-scene` → SSE stream → `GET /api/scene/:sceneId`. Verify the full chain returns a valid package.

### 30.3 Visual / manual tests
- **Sim behavior:** Run the simulation with a hardcoded `CompiledScenePackage` (no API needed). Watch for: agents reaching goals, rerouting on blocked paths, interaction triggers, micro-behavior variety.
- **Rendering:** Verify `InstancedMesh` renders all agents, camera constraints work, labels appear over agents, style colors match the palette.

### 30.4 Tools
- **Vitest** for unit and integration tests (Vite-native, fast).
- **Zod** schema validation as a test assertion — if the compile output passes Zod parsing, the types are correct.
- No E2E browser testing for MVP — visual verification is sufficient.

---

## 31. Deployment plan (MVP)

### 31.1 Local development
- Frontend: `vite dev` on port 5173
- Backend: `tsx watch server.ts` on port 3001
- Both share `GEMINI_API_KEY` from `.env`

### 31.2 Demo deployment
- **Frontend:** Static build (`vite build`) deployed to Vercel or Cloudflare Pages.
- **Backend:** Single Node.js process on Railway, Render, or Google Cloud Run. Stateless except for the in-memory scene store.
- **Environment variables:** Set via platform's secrets/env management. Never committed to git.
- **CORS:** Backend allows `CORS_ORIGIN` from the deployed frontend domain.

### 31.3 Not needed for MVP
- Database, Redis, or persistent storage
- Auth / user accounts
- CI/CD pipeline (manual deploy is fine)
- CDN for assets (serve from static build)

---

## Appendix A — Gemini model quick reference (March 2026)

### Latest / recommended models

| Model ID | Status | Context | Notes |
|----------|--------|---------|-------|
| `gemini-3.1-pro-preview` | Preview (GA soon) | 1M tokens | **Best reasoning, primary compile model.** Gemini 3 Pro Preview alias now redirects here. |
| `gemini-3.1-flash-lite-preview` | Preview | 1M tokens | **Fastest + cheapest 3.x model.** Use for structuring, mind init, runtime updates. Released March 3, 2026. |
| `gemini-3-flash-preview` | Preview | 1M tokens | Frontier multimodal; slightly heavier than Flash-Lite. |

### Deprecated — do not use

| Model ID | Status | Notes |
|----------|--------|-------|
| `gemini-2.0-flash`, `gemini-2.0-flash-lite` | ⚠️ Retiring June 1, 2026 | Will break |
| `gemini-1.5-*`, `gemini-1.0-*` | ❌ Already retired | Returns 404 |

### Recommended model assignment for this project

| Pipeline step | Model | Rationale |
|---------------|-------|-----------|
| Scene analysis compile | `gemini-3.1-pro-preview` | Needs deepest video reasoning |
| Scene structuring (JSON) | `gemini-3.1-flash-lite-preview` | Schema enforcement, fast |
| Agent mind initialization | `gemini-3.1-flash-lite-preview` | Batch persona inference |
| Style extraction | `gemini-3.1-flash-lite-preview` | Simple palette extraction |
| Sparse runtime updates | `gemini-3.1-flash-lite-preview` | Low-latency, high-volume |

## Appendix B — SDK migration

**Use only:**
```ts
import { GoogleGenAI } from "@google/genai";  // ✅ unified SDK
import { SequentialAgent } from "@google/adk"; // ✅ ADK orchestration
```

**Do not use:**
```ts
import { GoogleGenerativeAI } from "@google/generative-ai"; // ❌ deprecated
import { VertexAI } from "@google-cloud/vertexai";           // ❌ deprecated, removed June 2026
import * as vertexai from "vertexai";                        // ❌ same
```

## Appendix C — Files API cheat sheet

```ts
// Upload
let file = await ai.files.upload({ file: blob, config: { mimeType, displayName } });

// Poll until active (note: use let, not const, since file is reassigned)
while (file.state === "PROCESSING") {
  await sleep(2000);
  file = await ai.files.get({ name: file.name });
}
if (file.state === "FAILED") throw new Error("File processing failed");

// Use in generateContent
{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }

// Delete after compile
await ai.files.delete({ name: file.name });

// Limits: 2GB per file, 20GB project storage, 48h auto-expiry
// Supported video: MP4, MPEG, MOV, AVI, FLV, WebM, WMV, 3GPP
```
