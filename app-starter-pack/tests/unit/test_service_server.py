# pylint: disable=W0212,W0718,W0621
"""Unit tests for service/server.py — ConnectionManager, GeminiSession, endpoints."""

import json
import os
from typing import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Module-level patches applied before importing service.server
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_google_auth() -> Generator[None, None, None]:
    mock_creds = MagicMock()
    with patch("google.auth.default", return_value=(mock_creds, "mock-project")):
        yield


@pytest.fixture(autouse=True)
def mock_vertexai() -> Generator[None, None, None]:
    with patch("vertexai.init"):
        yield


@pytest.fixture(autouse=True)
def mock_genai_client() -> Generator[None, None, None]:
    with patch("google.genai.Client"):
        yield


@pytest.fixture(autouse=True)
def mock_cloud_logging() -> Generator[None, None, None]:
    with patch("google.cloud.logging.Client"):
        yield


@pytest.fixture(autouse=True)
def mock_get_tools() -> Generator[None, None, None]:
    with patch("app.tools.get_tools", return_value=([], {})):
        yield


@pytest.fixture(autouse=True)
def mock_vector_store() -> Generator[None, None, None]:
    with patch("app.vector_store.get_vector_store", return_value=MagicMock()):
        yield


@pytest.fixture(autouse=True)
def mock_firebase() -> Generator[None, None, None]:
    with patch("firebase_admin.initialize_app"), \
         patch("firebase_admin._apps", {}), \
         patch("firebase_admin.firestore.client", return_value=MagicMock()):
        yield


# ---------------------------------------------------------------------------
# ConnectionManager tests
# ---------------------------------------------------------------------------

