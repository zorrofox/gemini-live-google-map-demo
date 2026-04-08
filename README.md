# Google Maps + Gemini Live Demo

A real-time, multimodal AI assistant for Dubai restaurant discovery. Built with the Gemini Live API for bidirectional voice conversation, Google Maps Grounding for restaurant search, and an interactive 3D Google Map.

Supports two client modes:
- **Glasses** (`?clientType=glasses`) — audio input source, drives the Gemini session
- **Web** (`?clientType=web`) — observer, receives all Gemini responses for map/UI updates

---

## Prerequisites

- Python 3.10–3.12
- Node.js 18+
- [Poetry](https://python-poetry.org/docs/#installation)
- Google Cloud SDK (`gcloud`)
- Docker (for deployment)

---

## Local Development

All commands run from `app-starter-pack/service/`.

### 1. Install dependencies

```bash
cd app-starter-pack/service

poetry install
npm --prefix frontend install
```

### 2. Configure environment

```bash
export GOOGLE_API_KEY="AIza..."        # Google Maps + Gemini API key
export PROJECT_NUMBER="..."            # GCP project number
export FIRESTORE_PROJECT="..."         # Firestore project ID

echo "VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY" > ./frontend/.env
```

### 3. Build frontend and start backend

```bash
npm --prefix frontend run build

GOOGLE_API_KEY=$GOOGLE_API_KEY \
PROJECT_NUMBER=$PROJECT_NUMBER \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server serves the React SPA at `http://localhost:8000` and the WebSocket at `ws://localhost:8000/ws`.

### One-command start

```bash
cd app-starter-pack
bash start-all.sh
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | Yes | Maps Grounding, Weather API, Gemini API |
| `PROJECT_NUMBER` | Yes | GCP project number for Vertex AI |
| `FIRESTORE_PROJECT` | Yes | Firestore project ID |
| `ALLOWED_ORIGINS` | No | CORS origins, comma-separated (default: `http://localhost:5173,http://localhost:8000`) |
| `WS_SECRET` | No | Shared secret for WebSocket auth (omit to allow all connections) |

---

## Architecture

```
app-starter-pack/service/        ← single deployable unit
├── server.py                    # FastAPI: SPA + WebSocket + HTTP endpoints
├── app/
│   ├── agent.py                 # Gemini Live client, model config
│   ├── tools.py                 # Maps grounding, weather, itinerary tools
│   └── templates.py             # System instructions, persona definitions
├── frontend/                    # React/Vite/TypeScript SPA
└── Dockerfile                   # Node.js + Python, builds frontend in one image
```

**Models used:**
- `gemini-live-2.5-flash-native-audio` — real-time voice conversation (Gemini Live API, Vertex AI)
- `gemini-2.5-flash` — restaurant search via Google Maps Grounding (Generative Language API)

**Data flow:**
1. User speaks → PCM audio → WebSocket `/ws`
2. Server streams audio to Gemini Live API; intercepts tool calls server-side
3. `maps_grounding()` returns restaurant suggestions with `placeId` metadata
4. Server broadcasts all Gemini responses to every connected client (glasses + web)
5. Frontend updates map markers, place details, and itinerary

---

## Deployment

> **⚠️ Build from `app-starter-pack/`** — `service/frontend` is a symlink. `gcloud run deploy --source .` and building from `service/` both fail because Cloud Build does not follow symlinks.

```bash
cd app-starter-pack

docker build -f service/Dockerfile \
  --build-arg GOOGLE_API_KEY=$GOOGLE_API_KEY \
  -t $IMAGE_NAME .

docker push $IMAGE_NAME

gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --region $REGION \
  --memory 4Gi \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --session-affinity \
  --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY,PROJECT_NUMBER=$PROJECT_NUMBER,FIRESTORE_PROJECT=$FIRESTORE_PROJECT"
```

Or use the provided script (requires `.env` in `app-starter-pack/`):

```bash
cd app-starter-pack
bash deploy-service.sh
```

**First deployment:** grant Vertex AI access to the Cloud Run service account:

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

## Testing

```bash
cd app-starter-pack

# Backend unit tests (no credentials needed)
python3 -m pytest tests/unit/ -v --cov=service

# Integration tests (requires real credentials)
GOOGLE_API_KEY=... FIRESTORE_PROJECT=... PROJECT_NUMBER=... \
python3 -m pytest tests/integration/ -v

# Frontend unit tests
npm --prefix service/frontend run test:coverage
```

---

## Glasses Client Integration

The server supports two connection methods for smart glasses devices.

### Method 1: Standard WebSocket

```
wss://<host>/ws?client_type=glasses&voice_name=Charon&secret=<secret>
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `client_type` | `glasses` | Must be `glasses` — the only role that opens a Gemini session |
| `voice_name` | `Charon` | AI persona voice (see options below) |
| `secret` | `""` | Required when `WS_SECRET` is set server-side; connection rejected (code 1008) if missing or wrong |

After connecting, send JSON messages:

```json
// Session init (logged for correlation, not forwarded to Gemini)
{ "setup": { "run_id": "uuid", "user_id": "device-id" } }

// Audio stream (PCM 16kHz, base64-encoded)
{ "realtimeInput": { "mediaChunks": [{ "mimeType": "audio/pcm;rate=16000", "data": "<base64>" }] } }

// Text input
{ "clientContent": { "turns": [{ "role": "user", "parts": [{ "text": "..." }] }], "turnComplete": true } }
```

### Method 2: Gemini API-Compatible Path (Go SDK)

```
wss://<host>/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent
```

No query parameters required. Accepts `Authorization: Bearer <token>` header (logged but not validated — the server uses its own Vertex AI credentials). Glasses teams using the Go GenAI SDK only need to change the host; no other code changes required.

### Voice Options

| `voice_name` | Gender | Style |
|---|---|---|
| `Charon` | Male | Calm (default) |
| `Aoede` | Female | Elegant |
| `Fenrir` | Male | Bold |
| `Puck` | Male | Playful |
| `Kore` | Female | Gentle |
| `Marvin` | Male | Melancholic |

### Gemini Session Configuration

All session parameters are fixed server-side in `app/agent.py`:

| Setting | Value |
|---|---|
| Model | `gemini-live-2.5-flash-native-audio` |
| Output | `AUDIO` only (TEXT not supported by this model) |
| Input transcription | Enabled (`AudioTranscriptionConfig`) |
| Output transcription | Enabled — text streamed to web clients via `outputTranscription` |
| Context compression | Sliding window — prevents disconnection after 15 min |

---

## Itinerary Sharing (`outro/`)

`app-starter-pack/outro/` is a separate Next.js app that displays shareable itinerary pages at `/i/[itineraryId]`, fetched from Firestore. Deployed independently from the main service.

---

## Disclaimer

This is a demo for proof-of-concept purposes only and is not an officially supported Google product.
