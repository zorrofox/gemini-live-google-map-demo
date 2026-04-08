# pylint: disable=W0212,W0718,W0621
"""Unit tests for app/tools.py — all external HTTP calls are mocked."""

import json
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _make_api_response(model_text: str, chunks: list) -> Dict[str, Any]:
    """Build a minimal Generative Language API response dict."""
    return {
        "candidates": [
            {
                "content": {"parts": [{"text": model_text}]},
                "groundingMetadata": {"groundingChunks": chunks},
            }
        ]
    }


def _make_chunk(title: str, place_id: str) -> Dict[str, Any]:
    return {"maps": {"title": title, "placeId": place_id}}


# ---------------------------------------------------------------------------
# Pure function tests — no mocking needed
# ---------------------------------------------------------------------------


class TestConstructVertexMapsGroundingPayload:
    def test_basic_structure(self):
        from app.tools import construct_vertex_maps_grounding_payload

        payload = construct_vertex_maps_grounding_payload(
            model_id="gemini-2.5-flash",
            system_instructions="sys",
            prompt="find restaurants",
            api_key="key123",
        )

        assert payload["contents"][0]["parts"][0]["text"] == "find restaurants"
        assert payload["system_instruction"]["parts"][0]["text"] == "sys"
        assert payload["tools"][0]["google_maps"]["enable_widget"] is True

    def test_enable_widget_false(self):
        from app.tools import construct_vertex_maps_grounding_payload

        payload = construct_vertex_maps_grounding_payload(
            model_id="m", system_instructions="s", prompt="p", api_key="k",
            enable_widget=False,
        )
        assert payload["tools"][0]["google_maps"]["enable_widget"] is False

    def test_thinking_budget_zero(self):
        from app.tools import construct_vertex_maps_grounding_payload

        payload = construct_vertex_maps_grounding_payload(
            model_id="m", system_instructions="s", prompt="p", api_key="k"
        )
        assert payload["generationConfig"]["thinkingConfig"]["thinkingBudget"] == 0


class TestGetModelText:
    def test_single_part(self):
        from app.tools import get_model_text

        response = _make_api_response("Hello world", [])
        assert get_model_text(response) == "Hello world"

    def test_multiple_parts_joined(self):
        from app.tools import get_model_text

        response = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "Part one"}, {"text": "Part two"}]
                    },
                    "groundingMetadata": {"groundingChunks": []},
                }
            ]
        }
        result = get_model_text(response)
        assert result == "Part one\n\nPart two"


class TestGetGroundingMetadata:
    def test_filters_to_mentioned_places(self):
        from app.tools import get_grounding_metadata

        model_text = json.dumps(
            {"Nobu Dubai": {"text": "desc", "summary": "great sushi"}}
        )
        chunks = [
            _make_chunk("Nobu Dubai", "place_001"),
            _make_chunk("Zuma Dubai", "place_002"),
        ]
        response = _make_api_response(model_text, chunks)
        result = get_grounding_metadata(response)

        assert len(result) == 1
        assert result[0]["sourceMetadata"]["title"] == "Nobu Dubai"
        assert result[0]["sourceMetadata"]["document_id"] == "place_001"

    def test_max_three_results(self):
        from app.tools import get_grounding_metadata

        places = {f"Place {i}": {"text": "x", "summary": "y"} for i in range(5)}
        model_text = json.dumps(places)
        chunks = [_make_chunk(f"Place {i}", f"id_{i}") for i in range(5)]
        response = _make_api_response(model_text, chunks)
        result = get_grounding_metadata(response)

        assert len(result) <= 3

    def test_fallback_on_invalid_json(self):
        from app.tools import get_grounding_metadata

        chunks = [_make_chunk("Place A", "id_a"), _make_chunk("Place B", "id_b")]
        response = _make_api_response("this is not json", chunks)
        result = get_grounding_metadata(response)

        # Falls back to all chunks (capped at 3)
        assert len(result) == 2

    def test_markdown_fence_stripped(self):
        from app.tools import get_grounding_metadata

        model_text = '```json\n{"Nobu Dubai": {"text": "d", "summary": "s"}}\n```'
        chunks = [_make_chunk("Nobu Dubai", "place_001")]
        response = _make_api_response(model_text, chunks)
        result = get_grounding_metadata(response)

        assert len(result) == 1
        assert result[0]["sourceMetadata"]["title"] == "Nobu Dubai"


