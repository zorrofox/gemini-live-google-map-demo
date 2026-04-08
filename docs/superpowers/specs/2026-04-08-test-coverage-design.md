# Test Coverage Design — Google Maps + Gemini Live Demo

**Date:** 2026-04-08  
**Scope:** Backend (Python) unit + integration tests; Frontend (TypeScript) unit tests via Vitest  
**Strategy:** Method B (full unit tests with mocked external deps) + Method C (integration test extensions)

---

## 1. Backend Unit Tests

### `tests/unit/test_tools.py` — covers `app/tools.py`

| Test | Approach |
|------|----------|
| `construct_vertex_maps_grounding_payload` returns correct structure | Direct assertion |
| `get_model_text` extracts text from candidates | Direct assertion |
| `get_grounding_metadata` filters chunks to mentioned places, max 3 | Direct assertion |
| `get_grounding_metadata` falls back to all chunks on JSON parse failure | Direct assertion |
| `maps_grounding` success path returns `model_text` + `grounding_metadata` | mock `aiohttp.ClientSession` |
| `maps_grounding` raises on HTTP non-200 | mock `aiohttp.ClientSession` |
| `get_weather` success returns weather summary string | mock `httpx.AsyncClient` |
| `get_weather` failure returns error string, does not raise | mock `httpx.AsyncClient` |
| `hide_photos` returns fixed status dict | Direct call |
| `submit_itinerary` returns fixed status dict | Direct call |
| `get_restaurant_suggestions` delegates to `maps_grounding` | mock `maps_grounding` |
| `get_place_information` delegates to `maps_grounding` | mock `maps_grounding` |

### `tests/unit/test_agent.py` — covers `app/agent.py`

| Test | Verifies |
|------|----------|
| `text_only='true'` → `response_modalities=['TEXT']` | Modality field |
| `text_only='false'` → `response_modalities=['AUDIO']` | Modality field |
| Known voice name → system_instruction contains persona text | `system_instruction.parts` |
| `context_window_compression` present in config | Field existence |
| All PERSONA_MAP keys produce valid config without error | No exception |

### `tests/unit/test_service_server.py` — covers `service/server.py`

**ConnectionManager:**

| Test | Verifies |
|------|----------|
| `connect_glasses` registers single connection | `glasses_ws` set |
| `connect_web` supports multiple clients | `web_clients` length |
| `disconnect` clears glasses connection | `glasses_ws` = None |
| `disconnect` removes web client from list | List shrinks |
| `broadcast_to_all` sends bytes to all clients | `send_bytes` call count |
| `send_json_to_all` sends JSON to all clients | `send_json` call count |

**GeminiSession:**

| Test | Verifies |
|------|----------|
| `receive_from_client` forwards `realtimeInput` to Gemini | `session._ws.send` called |
| `receive_from_client` forwards `clientContent` to Gemini | `session._ws.send` called |
| `receive_from_client` does NOT forward `setup` messages | `session._ws.send` not called |
| `_handle_tool_call` invokes tool function and sends response | `session.send` called |
| `_handle_tool_call` sends error response when tool raises | No crash, error sent |
| `_handle_tool_call` sends `groundingResponse` to websocket for grounding results | `websocket.send_json` called |

**Endpoints:**

| Test | Verifies |
|------|----------|
| `/ws` — no `WS_SECRET` set → any connection accepted | Handshake succeeds |
| `/ws` — correct secret → accepted | Handshake succeeds |
| `/ws` — wrong secret → closed with code 1008 | Connection rejected |
| `initialize_firestore` missing `FIRESTORE_PROJECT` → `RuntimeError` | Exception type |
| `POST /api/routes` success → returns route JSON | mock httpx, assert body |
| `POST /api/routes` upstream non-200 → 502/HTTPException | Status code |

### Extended `tests/unit/test_server.py` — covers `app/server.py` additions

| New Test | Verifies |
|----------|----------|
| WebSocket — no `WS_SECRET` → accepted | Handshake succeeds |
| WebSocket — correct secret → accepted | Handshake succeeds |
| WebSocket — wrong secret → 1008 | Connection rejected |
| `POST /api/routes` success | mock httpx, assert body |
| `POST /api/routes` missing `GOOGLE_API_KEY` → 500 | Status code |
| `initialize_firestore` missing env var → `RuntimeError` | Exception type |
| CORS OPTIONS preflight → correct `Access-Control-Allow-Origin` | Response header |

---

## 2. Backend Integration Tests

Extended `tests/integration/test_server_e2e.py` (real uvicorn, mocked external APIs):

| New Test | Approach |
|----------|----------|
| `POST /api/routes` end-to-end | Start server, intercept outbound with `respx`, assert proxy response |
| WebSocket with wrong secret → 1008 close | Connect with bad secret, assert close code |
| WebSocket with no `WS_SECRET` env var → connection succeeds | Default dev behaviour unchanged |

---

## 3. Frontend Unit Tests (Vitest)

**Toolchain:** Vitest + `@vitest/coverage-v8`. No DOM rendering needed for these tests.

### `src/store/__tests__/store.test.ts`

| Test | Verifies |
|------|----------|
| `addItineraryItem` adds new item | `itineraryItems.length` |
| `addItineraryItem` replaces existing item of same type | Length stays 1 |
| `addItineraryItem` sets `latestEntry=true` on new, `false` on old | `latestEntry` flags |
| `addItineraryItem` sets `mapTriggers.showSelection=true` | Trigger flag |
| `setCurrentSuggestions` sets suggestions + `showSuggestions=true` | State shape |
| `buildGeminiTextResponse` accumulates when in progress | Concatenated string |
| `buildGeminiTextResponse` resets when not in progress | Fresh string |
| `changeItineraryOrder` reorders items correctly | Order of types |
| `setMapTrigger` updates specific trigger key | Targeted update |

### `src/components/live-client-handler/__tests__/parse-grounding-text.test.ts`

| Test | Verifies |
|------|----------|
| Markdown JSON fence → parsed object | Return value |
| Plain JSON string → parsed object | Return value |
| Invalid JSON → returns null | Null return |
| `undefined` input → returns null | Null return |
| Empty string → returns null | Null return |

### `src/components/live-client-handler/__tests__/get-itinerary-items.test.ts`

| Test | Verifies |
|------|----------|
| Valid grounding response → correct `ItineraryItem` array | Shape of returned items |
| Missing `placeId` field → item omitted or handled | No crash |
| Empty chunks → empty array | Length = 0 |

### `src/components/map-handler/__tests__/routes-api.test.ts`

| Test | Verifies |
|------|----------|
| Success → calls `/api/routes` with correct body | `fetch` called with POST + JSON body |
| Success → returns parsed JSON | Return value shape |
| HTTP non-200 → throws with status message | Error message |
| With waypoints → `intermediates` present in request body | Body shape |

---

## 4. Toolchain Setup

### Backend
- Add `pytest-httpx` and `pytest-cov` to `[tool.poetry.group.dev.dependencies]`
- Run: `poetry run pytest tests/unit --cov=app --cov-report=term-missing`

### Frontend
- Install: `vitest`, `@vitest/coverage-v8`
- Add `vitest.config.ts` at `frontend/`
- Add `"test": "vitest run --coverage"` to `package.json`
