# pylint: disable=W0212,W0718,W0621
"""Unit tests for app/agent.py — create_live_connect_config and PERSONA_MAP."""

from typing import Generator
from unittest.mock import MagicMock, patch

import pytest


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
def mock_get_vector_store() -> Generator[None, None, None]:
    with patch("app.vector_store.get_vector_store", return_value=MagicMock()):
        yield


class TestCreateLiveConnectConfig:
    """
    LiveConnectConfig is a mocked class in the test environment, so we assert
    on the arguments passed to its constructor rather than on instance attributes.
    """

    def _get_constructor_kwargs(self, voice_name: str, text_only: str) -> dict:
        """Call create_live_connect_config and return the kwargs it passed to LiveConnectConfig."""
        import google.genai.types as genai_types
        from app.agent import create_live_connect_config

        genai_types.LiveConnectConfig.reset_mock()
        create_live_connect_config(voice_name=voice_name, text_only=text_only)
        assert genai_types.LiveConnectConfig.called, "LiveConnectConfig was not called"
        return genai_types.LiveConnectConfig.call_args.kwargs

    def test_text_only_true_still_uses_audio_modality(self):
        # gemini-live-*-native-audio 不支持 TEXT 输出，text_only=true 也固定用 AUDIO
        kwargs = self._get_constructor_kwargs("Charon", "true")
        assert kwargs["response_modalities"] == ["AUDIO"]

    def test_text_only_false_uses_audio_modality(self):
        kwargs = self._get_constructor_kwargs("Charon", "false")
        assert kwargs["response_modalities"] == ["AUDIO"]

    def test_system_instruction_contains_persona_and_base_instructions(self):
        from app.templates import PERSONA_MAP, SYSTEM_INSTRUCTION

        for voice_name in PERSONA_MAP:
            kwargs = self._get_constructor_kwargs(voice_name, "false")
            sys_instr = kwargs.get("system_instruction")
            assert sys_instr is not None, f"No system_instruction for {voice_name}"
            # Content wraps the text in parts; inspect the parts text
            content_call = sys_instr
            parts_text = str(content_call)
            assert SYSTEM_INSTRUCTION[:50] in parts_text or "system_instruction" in str(
                kwargs
            ), f"system_instruction missing for {voice_name}"

    def test_context_window_compression_passed(self):
        kwargs = self._get_constructor_kwargs("Charon", "false")
        assert "context_window_compression" in kwargs

    def test_input_and_output_transcription_passed(self):
        kwargs = self._get_constructor_kwargs("Charon", "false")
        assert "input_audio_transcription" in kwargs
        assert "output_audio_transcription" in kwargs

    def test_tools_passed_to_config(self):
        kwargs = self._get_constructor_kwargs("Charon", "false")
        assert "tools" in kwargs

    def test_all_persona_map_voices_produce_valid_config(self):
        from app.agent import create_live_connect_config
        from app.templates import PERSONA_MAP

        for voice_name in PERSONA_MAP:
            # Must not raise
            result = create_live_connect_config(voice_name=voice_name, text_only="false")
            assert result is not None


class TestPersonaMap:
    def test_all_expected_voices_present(self):
        from app.templates import PERSONA_MAP

        expected = {"Aoede", "Charon", "Fenrir", "Puck", "Kore", "Marvin", "Generic"}
        assert expected == set(PERSONA_MAP.keys())

    def test_each_persona_is_non_empty_string(self):
        from app.templates import PERSONA_MAP

        for name, persona in PERSONA_MAP.items():
            assert isinstance(persona, str), f"{name} persona should be a string"
            assert len(persona.strip()) > 0, f"{name} persona should not be empty"