# ---------------------------------------------------------------------------
# Async tool wrappers — trivial delegation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hide_photos_returns_status():
    from app.tools import hide_photos

    result = await hide_photos()
    assert result == {"status": "Photos have been hidden successfully"}


@pytest.mark.asyncio
async def test_submit_itinerary_returns_status():
    from app.tools import submit_itinerary

    result = await submit_itinerary("some itinerary text")
    assert result == {"status": "Itinerary submitted successfully"}


# ---------------------------------------------------------------------------
# maps_grounding — mock aiohttp
# ---------------------------------------------------------------------------

def _mock_aiohttp_response(status: int, json_body: dict):
    """Return a context-manager-compatible mock for aiohttp response."""
    mock_resp = AsyncMock()
    mock_resp.status = status
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json = AsyncMock(return_value=json_body)
    mock_resp.text = AsyncMock(return_value=json.dumps(json_body))

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=mock_resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _mock_aiohttp_session(response_cm):
    session_cm = AsyncMock()
    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=response_cm)
    session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    session_cm.__aexit__ = AsyncMock(return_value=False)
    return session_cm


@pytest.mark.asyncio
async def test_maps_grounding_success():
    from app.tools import maps_grounding

    model_text = json.dumps({"Nobu Dubai": {"text": "desc", "summary": "great"}})
    api_response = _make_api_response(
        model_text, [_make_chunk("Nobu Dubai", "place_001")]
    )
    resp_cm = _mock_aiohttp_response(200, api_response)

    with patch("aiohttp.ClientSession", return_value=_mock_aiohttp_session(resp_cm)):
        result = await maps_grounding("restaurants in Dubai", "system instructions")

    assert "model_text" in result
    assert "grounding_metadata" in result
    assert len(result["grounding_metadata"]["supportChunks"]) == 1


@pytest.mark.asyncio
async def test_maps_grounding_http_error_raises():
    from app.tools import maps_grounding

    resp_cm = _mock_aiohttp_response(500, {"error": "internal"})

    with patch("aiohttp.ClientSession", return_value=_mock_aiohttp_session(resp_cm)):
        with pytest.raises(Exception, match="API request failed"):
            await maps_grounding("restaurants", "instructions")


# ---------------------------------------------------------------------------
# High-level tool functions — mock maps_grounding
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_restaurant_suggestions_delegates():
    from app import tools

    mock_result = {"model_text": "suggestions", "grounding_metadata": {"supportChunks": []}}
    with patch.object(tools, "maps_grounding", new=AsyncMock(return_value=mock_result)) as mock_mg:
        result = await tools.get_restaurant_suggestions("Italian near Dubai Mall")

    mock_mg.assert_called_once()
    call_args = mock_mg.call_args
    # system instructions should be restaurant suggestion instructions
    from app.templates import RESTAURANT_SUGGESTION_SYSTEM_INSTRUCTIONS
    assert call_args[0][1] == RESTAURANT_SUGGESTION_SYSTEM_INSTRUCTIONS
    assert result == mock_result


@pytest.mark.asyncio
async def test_get_place_information_delegates():
    from app import tools

    mock_result = {"model_text": "details", "grounding_metadata": {"supportChunks": []}}
    with patch.object(tools, "maps_grounding", new=AsyncMock(return_value=mock_result)):
        result = await tools.get_place_information("Nobu Dubai")

    assert result == mock_result


# ---------------------------------------------------------------------------
# get_weather — mock httpx
# ---------------------------------------------------------------------------

def _weather_payload():
    return {
        "isDaytime": True,
        "weatherCondition": {"description": {"text": "Clear"}},
        "temperature": {"degrees": 30},
        "relativeHumidity": 50,
        "wind": {
            "speed": {"value": 10},
            "direction": {"cardinal": "NE"},
        },
        "precipitation": {"probability": {"percent": 5}},
        "uvIndex": 8,
    }


@pytest.mark.asyncio
async def test_get_weather_success():
    from app.tools import get_weather

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value=_weather_payload())

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await get_weather()

    assert "weather" in result
    assert "Dubai" in result["weather"]
    assert "30" in result["weather"]


@pytest.mark.asyncio
async def test_get_weather_failure_returns_error_string():
    from app.tools import get_weather

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=Exception("network error"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await get_weather()

    assert "weather" in result
    assert "Unable to retrieve" in result["weather"]
    assert "network error" in result["weather"]
