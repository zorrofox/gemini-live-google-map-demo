# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Maps + Gemini Live API demo — a real-time, multimodal (audio/video) AI assistant for Dubai restaurant discovery. The agent uses the Gemini Live API for bidirectional voice conversation, Google Maps Grounding for restaurant search, and displays results on an interactive 3D Google Map.

All active development happens under `app-starter-pack/service/`. This single directory contains both the Python backend and the React frontend; the backend serves the built frontend as a static SPA.

## Development Commands

All commands below assume you're in `app-starter-pack/service/`.

### Backend (Python/FastAPI)

```bash
# Install dependencies
poetry install

# Build frontend first, then start backend (serves SPA + WebSocket)
echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env
npm --prefix frontend run build

GOOGLE_API_KEY=$GOOGLE_API_KEY \
PROJECT_NUMBER=$PROJECT_NUMBER \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Run tests
poetry run pytest ../tests/unit
poetry run pytest ../tests/integration

# Lint
poetry run flake8
poetry run pylint app/ server.py
poetry run mypy app/ server.py
```

### Frontend (React/Vite/TypeScript)

```bash
# Install dependencies
npm --prefix frontend install

# Build (required before running backend)
echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env
npm --prefix frontend run build

# Frontend-only dev server (hot-reload, run alongside backend)
npm --prefix frontend run dev

# Lint / format
npm --prefix frontend run lint
npm --prefix frontend run format

# Unit tests
npm --prefix frontend run test:coverage
```

### One-command Local Start

```bash
cd app-starter-pack
bash start-all.sh   # builds frontend + starts backend on port 8000
```

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Google Maps Grounding, Weather API, Gemini API (non-Vertex path) |
| `PROJECT_NUMBER` | GCP project number for Vertex AI |
| `FIRESTORE_PROJECT` | Firestore GCP project ID |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins (default: `http://localhost:5173,http://localhost:8000`) |
| `WS_SECRET` | Optional shared secret for WebSocket connections (omit to allow all) |

## Architecture

### Single Deployable Unit

`app-starter-pack/service/` is the only deployable unit. The backend (`server.py`) serves the frontend SPA from `frontend/dist/` (built by `npm run build`), so a single container handles everything.

```
app-starter-pack/service/
├── server.py          # Unified FastAPI server (SPA + WebSocket + HTTP endpoints)
├── app/
│   ├── agent.py       # Gemini client + LiveConnectConfig
│   ├── tools.py       # All agent tools (Maps grounding, weather, etc.)
│   ├── templates.py   # System instructions + persona definitions
│   └── vector_store.py
├── frontend/          # React/Vite/TypeScript frontend (symlink → app-starter-pack/frontend/)
│   └── src/
├── Dockerfile         # Builds frontend + installs Python deps in one image
├── cloudbuild.yaml    # Cloud Build config
└── pyproject.toml
```

### Backend (`server.py`)

- **Unified FastAPI server** — serves the React SPA (`GET /`), exposes `/ws` WebSocket endpoint, and all HTTP endpoints (`/feedback`, `/submititinerary`, `/api/routes`, `/api/health`)
- **`ConnectionManager`** — manages simultaneous connections: one glasses client (audio input, drives the Gemini session) and multiple web clients (observers, receive all Gemini broadcasts)
- **`GeminiSession`** — bidirectional streaming between the glasses WebSocket and the Gemini Live API; tool calls are executed server-side; all Gemini responses are broadcast to all connected clients
- **WebSocket clients**:
  - `?client_type=glasses` — opens a Gemini session, streams audio to Gemini
  - `?client_type=web` — observer only, receives all Gemini responses for map/UI updates
  - `/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent` — Gemini API-compatible path for Go SDK glasses clients
- **`/api/routes`** — proxies Google Routes API server-side so the Maps API key is never exposed in the browser bundle

### App Layer (`app/`)

- **`agent.py`** — Initializes the Gemini client (VertexAI, hardcoded on), model: `gemini-live-2.5-flash-native-audio`, builds `LiveConnectConfig` with voice, tools, and system instructions. **⚠️ This model only supports AUDIO output** — setting `response_modalities=["TEXT"]` causes a WebSocket 1007 disconnect. Text content is obtained via the `outputTranscription` field (requires `AudioTranscriptionConfig` in `LiveConnectConfig`).
- **`tools.py`** — All agent tools: `get_restaurant_suggestions`, `select_restaurant`, `get_place_information`, `show_place_photos`, `hide_photos`, `get_weather`, `submit_itinerary`. Restaurant tools call `maps_grounding()`, which hits the Generative Language API (`gemini-2.5-flash`) with `google_maps` grounding. Returns `model_text` + `grounding_metadata` (placeId, title)
- **`templates.py`** — `SYSTEM_INSTRUCTION` (extensive, enforces tool-call-first on restaurant selection, bilingual EN/ZH), `PERSONA_MAP` (Aoede/Charon/Fenrir/Puck/Kore/Marvin), Maps grounding sub-agent prompts
- **`vector_store.py`** — RAG vector store (LangChain + VertexAI embeddings); loaded at startup

