# next-state

Video → compiled 3D scene → live browser simulation with AI-driven agents. See `docs/spec.md` for the full technical specification (Revision 4.0).

## Architecture

**Compile-once, simulate-live.** A short video is analyzed by Gemini, compiled into a `CompiledScenePackage` JSON, then simulated entirely in the browser. The server is stateless at runtime — the browser owns all live world state.

```
Browser Upload → Backend (Node/TS) → Gemini Files API → ADK Pipeline → CompiledScenePackage JSON → Three.js Frontend
```

Two main layers:
- `server/` — Node.js/TypeScript API server, ADK compile pipeline, Gemini calls
- `client/` — Vite + React 19 + Three.js r183 + R3F v9.5, Zustand store, simulation engine

## Tech Stack — Locked Choices

These are decided. Do not suggest alternatives.

| Layer | Choice | NOT this |
|-------|--------|----------|
| Bundler | **Vite** | Next.js, Webpack |
| State | **Zustand** | Jotai, Redux, MobX |
| 3D | **Three.js r183** + `WebGPURenderer` | Babylon.js, PlayCanvas |
| React 3D | **@react-three/fiber v9.5** + **drei v10.7** | raw Three.js in React |
| UI | **shadcn/ui** + **Tailwind CSS** | MUI, Chakra, Ant |
| AI SDK | **`@google/genai`** (unified) | `@google/generative-ai` (deprecated), `vertexai` (deprecated) |
| Orchestration | **`@google/adk` v0.4.0** | LangChain, custom |
| Testing | **Vitest** | Jest |
| Validation | **Zod** | Yup, io-ts |

## AI Models

| Task | Model |
|------|-------|
| Scene analysis (compile) | `gemini-3.1-pro-preview` |
| Structuring, mind init, style, runtime updates | `gemini-3.1-flash-lite-preview` |

Paid Google AI account — no rate limit concerns. Do not add fallback models or 429 backoff logic.

**IMPORTANT:** `gemini-2.0-*` retires June 1, 2026. `gemini-1.5-*` and `1.0-*` already return 404. Never use them.

## SDK Usage

```ts
// ✅ Correct
import { GoogleGenAI } from "@google/genai";
import { SequentialAgent, ParallelAgent, LlmAgent } from "@google/adk";

// ❌ Never use
import { GoogleGenerativeAI } from "@google/generative-ai";  // deprecated
import { VertexAI } from "@google-cloud/vertexai";            // deprecated
```

Structured output pattern: always use `responseMimeType: "application/json"` + `responseJsonSchema` (Zod-derived via `zod-to-json-schema`). Parse response with Zod for runtime safety.

## Three.js r183 — Breaking Changes

- Use `Timer` not `Clock` (deprecated)
- `PostProcessing` is renamed to `RenderPipeline`
- Use `CubeRenderTarget` not `WebGLCubeRenderTarget` with WebGPURenderer
- `WebGPURenderer` requires `await renderer.init()` (async)
- Use `InstancedMesh` for crowd agents, `BatchedMesh` for varied furniture
- Use `<Html>` from drei for labels, NOT `CSS2DRenderer`

## ADK TypeScript Caveat

The TS SDK is pre-GA (v0.4.0). Key limitations:
- `ParallelAgent` sub-agents don't auto-share state — merge results manually
- `ReflectAndRetryToolPlugin` may not exist in TS — use try/catch + Zod + re-prompt
- **Fallback:** If `ParallelAgent` misbehaves, replace with `Promise.all([...])` inside a `SequentialAgent`

## Key Architectural Decisions

1. **Browser-authoritative state.** The server stores `CompiledScenePackage` and that's it. All runtime state lives in the browser Zustand store. Every `/api/agent-refresh` call must include a `runtimeSnapshot` payload.

2. **2D heuristic projection is primary.** Gemini's official docs only guarantee 2D bounding boxes (normalized 0–1000). Prompted 3D estimates are experimental/opt-in. The `SpatialEstimate.projectionSource` field tracks which method was used.

3. **Utility-based agent behavior with stochastic selection.** Agents use softmax sampling (not argmax) from top-3 utility scores. Temperature is derived from arousal trait. This prevents robotic behavior.

4. **In-memory persistence only.** `jobStore` and `sceneStore` are `Map`s in server memory. No database for MVP. Server restart loses all data — acceptable for demo.

## Commands

```bash
# Frontend
cd client && npm install
npm run dev          # Vite dev on :5173
npm run build        # Production build
npm run test         # Vitest

# Backend
cd server && npm install
npm run dev          # tsx watch on :3001
npm run test         # Vitest
```

## Environment Variables

```env
# .env (never commit)
GEMINI_API_KEY=<required, paid account>
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
MAX_VIDEO_DURATION_SEC=20
MAX_VIDEO_SIZE_MB=100
SCENE_TTL_MINUTES=60
```

Validated at startup with Zod. Server refuses to start if `GEMINI_API_KEY` is missing.

## API Endpoints

- `POST /api/upload-video` — Upload to Gemini Files API, returns `jobId`
- `POST /api/compile-scene` — Start ADK pipeline, returns `sceneId`
- `GET /api/compile-progress/:jobId` — SSE stream of compile steps
- `GET /api/scene/:sceneId` — Full `CompiledScenePackage` JSON
- `POST /api/agent-refresh` — Sparse cognitive update (must include `runtimeSnapshot`)
- `POST /api/intervention` — World-state mutation

## Code Conventions

- TypeScript strict mode everywhere
- Named exports for components and utilities
- Zod schemas for all API request/response validation
- Y-up coordinate system (`Vec3 = { x, y, z }`)
- All spatial values in meters
- Agent IDs prefixed `a` (e.g., `a12`), object IDs prefixed `obj_` (e.g., `obj_1`), zone IDs prefixed `zone_` (e.g., `zone_main_corridor`)

## Common Gotchas

- `@google/genai` file upload returns `state: "PROCESSING"` — you must poll until `state: "ACTIVE"` before using the file URI. Use `let` (not `const`) for the file variable since it's reassigned in the polling loop.
- Gemini bounding boxes are normalized to 0–1000, not 0–1. The 2D→3D heuristic (§8.6) maps these to world-space meters using room bounds.
- `SimulationConfig.tickIntervalMs` (100–200ms) is separate from render FPS (60fps). Never couple them.
- `WebGPURenderer` auto-falls back to WebGL 2. Don't add manual fallback code.
- Agent `recentEvents` is a ring buffer capped at ~20 entries. Oldest events are dropped.