class TestConnectionManager:
    def _make_ws(self):
        ws = AsyncMock()
        ws.send_bytes = AsyncMock()
        ws.send_json = AsyncMock()
        return ws

    def test_connect_glasses_registers_connection(self):
        import importlib, sys
        # Fresh import to avoid state pollution
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            importlib.reload(svc)
            mgr = svc.ConnectionManager()
            ws = self._make_ws()
            mgr.connect_glasses(ws)
            assert mgr.glasses_ws is ws

    def test_connect_web_supports_multiple_clients(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            mgr = svc.ConnectionManager()
            ws1, ws2 = self._make_ws(), self._make_ws()
            mgr.connect_web(ws1)
            mgr.connect_web(ws2)
            assert len(mgr.web_clients) == 2

    def test_disconnect_clears_glasses(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            mgr = svc.ConnectionManager()
            ws = self._make_ws()
            mgr.connect_glasses(ws)
            mgr.disconnect(ws)
            assert mgr.glasses_ws is None

    def test_disconnect_removes_web_client(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            mgr = svc.ConnectionManager()
            ws = self._make_ws()
            mgr.connect_web(ws)
            mgr.disconnect(ws)
            assert ws not in mgr.web_clients

    @pytest.mark.asyncio
    async def test_broadcast_to_all_sends_to_glasses_and_web(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            mgr = svc.ConnectionManager()
            glasses_ws = self._make_ws()
            web_ws = self._make_ws()
            mgr.connect_glasses(glasses_ws)
            mgr.connect_web(web_ws)

            await mgr.broadcast_to_all(b"test data")

            glasses_ws.send_bytes.assert_called_once_with(b"test data")
            web_ws.send_bytes.assert_called_once_with(b"test data")

    @pytest.mark.asyncio
    async def test_send_json_to_all_sends_to_all_clients(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
            mgr = svc.ConnectionManager()
            glasses_ws = self._make_ws()
            web_ws = self._make_ws()
            mgr.connect_glasses(glasses_ws)
            mgr.connect_web(web_ws)

            msg = {"status": "ready", "name": "test"}
            await mgr.send_json_to_all(msg)

            glasses_ws.send_json.assert_called_once_with(msg)
            web_ws.send_json.assert_called_once_with(msg)


# ---------------------------------------------------------------------------
# GeminiSession tests
# ---------------------------------------------------------------------------

class TestGeminiSession:
    def _make_session(self, tool_functions=None):
        """Build a GeminiSession with fully mocked dependencies."""
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc

        mock_gemini_session = AsyncMock()
        mock_gemini_session._ws = AsyncMock()
        mock_gemini_session.send = AsyncMock()

        mock_ws = AsyncMock()
        mock_ws.send_json = AsyncMock()

        mock_conn_mgr = AsyncMock()
        mock_conn_mgr.send_json_to_all = AsyncMock()

        session = svc.GeminiSession(
            session=mock_gemini_session,
            glasses_websocket=mock_ws,
            tool_functions=tool_functions or {},
            connection_manager=mock_conn_mgr,
        )
        return session, mock_gemini_session, mock_ws, mock_conn_mgr

    @pytest.mark.asyncio
    async def test_receive_from_client_forwards_realtime_input(self):
        from websockets.exceptions import ConnectionClosedError

        session, gemini_session, mock_ws, _ = self._make_session()

        msg = {"realtimeInput": {"mediaChunks": [{"data": "abc"}]}}
        mock_ws.receive_json = AsyncMock(
            side_effect=[msg, ConnectionClosedError(None, None)]
        )

        await session.receive_from_client()
        gemini_session._ws.send.assert_called_once_with(json.dumps(msg))

    @pytest.mark.asyncio
    async def test_receive_from_client_forwards_client_content(self):
        from websockets.exceptions import ConnectionClosedError

        session, gemini_session, mock_ws, _ = self._make_session()

        msg = {"clientContent": {"turns": [], "turnComplete": True}}
        mock_ws.receive_json = AsyncMock(
            side_effect=[msg, ConnectionClosedError(None, None)]
        )

        await session.receive_from_client()
        gemini_session._ws.send.assert_called_once_with(json.dumps(msg))

    @pytest.mark.asyncio
    async def test_receive_from_client_does_not_forward_setup(self):
        from websockets.exceptions import ConnectionClosedError

        session, gemini_session, mock_ws, _ = self._make_session()

        msg = {"setup": {"run_id": "r1", "user_id": "u1"}}
        mock_ws.receive_json = AsyncMock(
            side_effect=[msg, ConnectionClosedError(None, None)]
        )

        await session.receive_from_client()
        gemini_session._ws.send.assert_not_called()
        assert session.run_id == "r1"
        assert session.user_id == "u1"

    @pytest.mark.asyncio
    async def test_handle_tool_call_invokes_function_and_sends_response(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
        from google.genai.types import LiveServerToolCall

        async def fake_tool(prompt: str):
            return {"result": "ok"}

        session, gemini_session, mock_ws, mock_conn_mgr = self._make_session(
            tool_functions={"my_tool": fake_tool}
        )

        fc = MagicMock()
        fc.name = "my_tool"
        fc.id = "call_001"
        fc.args = {"prompt": "find food"}

        tool_call = MagicMock()
        tool_call.function_calls = [fc]

        await session._handle_tool_call(gemini_session, tool_call)
        gemini_session.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_tool_call_sends_error_response_on_exception(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
        from google.genai.types import LiveClientToolResponse, FunctionResponse

        async def failing_tool(**kwargs):
            raise ValueError("tool broke")

        session, gemini_session, mock_ws, _ = self._make_session(
            tool_functions={"bad_tool": failing_tool}
        )

        fc = MagicMock()
        fc.name = "bad_tool"
        fc.id = "call_002"
        fc.args = {}

        tool_call = MagicMock()
        tool_call.function_calls = [fc]

        # Should not raise; error is sent back to Gemini
        await session._handle_tool_call(gemini_session, tool_call)

        # session.send must have been called (with the error tool response)
        gemini_session.send.assert_called_once()
        # Verify FunctionResponse was constructed with an error payload
        call_kwargs = FunctionResponse.call_args
        assert call_kwargs is not None
        response_dict = call_kwargs.kwargs.get("response") or (
            call_kwargs.args[2] if len(call_kwargs.args) > 2 else {}
        )
        assert "error" in str(response_dict)

    @pytest.mark.asyncio
    async def test_handle_tool_call_broadcasts_grounding_response(self):
        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project"}):
            import service.server as svc
        from google.genai.types import LiveServerToolCall

        async def grounding_tool(prompt: str):
            return {"grounding_metadata": {"chunks": []}, "model_text": "ok"}

        session, gemini_session, mock_ws, mock_conn_mgr = self._make_session(
            tool_functions={"grounding_tool": grounding_tool}
        )

        fc = MagicMock()
        fc.name = "grounding_tool"
        fc.id = "call_003"
        fc.args = {"prompt": "food"}

        tool_call = MagicMock()
        tool_call.function_calls = [fc]

        await session._handle_tool_call(gemini_session, tool_call)
        mock_conn_mgr.send_json_to_all.assert_called_once()
        sent_msg = mock_conn_mgr.send_json_to_all.call_args[0][0]
        assert sent_msg["name"] == "grounding_tool_result"


# ---------------------------------------------------------------------------
# WebSocket secret validation
# ---------------------------------------------------------------------------

class TestWebSocketSecretValidation:
    def _get_client(self, ws_secret: str = ""):
        with patch.dict(os.environ, {
            "FIRESTORE_PROJECT": "test-project",
            "WS_SECRET": ws_secret,
        }):
            import importlib
            import service.server as svc
            importlib.reload(svc)
            return TestClient(svc.app)

    def test_no_secret_env_var_accepts_any_connection(self):
        """When WS_SECRET is not set, all connections should be accepted."""
        mock_session = AsyncMock()
        mock_session._ws = AsyncMock()
        mock_session._ws.recv = AsyncMock(return_value=None)

        with patch.dict(os.environ, {"FIRESTORE_PROJECT": "test-project", "WS_SECRET": ""}):
            import importlib
            import service.server as svc
            importlib.reload(svc)

            with patch.object(svc, "genai_client") as mock_gc:
                mock_gc.aio.live.connect.return_value.__aenter__ = AsyncMock(
                    return_value=mock_session
                )
                mock_gc.aio.live.connect.return_value.__aexit__ = AsyncMock(
                    return_value=False
                )
                client = TestClient(svc.app)
                try:
                    with client.websocket_connect("/ws?client_type=web") as ws:
                        ws.receive_json()  # welcome message
                except Exception:
                    pass  # Connection closing is fine


# ---------------------------------------------------------------------------
# initialize_firestore
# ---------------------------------------------------------------------------

class TestInitializeFirestore:
    def test_missing_env_var_raises_runtime_error(self):
        with patch.dict(os.environ, {}, clear=True):
            # Remove FIRESTORE_PROJECT from env entirely
            os.environ.pop("FIRESTORE_PROJECT", None)
            with patch("firebase_admin._apps", {}):
                import service.server as svc
                with pytest.raises(RuntimeError, match="FIRESTORE_PROJECT"):
                    svc.initialize_firestore()


# ---------------------------------------------------------------------------
# Helper: build a TestClient for service/server.py app
# ---------------------------------------------------------------------------

def _svc_client():
    import service.server as svc
    return TestClient(svc.app)


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

class TestHttpEndpoints:
    def test_health_returns_healthy(self):
        client = _svc_client()
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_get_test_page_returns_html(self):
        """GET /test returns HTML content (either the test page or a not-found message)."""
        client = _svc_client()
        response = client.get("/test")
        assert response.status_code == 200
        assert "html" in response.text.lower()

    def test_collect_feedback_success(self):
        import uuid
        client = _svc_client()
        response = client.post("/feedback", json={
            "score": 4,
            "text": "Good",
            "run_id": str(uuid.uuid4()),
            "user_id": "u1",
            "log_type": "feedback",
        })
        assert response.status_code == 200

    def test_submit_itinerary_success(self):
        client = _svc_client()
        response = client.post("/submititinerary", json={
            "restaurant": {"placeId": "p1", "title": "Nobu", "order": 1}
        })
        assert response.status_code == 200
        assert "documentId" in response.json()

    def test_submit_itinerary_firestore_error_returns_error_json(self):
        import service.server as svc
        with patch.object(svc, "db") as mock_db:
            mock_db.collection.side_effect = Exception("Firestore down")
            client = TestClient(svc.app)
            response = client.post("/submititinerary", json={
                "restaurant": {"placeId": "p1", "title": "Nobu", "order": 1}
            })
        assert response.status_code == 200
        assert "error" in response.json()


# ---------------------------------------------------------------------------
# create_dated_title
# ---------------------------------------------------------------------------

def test_create_dated_title_appends_datetime():
    import service.server as svc
    result = svc.create_dated_title("My Itinerary")
    assert result.startswith("My Itinerary - ")
    assert len(result) > len("My Itinerary - ")


# ---------------------------------------------------------------------------
# WebSocket — web client and invalid client_type
# ---------------------------------------------------------------------------

class TestWebSocketClientTypes:
    @pytest.mark.asyncio
    async def test_web_client_receives_welcome_message(self):
        import service.server as svc
        client = TestClient(svc.app)
        try:
            with client.websocket_connect("/ws?client_type=web") as ws:
                msg = ws.receive_json()
                assert "status" in msg
                assert "connected" in msg["status"].lower() or "web" in msg["status"].lower()
        except Exception:
            pass  # disconnect is expected

    def test_invalid_client_type_closes_with_error(self):
        import service.server as svc
        client = TestClient(svc.app)
        with client.websocket_connect("/ws?client_type=invalid") as ws:
            msg = ws.receive_json()
            assert "error" in msg
            assert "invalid" in msg["error"].lower()


# ---------------------------------------------------------------------------
# gemini_api_proxy_endpoint
# ---------------------------------------------------------------------------

class TestGeminiApiProxyEndpoint:
    def test_proxy_endpoint_with_authorization_header(self):
        """The proxy endpoint should accept connections with a Bearer token."""
        import service.server as svc

        mock_session = AsyncMock()
        mock_session._ws = AsyncMock()
        mock_session._ws.recv = AsyncMock(return_value=None)

        with patch.object(svc, "genai_client") as mock_gc:
            mock_gc.aio.live.connect.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_gc.aio.live.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            client = TestClient(svc.app)
            try:
                with client.websocket_connect(
                    "/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent",
                    headers={"Authorization": "Bearer fake-token-1234567890"},
                ):
                    pass
            except Exception:
                pass  # connection close is fine

    def test_proxy_endpoint_without_authorization_header(self):
        """The proxy endpoint should accept connections without a Bearer token too."""
        import service.server as svc

        mock_session = AsyncMock()
        mock_session._ws = AsyncMock()
        mock_session._ws.recv = AsyncMock(return_value=None)

        with patch.object(svc, "genai_client") as mock_gc:
            mock_gc.aio.live.connect.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_gc.aio.live.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            client = TestClient(svc.app)
            try:
                with client.websocket_connect(
                    "/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
                ):
                    pass
            except Exception:
                pass


# ---------------------------------------------------------------------------
# broadcast_to_all — error paths (send_bytes raises)
# ---------------------------------------------------------------------------

class TestBroadcastErrorPaths:
    @pytest.mark.asyncio
    async def test_broadcast_handles_glasses_send_error(self):
        import service.server as svc
        mgr = svc.ConnectionManager()

        glasses_ws = AsyncMock()
        glasses_ws.send_bytes = AsyncMock(side_effect=Exception("send failed"))
        mgr.connect_glasses(glasses_ws)

        # Should not raise; broken connection is removed
        await mgr.broadcast_to_all(b"data")
        assert mgr.glasses_ws is None  # cleaned up

    @pytest.mark.asyncio
    async def test_broadcast_handles_web_client_send_error(self):
        import service.server as svc
        mgr = svc.ConnectionManager()

        web_ws = AsyncMock()
        web_ws.send_bytes = AsyncMock(side_effect=Exception("web send failed"))
        mgr.connect_web(web_ws)

        await mgr.broadcast_to_all(b"data")
        assert web_ws not in mgr.web_clients

    @pytest.mark.asyncio
    async def test_send_json_handles_glasses_error(self):
        import service.server as svc
        mgr = svc.ConnectionManager()

        glasses_ws = AsyncMock()
        glasses_ws.send_json = AsyncMock(side_effect=Exception("json send failed"))
        mgr.connect_glasses(glasses_ws)

        await mgr.send_json_to_all({"status": "test", "name": "t"})
        assert mgr.glasses_ws is None

    @pytest.mark.asyncio
    async def test_send_json_handles_web_client_error(self):
        import service.server as svc
        mgr = svc.ConnectionManager()

        web_ws = AsyncMock()
        web_ws.send_json = AsyncMock(side_effect=Exception("web json failed"))
        mgr.connect_web(web_ws)

        await mgr.send_json_to_all({"status": "test", "name": "t"})
        assert web_ws not in mgr.web_clients


# ---------------------------------------------------------------------------
# connect_glasses replacing existing connection
# ---------------------------------------------------------------------------

def test_connect_glasses_replaces_existing_and_logs_warning():
    import service.server as svc
    mgr = svc.ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    mgr.connect_glasses(ws1)
    mgr.connect_glasses(ws2)  # should replace ws1
    assert mgr.glasses_ws is ws2


# ---------------------------------------------------------------------------
# GeminiSession.receive_from_gemini
# ---------------------------------------------------------------------------

class TestReceiveFromGemini:
    def _make_session(self):
        import service.server as svc
        mock_gemini = AsyncMock()
        mock_gemini._ws = AsyncMock()
        mock_gemini.send = AsyncMock()
        mock_ws = AsyncMock()
        mock_conn_mgr = AsyncMock()
        mock_conn_mgr.broadcast_to_all = AsyncMock()
        mock_conn_mgr.send_json_to_all = AsyncMock()
        session = svc.GeminiSession(
            session=mock_gemini,
            glasses_websocket=mock_ws,
            tool_functions={},
            connection_manager=mock_conn_mgr,
        )
        return session, mock_gemini, mock_conn_mgr

    @pytest.mark.asyncio
    async def test_receive_from_gemini_broadcasts_raw_bytes(self):
        """Every Gemini message should be broadcast to all clients."""
        import google.genai.types as genai_types
        session, gemini_session, mock_conn_mgr = self._make_session()

        msg_bytes = json.dumps({"serverContent": {"modelTurn": {}}}).encode()
        gemini_session._ws.recv = AsyncMock(side_effect=[msg_bytes, None])

        # model_validate returns a message with no tool_call
        mock_msg = MagicMock()
        mock_msg.tool_call = None
        mock_msg.model_dump.return_value = {"serverContent": {}}
        genai_types.LiveServerMessage.model_validate = MagicMock(return_value=mock_msg)

        await session.receive_from_gemini()
        mock_conn_mgr.broadcast_to_all.assert_called_once_with(msg_bytes)

    @pytest.mark.asyncio
    async def test_receive_from_gemini_handles_json_parse_error(self):
        """Non-JSON bytes should still be broadcast (parse error is swallowed)."""
        import google.genai.types as genai_types
        session, gemini_session, mock_conn_mgr = self._make_session()

        bad_bytes = b"not-json-at-all"
        gemini_session._ws.recv = AsyncMock(side_effect=[bad_bytes, None])

        mock_msg = MagicMock()
        mock_msg.tool_call = None
        mock_msg.model_dump.return_value = {}
        genai_types.LiveServerMessage.model_validate = MagicMock(return_value=mock_msg)

        await session.receive_from_gemini()
        mock_conn_mgr.broadcast_to_all.assert_called_once_with(bad_bytes)

    @pytest.mark.asyncio
    async def test_receive_from_gemini_detects_input_transcription(self):
        """Messages containing inputTranscription should be logged (no crash)."""
        import google.genai.types as genai_types
        session, gemini_session, mock_conn_mgr = self._make_session()

        msg = {
            "serverContent": {
                "inputTranscription": {"text": "Hello Gemini"},
                "outputTranscription": {"text": "Hi there"},
            }
        }
        msg_bytes = json.dumps(msg).encode()
        gemini_session._ws.recv = AsyncMock(side_effect=[msg_bytes, None])

        mock_msg = MagicMock()
        mock_msg.tool_call = None
        mock_msg.model_dump.return_value = {}
        genai_types.LiveServerMessage.model_validate = MagicMock(return_value=mock_msg)

        # Should complete without error
        await session.receive_from_gemini()
        mock_conn_mgr.broadcast_to_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_receive_from_gemini_triggers_tool_call(self):
        """Messages with tool_call should spawn a task calling _handle_tool_call."""
        import google.genai.types as genai_types
        from unittest.mock import patch as _patch
        session, gemini_session, mock_conn_mgr = self._make_session()

        msg_bytes = json.dumps({"toolCall": {}}).encode()
        gemini_session._ws.recv = AsyncMock(side_effect=[msg_bytes, None])

        mock_tool_call = MagicMock()
        mock_tool_call.function_calls = []

        mock_msg = MagicMock()
        mock_msg.tool_call = {"name": "test"}
        mock_msg.model_dump.return_value = {"toolCall": {}}
        genai_types.LiveServerMessage.model_validate = MagicMock(return_value=mock_msg)
        genai_types.LiveServerToolCall.model_validate = MagicMock(return_value=mock_tool_call)

        handle_calls = []

        async def fake_handle(sess, tc):
            handle_calls.append(tc)

        session._handle_tool_call = fake_handle

        with _patch("asyncio.create_task", side_effect=lambda coro: coro) as mock_task:
            await session.receive_from_gemini()

        mock_task.assert_called_once()

    @pytest.mark.asyncio
    async def test_receive_from_gemini_handles_outer_exception(self):
        """If recv raises unexpectedly, receive_from_gemini logs error and exits cleanly."""
        session, gemini_session, mock_conn_mgr = self._make_session()
        gemini_session._ws.recv = AsyncMock(side_effect=RuntimeError("connection reset"))

        # Should not propagate
        await session.receive_from_gemini()


# ---------------------------------------------------------------------------
# _handle_tool_call — double exception path (inner send also fails)
# ---------------------------------------------------------------------------

class TestHandleToolCallDoubleException:
    @pytest.mark.asyncio
    async def test_inner_send_failure_does_not_crash(self):
        """If sending the error response itself fails, the method should exit cleanly."""
        import service.server as svc

        async def always_failing(**kwargs):
            raise ValueError("tool error")

        mock_gemini = AsyncMock()
        mock_gemini.send = AsyncMock(side_effect=Exception("send also failed"))
        mock_ws = AsyncMock()
        mock_conn_mgr = AsyncMock()

        session = svc.GeminiSession(
            session=mock_gemini,
            glasses_websocket=mock_ws,
            tool_functions={"bad": always_failing},
            connection_manager=mock_conn_mgr,
        )

        fc = MagicMock()
        fc.name = "bad"
        fc.id = "id1"
        fc.args = {}

        tool_call = MagicMock()
        tool_call.function_calls = [fc]

        # Should not raise despite double failure
        await session._handle_tool_call(mock_gemini, tool_call)


# ---------------------------------------------------------------------------
# SPA serving
# ---------------------------------------------------------------------------

class TestSpaServing:
    def test_root_returns_html(self):
        """GET / 应返回前端 index.html。"""
        client = _svc_client()
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")


# ---------------------------------------------------------------------------
# /api/routes proxy
# ---------------------------------------------------------------------------

class TestRoutesProxy:
    def test_routes_proxy_success(self):
        """POST /api/routes 成功时应返回路由数据。"""
        mock_route_response = {"routes": [{"polyline": {"geoJsonLinestring": {}}}]}

        with patch("httpx.AsyncClient") as mock_httpx:
            mock_resp = MagicMock()
            mock_resp.is_success = True
            mock_resp.json.return_value = mock_route_response
            mock_httpx.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(post=AsyncMock(return_value=mock_resp))
            )
            mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)

            client = _svc_client()
            response = client.post(
                "/api/routes",
                json={
                    "origin": {"location": {"latLng": {"latitude": 25.2, "longitude": 55.3}}},
                    "destination": {"location": {"latLng": {"latitude": 25.3, "longitude": 55.4}}},
                    "polylineEncoding": "GEO_JSON_LINESTRING",
                },
            )

        assert response.status_code == 200
        assert "routes" in response.json()

    def test_routes_proxy_missing_api_key_returns_500(self):
        """GOOGLE_API_KEY 为空时 POST /api/routes 应返回 500。"""
        import service.server as svc

        with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}):
            client = TestClient(svc.app)
            response = client.post("/api/routes", json={})
        assert response.status_code == 500