### Frontend (`frontend/src/`)

- **`App.tsx`** — Root component. URL query params configure runtime behaviour: `?clientType=glasses|web`, `?textOnly=`, `?chatEnabled=`, `?userId=`, `?host=`, `?protocol=`
- **`utils/multimodal-live-client.ts`** — WebSocket client speaking the Gemini Live API protocol; handles audio streaming, grounding metadata messages, auto-reconnect. Emits a `transcription` event from `serverContent.outputTranscription` for text display in Chat.
- **`store/store.ts`** — Global Zustand + Immer store: `itineraryItems`, `currentSuggestions`, `mapTriggers`, `ui.view` (`intro` → `map` → `end-summary`)
- **`components/map-handler/`** — Renders `<gmp-map-3d>`, places markers, shows navigation routes via `/api/routes` proxy
- **`components/places-handler/`** — Fetches Place Details from Maps Places API using placeIds from grounding metadata
- **`components/live-client-handler/`** — Bridges WebSocket events to the Zustand store (tool calls, grounding responses, transcription text)
- **`hooks/use-query-state.ts`** — Default backend host points to the Cloud Run deployment; switch to `localhost:8000` for local dev

### textOnly Mode

URL param `?textOnly=true` behaviour:
- Frontend hides audio/video controls, enables Chat input panel, and mutes audio playback
- Backend always uses AUDIO modality (native-audio model does not support TEXT)
- Gemini streams text via `serverContent.outputTranscription`; `live-client-handler` forwards it to the Chat panel via `buildGeminiTextResponse`

### Key Data Flow

1. User speaks → `AudioRecorder` captures PCM → `MultimodalLiveClient` streams to `/ws`
2. `server.py` forwards audio to Gemini Live API; tool calls are intercepted in `GeminiSession._handle_tool_call`
3. `maps_grounding()` calls Generative Language API with Maps grounding; returns `grounding_metadata` with `placeId` values
4. Backend broadcasts `groundingResponse` JSON to **all** connected WebSocket clients (glasses + web)
5. Frontend `live-client-handler` parses this, updates Zustand store
6. `places-handler` fetches rich Place Details; `map-handler` renders markers and routes

### Deployment

**⚠️ Build context must be `app-starter-pack/`**, not `service/` — `service/frontend` is a symlink; `gcloud run deploy --source .` and building from inside `service/` both fail because Cloud Build does not follow symlinks (`COPY frontend/` silently copies nothing).

```bash
# Build and deploy from app-starter-pack/
cd app-starter-pack

docker build -f service/Dockerfile \
  --build-arg GOOGLE_API_KEY=$GOOGLE_API_KEY \
  -t $IMAGE_NAME .

docker push $IMAGE_NAME

gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --region $REGION \
  --memory 4Gi --timeout 1200 \
  --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY,PROJECT_NUMBER=$PROJECT_NUMBER,FIRESTORE_PROJECT=$FIRESTORE_PROJECT,ALLOWED_ORIGINS=*"
```

**First deployment: grant Vertex AI access to the Cloud Run service account:**

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

`service/Dockerfile` installs Node.js, builds the frontend, installs Python deps, and starts `uvicorn server:app`. One image, one container, one service.

### `outro/` directory

A separate Next.js app (`app-starter-pack/outro/`) for displaying a shareable itinerary page at `/i/[itineraryId]` fetched from Firestore. Deployed independently.

## Tests

```bash
# Unit tests — no GCP credentials needed
# (conftest.py replaces all external packages via sys.modules at import time)
cd app-starter-pack
python3 -m pytest tests/unit/ -v --cov=service

# Integration tests (requires real GOOGLE_API_KEY + FIRESTORE_PROJECT + PROJECT_NUMBER)
GOOGLE_API_KEY=... FIRESTORE_PROJECT=... PROJECT_NUMBER=... \
python3 -m pytest tests/integration/ -v

# Frontend unit tests
npm --prefix service/frontend run test:coverage
```

**Integration test gotcha:** the server readiness check polls `/api/health` (not `/health`) — using the wrong path causes `_wait_ready()` to time out and kill the server before any test runs.
