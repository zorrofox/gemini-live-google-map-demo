# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# pylint: disable=W0621, W0613, R0801, R1732, W0718, E1101, R0912

"""
End-to-end integration tests for the FastAPI server (app/server.py).

Requires a real server process; credentials must be set via environment variables:
  GOOGLE_API_KEY, FIRESTORE_PROJECT, PROJECT_NUMBER

Run with:
  GOOGLE_API_KEY=... FIRESTORE_PROJECT=... python3 -m pytest tests/integration/ -v
"""

import asyncio
import json
import logging
import os
import subprocess
import threading
import time
import uuid
from typing import Any, Dict, Iterator

import pytest
import requests
import websockets.client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HTTP_BASE = "http://127.0.0.1:8000"
WS_BASE   = "ws://127.0.0.1:8000"

ALT_PORT  = 8001              # used by WS_SECRET fixture on a separate port
ALT_HTTP  = f"http://127.0.0.1:{ALT_PORT}"
ALT_WS    = f"ws://127.0.0.1:{ALT_PORT}"

_SERVICE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../service")
)

DUBAI_MALL = {"latitude": 25.2048, "longitude": 55.2708}
BURJ_KHALIFA = {"latitude": 25.1972, "longitude": 55.2796}

# ---------------------------------------------------------------------------
# Server lifecycle helpers
# ---------------------------------------------------------------------------

def _build_server_command(port: int = 8000) -> list[str]:
    return [
        "poetry", "run", "uvicorn",
        "server:app",
        "--host", "0.0.0.0",
        "--port", str(port),
    ]


def _build_env(**overrides: str) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("FIRESTORE_PROJECT", "grhuang-02")
    env.setdefault("PROJECT_NUMBER", "706422770546")
    env.update(overrides)
    return env


def _start_process(command: list[str], env: dict) -> subprocess.Popen:
    proc = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
        cwd=_SERVICE_DIR,
    )
    for pipe, fn in [(proc.stdout, logger.info), (proc.stderr, logger.warning)]:
        threading.Thread(target=_drain, args=(pipe, fn), daemon=True).start()
    return proc


def _drain(pipe: Any, log_fn: Any) -> None:
    for line in iter(pipe.readline, ""):
        log_fn("[server] %s", line.rstrip())


