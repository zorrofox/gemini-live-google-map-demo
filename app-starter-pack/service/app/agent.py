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

import os
from typing import Dict

import google
from google import genai
from google.genai.types import (
    Content,
    LiveConnectConfig,
    SpeechConfig,
    VoiceConfig,
    PrebuiltVoiceConfig,
    GenerationConfig,
    AudioTranscriptionConfig,
    ContextWindowCompressionConfig,
    SlidingWindow,
)
import vertexai
import logging
from google.cloud import logging as google_cloud_logging

from app.tools import get_tools

from app.templates import (
    SYSTEM_INSTRUCTION,
    PERSONA_MAP,
)
from app.vector_store import get_vector_store

# Constants
VERTEXAI = os.getenv("VERTEXAI", "false").lower() == "true"
VERTEXAI = True
LOCATION = "us-central1"
EMBEDDING_MODEL = "text-embedding-004"
# MODEL_ID = "gemini-2.0-flash-exp"
MODEL_ID = "gemini-live-2.5-flash-native-audio"
URLS = [
    "https://cloud.google.com/architecture/deploy-operate-generative-ai-applications"
]

logging_client = google_cloud_logging.Client()
logger = logging_client.logger(__name__)
logging.basicConfig(level=logging.INFO)

# Initialize Google Cloud clients
credentials, project_id = google.auth.default()
vertexai.init(project=project_id, location=LOCATION)

if VERTEXAI:
    logging.info(f'Agent using VertexAI project: {project_id}')
    genai_client = genai.Client(project=project_id, location=LOCATION, vertexai=True)
else:
    logging.info(f'Agent using Discovery Engine')
    genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"), http_options={"api_version": "v1alpha"})

tools_config, tool_functions = get_tools(genai_client)


def create_live_connect_config(voice_name: str, text_only: str) -> LiveConnectConfig:
    """Create a LiveConnectConfig with the specified voice."""

    persona_description = PERSONA_MAP[voice_name]

    # gemini-live-*-native-audio 模型只支持 AUDIO 输出，不支持 TEXT 模式
    response_modality = "AUDIO"

    if voice_name == "Marvin":
        voice_name = "Puck"

    voice_name = "Zephyr"

    config = LiveConnectConfig(
        response_modalities=[response_modality],
        tools=tools_config,
        system_instruction=Content(
            parts=[{"text": persona_description + '\n' + SYSTEM_INSTRUCTION}]
        ),
        speech_config=SpeechConfig(
            voice_config=VoiceConfig(
                prebuilt_voice_config=PrebuiltVoiceConfig(
                    voice_name=voice_name
                    # Aoede (F US),
                    # Charon (M US),
                    # Fenrir (M US),
                    # Kore (F US),
                    # Puck  (M US Default)
                )
            )
        ),
        input_audio_transcription=AudioTranscriptionConfig(),
        output_audio_transcription=AudioTranscriptionConfig(),
        # Enable context window compression to extend session lifetime beyond 15 minutes (audio-only)
        # or 2 minutes (audio-video) and avoid disconnections due to time limits
        context_window_compression=ContextWindowCompressionConfig(
            sliding_window=SlidingWindow(),
        ),
    )
    
    return config