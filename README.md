# next-state

Video-to-3D scene compiler with live AI-driven agent simulation. Upload a short video of any indoor space and watch it come alive as an interactive 3D scene populated with autonomous agents.

## How it works

```
Video Upload → Gemini Analysis → ADK Compile Pipeline → CompiledScenePackage JSON → Three.js Simulation
```

1. **Upload** a short video (up to 20s) of an indoor space
2. **Gemini 3.1 Pro** analyzes the video — detects objects, people, zones, spatial layout
3. **ADK pipeline** compiles the analysis into a structured 3D scene with agents, furniture, navigation graphs
4. **Three.js frontend** renders the scene and runs a live simulation with utility-based AI agents

The server is stateless at runtime — the browser owns all live world state.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19 + Three.js r183 + R3F v9.5 |
| State | Zustand |
| 3D Renderer | WebGPURenderer (auto-fallback to WebGL 2) |
| UI | shadcn/ui + Tailwind CSS |
| Backend | Node.js + TypeScript |
| AI | Gemini 3.1 Pro/Flash-Lite via `@google/genai` |
| Orchestration | `@google/adk` v0.4.0 |
| Validation | Zod |
| Testing | Vitest |

## Getting started

### Prerequisites

- Node.js 20+
- A [Google AI](https://aistudio.google.com/) API key (paid account)

### Setup

```bash
# Clone and install
git clone <repo-url> && cd next-state
npm install

# Configure environment
cp .env.example .env  # or create .env manually
```

Add your API key to `.env`:

```env
GEMINI_API_KEY=<your-key>
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Run

```bash
# Terminal 1 — Backend (port 3001)
cd server && npm run dev

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

Open http://localhost:5173 and upload a video.

## Project structure

```
client/          React + Three.js frontend
  src/
    scene/       3D rendering (agents, environment, furniture, labels)
    store/       Zustand state management
    components/  UI panels (inspector, debug overlay, upload)
server/          Node.js API server
  src/
    adk/         Gemini ADK compile pipeline
      agents/    Structuring, style extraction
      prompts/   LLM prompt templates
shared/          Shared TypeScript types and Zod schemas
```

## Features

- **Procedural 3D agents** with animated walking, sitting, talking, fidgeting
- **Agent props** — laptops, phones, cups rendered on agent bodies
- **Thought bubbles** — pop up when agents change their intent
- **Click-to-inspect** — click any agent to see their mind state, traits, goals
- **Furniture inference** — deterministic infill adds chairs, tables, and venue-appropriate objects
- **Density-aware population** — scenes auto-populate with synthetic agents based on crowd density
- **Style extraction** — colors, materials, and lighting matched from the source video
- **Utility-based AI** — agents use softmax sampling over utility scores for natural behavior

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload-video` | Upload video to Gemini Files API |
| POST | `/api/compile-scene` | Start ADK compile pipeline |
| GET | `/api/compile-progress/:jobId` | SSE stream of compile steps |
| GET | `/api/scene/:sceneId` | Full CompiledScenePackage JSON |
| POST | `/api/agent-refresh` | Sparse cognitive update |
| POST | `/api/intervention` | World-state mutation |

## Testing

```bash
cd server && npm run test
cd client && npm run test
```

## License

Private — all rights reserved.