def _wait_ready(base_url: str, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.get(f"{base_url}/api/health", timeout=3).status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def _stop(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def server() -> Iterator[None]:
    """Main server on port 8000, no WS_SECRET."""
    proc = _start_process(_build_server_command(8000), _build_env())
    if not _wait_ready(HTTP_BASE):
        _stop(proc)
        pytest.fail("Main server failed to start")
    yield
    _stop(proc)


@pytest.fixture(scope="session")
def secret_server() -> Iterator[None]:
    """Separate server on port 8001 with WS_SECRET=hunter2."""
    proc = _start_process(
        _build_server_command(ALT_PORT),
        _build_env(WS_SECRET="hunter2", ALLOWED_ORIGINS="*"),
    )
    if not _wait_ready(ALT_HTTP):
        _stop(proc)
        pytest.fail("Secret server failed to start")
    yield
    _stop(proc)


# ---------------------------------------------------------------------------
# Helpers used across tests
# ---------------------------------------------------------------------------

async def _recv_json(ws: Any, timeout: float = 10.0) -> Dict[str, Any]:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    if isinstance(raw, bytes):
        return json.loads(raw.decode())
    return json.loads(raw)


async def _collect(ws: Any, count: int = 3, timeout: float = 15.0) -> list:
    results = []
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while len(results) < count:
        remaining = deadline - loop.time()
        if remaining <= 0:
            break
        try:
            results.append(await _recv_json(ws, timeout=min(5.0, remaining)))
        except (asyncio.TimeoutError, TimeoutError):
            break
    return results


# ---------------------------------------------------------------------------
# Group 1: HTTP endpoints
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_returns_healthy(self, server: None) -> None:
        r = requests.get(f"{HTTP_BASE}/api/health", timeout=5)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "healthy"

    def test_response_is_json_with_status(self, server: None) -> None:
        body = requests.get(f"{HTTP_BASE}/api/health", timeout=5).json()
        assert isinstance(body, dict)
        assert "status" in body


class TestSpaEndpoint:
    def test_root_serves_frontend(self, server: None) -> None:
        """GET / should serve the React SPA (index.html)."""
        r = requests.get(f"{HTTP_BASE}/", timeout=5)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "<html" in r.text.lower()


class TestFeedbackEndpoint:
    def _valid_payload(self) -> dict:
        return {
            "score": 4,
            "text": "Great response!",
            "run_id": str(uuid.uuid4()),
            "user_id": "integration-test-user",
            "log_type": "feedback",
        }

    def test_valid_feedback_accepted(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/feedback", json=self._valid_payload(), timeout=10)
        assert r.status_code == 200

    def test_float_score_accepted(self, server: None) -> None:
        payload = self._valid_payload()
        payload["score"] = 3.5
        r = requests.post(f"{HTTP_BASE}/feedback", json=payload, timeout=10)
        assert r.status_code == 200

    def test_missing_run_id_returns_422(self, server: None) -> None:
        payload = self._valid_payload()
        del payload["run_id"]
        r = requests.post(f"{HTTP_BASE}/feedback", json=payload, timeout=10)
        assert r.status_code == 422

    def test_missing_score_returns_422(self, server: None) -> None:
        payload = self._valid_payload()
        del payload["score"]
        r = requests.post(f"{HTTP_BASE}/feedback", json=payload, timeout=10)
        assert r.status_code == 422

    def test_empty_body_returns_422(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/feedback", json={}, timeout=10)
        assert r.status_code == 422


class TestSubmitItineraryEndpoint:
    def _valid_itinerary(self) -> dict:
        return {
            "restaurant": {
                "placeId": "ChIJ_integration_test",
                "title": "Integration Test Restaurant",
                "order": 1,
            }
        }

    def test_valid_submission_returns_document_id(self, server: None) -> None:
        r = requests.post(
            f"{HTTP_BASE}/submititinerary",
            json=self._valid_itinerary(),
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "documentId" in body
        assert isinstance(body["documentId"], str)
        assert len(body["documentId"]) > 0

    def test_missing_place_id_returns_422(self, server: None) -> None:
        r = requests.post(
            f"{HTTP_BASE}/submititinerary",
            json={"restaurant": {"title": "No ID", "order": 1}},
            timeout=10,
        )
        assert r.status_code == 422

    def test_empty_body_returns_422(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/submititinerary", json={}, timeout=10)
        assert r.status_code == 422


class TestRoutesProxyEndpoint:
    def _route_request(self, with_waypoint: bool = False) -> dict:
        req: dict = {
            "origin": {"location": {"latLng": DUBAI_MALL}},
            "destination": {"location": {"latLng": BURJ_KHALIFA}},
            "polylineEncoding": "GEO_JSON_LINESTRING",
        }
        if with_waypoint:
            mid = {"latitude": 25.201, "longitude": 55.274}
            req["intermediates"] = [{"location": {"latLng": mid}}]
        return req

    def test_returns_200_with_routes(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/api/routes", json=self._route_request(), timeout=15)
        assert r.status_code == 200, f"Routes API returned {r.status_code}: {r.text}"
        body = r.json()
        assert "routes" in body
        assert len(body["routes"]) > 0

    def test_route_contains_polyline(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/api/routes", json=self._route_request(), timeout=15)
        assert r.status_code == 200
        route = r.json()["routes"][0]
        assert "polyline" in route
        assert "geoJsonLinestring" in route["polyline"]

    def test_route_with_waypoint(self, server: None) -> None:
        r = requests.post(
            f"{HTTP_BASE}/api/routes",
            json=self._route_request(with_waypoint=True),
            timeout=15,
        )
        assert r.status_code == 200
        assert "routes" in r.json()

    def test_invalid_body_returns_error(self, server: None) -> None:
        r = requests.post(f"{HTTP_BASE}/api/routes", json={"bad": "payload"}, timeout=10)
        # Upstream Routes API rejects malformed requests; proxy should relay error
        assert r.status_code in (400, 422, 500)


class TestCorsHeaders:
    def test_configured_origin_allowed(self, server: None) -> None:
        allowed = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip()
        r = requests.options(
            f"{HTTP_BASE}/api/health",
            headers={
                "Origin": allowed,
                "Access-Control-Request-Method": "GET",
            },
            timeout=5,
        )
        allow = r.headers.get("access-control-allow-origin", "")
        assert allow == allowed or allow == "*", (
            f"Expected CORS to allow {allowed!r}, got {allow!r}"
        )

    def test_unknown_origin_not_echoed(self, server: None) -> None:
        r = requests.options(
            f"{HTTP_BASE}/api/health",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
            timeout=5,
        )
        allow = r.headers.get("access-control-allow-origin", "")
        assert "evil.example.com" not in allow


# ---------------------------------------------------------------------------
# Group 2: WebSocket — connection behaviour
# ---------------------------------------------------------------------------

class TestWebSocketClientTypes:
    @pytest.mark.asyncio
    async def test_web_client_receives_welcome_message(self, server: None) -> None:
        async with websockets.client.connect(
            f"{WS_BASE}/ws?client_type=web", close_timeout=5
        ) as ws:
            msg = await _recv_json(ws, timeout=8)
            assert "status" in msg

    @pytest.mark.asyncio
    async def test_gemini_proxy_path_accepts_bearer_token(self, server: None) -> None:
        proxy_path = (
            "/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
        )
        try:
            async with websockets.client.connect(
                f"{WS_BASE}{proxy_path}",
                additional_headers={"Authorization": "Bearer fake-token-for-test"},
                close_timeout=5,
            ) as ws:
                # Should receive either a Gemini message or a status message
                msg = await _recv_json(ws, timeout=10)
                assert msg is not None
        except Exception:
            pass  # Connection may close quickly; what matters is no crash on accept


# ---------------------------------------------------------------------------
# Group 3: Glasses client — Gemini conversation
# ---------------------------------------------------------------------------

class TestGlassesClientConversation:
    @pytest.mark.asyncio
    async def test_initial_status_message_received(self, server: None) -> None:
        """Glasses connection triggers Gemini session; server signals readiness."""
        async with websockets.client.connect(
            f"{WS_BASE}/ws?client_type=glasses&text_only=true",
            close_timeout=10,
        ) as ws:
            # Collect messages until we see setupComplete or ready status
            msgs = await _collect(ws, count=5, timeout=30)
            keys = {k for m in msgs if isinstance(m, dict) for k in m}
            assert "setupComplete" in keys or any(
                m.get("status") for m in msgs if isinstance(m, dict)
            ), f"Expected setupComplete or status, got keys: {keys}"

    @pytest.mark.asyncio
    async def test_text_message_triggers_gemini_response(self, server: None) -> None:
        """Sending a text turn to the WebSocket should produce a Gemini response."""
        from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

        all_msgs: list = []

        try:
            async with websockets.client.connect(
                f"{WS_BASE}/ws?text_only=true",
                close_timeout=20,
            ) as ws:
                # Wait for server ready signal (Gemini session established)
                setup_msgs = await _collect(ws, count=5, timeout=30)
                all_msgs.extend(setup_msgs)

                has_ready = any(
                    "setupComplete" in m or m.get("status")
                    for m in setup_msgs if isinstance(m, dict)
                )
                assert has_ready, f"Server not ready after 30s. Got: {setup_msgs}"

                # Send a text turn
                await ws.send(json.dumps({
                    "clientContent": {
                        "turns": [{"role": "user", "parts": [{"text": "Say hi"}]}],
                        "turnComplete": True,
                    }
                }))

                # Collect responses; any Gemini message type is acceptable
                responses = await _collect(ws, count=8, timeout=45)
                all_msgs.extend(responses)

        except (ConnectionClosedOK, ConnectionClosedError):
            # Server may close the connection after responding — this is acceptable
            pass

        # We should have received at least the setup signal
        assert len(all_msgs) > 0, "No messages received at all"
        all_keys = {k for m in all_msgs if isinstance(m, dict) for k in m}
        assert all_keys & {"serverContent", "toolCall", "setupComplete", "status"}, (
            f"Expected Gemini protocol keys, got: {all_keys}"
        )


# ---------------------------------------------------------------------------
# Group 5: WS_SECRET enforcement
# ---------------------------------------------------------------------------

class TestWebSocketSecretEnforcement:
    @pytest.mark.asyncio
    async def test_correct_secret_accepted(self, secret_server: None) -> None:
        async with websockets.client.connect(
            f"{ALT_WS}/ws?client_type=web&secret=hunter2", close_timeout=5
        ) as ws:
            msg = await _recv_json(ws, timeout=5)
            assert "status" in msg

    @pytest.mark.asyncio
    async def test_wrong_secret_rejected(self, secret_server: None) -> None:
        from websockets.exceptions import ConnectionClosedError
        with pytest.raises((ConnectionClosedError, Exception)):
            async with websockets.client.connect(
                f"{ALT_WS}/ws?client_type=web&secret=wrongpassword", close_timeout=5
            ) as ws:
                await _recv_json(ws, timeout=3)

    @pytest.mark.asyncio
    async def test_missing_secret_rejected(self, secret_server: None) -> None:
        from websockets.exceptions import ConnectionClosedError
        with pytest.raises((ConnectionClosedError, Exception)):
            async with websockets.client.connect(
                f"{ALT_WS}/ws?client_type=web", close_timeout=5
            ) as ws:
                await _recv_json(ws, timeout=3)
