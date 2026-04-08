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
# pylint: disable=W0212,W0718,W0621

"""
Service for Glasses Integration - WebSocket API with Full Business Logic

This service provides a WebSocket interface for smart glasses integration.
It handles:
- Audio input from glasses
- Communication with Gemini API
- Tool execution (Maps, Weather, etc.)
- Complete business logic processing
- Returning full Gemini responses to glasses
"""

import firebase_admin
from firebase_admin import firestore, credentials, initialize_app
import asyncio
import json
import logging
import os
import pathlib
import datetime
from typing import Any, Callable, Dict, Literal, Optional, Union

from app.agent import MODEL_ID, genai_client, create_live_connect_config, tool_functions
import backoff
import httpx

from fastapi import FastAPI, WebSocket, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
from pydantic import BaseModel, ValidationError
from websockets.exceptions import ConnectionClosedError

from google.cloud import logging as google_cloud_logging
from google.genai import types, live
from google.genai.types import LiveServerToolCall

app = FastAPI(
    title="Restaurant Guide Service",
    description="WebSocket service for smart glasses - Full Gemini integration with business logic",
    version="1.0.0"
)

# 服务前端 SPA（dist 由 npm run build 生成）
_BASE = pathlib.Path(__file__).parent
templates = Jinja2Templates(directory=str(_BASE / "frontend" / "dist"))
app.mount('/assets', StaticFiles(directory=str(_BASE / "frontend" / "dist" / "assets"), check_dir=False), 'assets')

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Shared secret for WebSocket connections (optional; set WS_SECRET env var to enforce)
_WS_SECRET = os.getenv("WS_SECRET", "")

logging_client = google_cloud_logging.Client()
logging_client.setup_logging()
logger = logging_client.logger(__name__)
logging.basicConfig(level=logging.INFO)

# Global connection manager
class ConnectionManager:
    """Manages WebSocket connections for glasses and web clients."""
    
    def __init__(self):
        self.glasses_ws: Optional[WebSocket] = None
        self.web_clients: list[WebSocket] = []
    
    def connect_glasses(self, websocket: WebSocket):
        """Register glasses connection (only one allowed)."""
        if self.glasses_ws is not None:
            logging.warning("Glasses already connected, replacing old connection")
        self.glasses_ws = websocket
        logging.info(f"Glasses connected. Total connections: glasses=1, web={len(self.web_clients)}")
    
    def connect_web(self, websocket: WebSocket):
        """Register web client connection (multiple allowed)."""
        self.web_clients.append(websocket)
        logging.info(f"Web client connected. Total connections: glasses={1 if self.glasses_ws else 0}, web={len(self.web_clients)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove a connection."""
        if self.glasses_ws == websocket:
            self.glasses_ws = None
            logging.info("Glasses disconnected")
        elif websocket in self.web_clients:
            self.web_clients.remove(websocket)
            logging.info(f"Web client disconnected. Remaining web clients: {len(self.web_clients)}")
    
    async def broadcast_to_all(self, message: bytes):
        """Broadcast message to all connected clients (glasses + web).
        
        Sends as BINARY (bytes) because the frontend multimodal-live-client.ts expects:
        - Blob for Gemini messages (serverContent, toolCall, etc.)
        - String for custom server messages (status, groundingResponse)
        """
        disconnected = []
        
        # Send to glasses as bytes (binary WebSocket frame, will be received as Blob in browser)
        if self.glasses_ws:
            try:
                await self.glasses_ws.send_bytes(message)
                logging.debug(f"✉️  Sent bytes to glasses: {len(message)} bytes")
            except Exception as e:
                logging.error(f"Error sending to glasses: {e}")
                disconnected.append(self.glasses_ws)
        
        # Send to all web clients as bytes (binary WebSocket frame)
        for web_ws in self.web_clients:
            try:
                await web_ws.send_bytes(message)
                logging.debug(f"✉️  Sent bytes to web client: {len(message)} bytes")
            except Exception as e:
                logging.error(f"Error sending to web client: {e}")
                disconnected.append(web_ws)
        
        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)
    
    async def send_json_to_all(self, data: dict):
        """Send JSON message to all connected clients."""
        disconnected = []
        msg_name = data.get('name', 'unknown')
        
        # Send to glasses
        if self.glasses_ws:
            try:
                await self.glasses_ws.send_json(data)
                logging.info(f"📤 Sent JSON ({msg_name}) to glasses")
            except Exception as e:
                logging.error(f"❌ Error sending JSON to glasses: {e}")
                disconnected.append(self.glasses_ws)
        
        # Send to all web clients
        for i, web_ws in enumerate(self.web_clients):
            try:
                await web_ws.send_json(data)
                logging.info(f"📤 Sent JSON ({msg_name}) to web client #{i+1}")
            except Exception as e:
                logging.error(f"❌ Error sending JSON to web client #{i+1}: {e}")
                disconnected.append(web_ws)
        
        logging.info(f"📊 JSON message ({msg_name}) sent to {1 if self.glasses_ws else 0} glasses + {len(self.web_clients)} web clients")
        
        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)

# Global connection manager instance
connection_manager = ConnectionManager()


class GeminiSession:

    """Manages bidirectional communication between client and Gemini with full business logic."""

    def __init__(
        self,
        session: live.AsyncSession,
        glasses_websocket: WebSocket,
        tool_functions: Dict[str, Callable],
        connection_manager: ConnectionManager,
    ) -> None:
        """Initialize the Gemini session.

        Args:
            session: The Gemini session
            glasses_websocket: The glasses websocket connection (audio input source)
            tool_functions: Dictionary of available tool functions
            connection_manager: Manager for broadcasting to all clients
        """
        self.session = session
        self.glasses_websocket = glasses_websocket
        self.connection_manager = connection_manager
        self.run_id = "n/a"
        self.user_id = "n/a"
        self.tool_functions = tool_functions

    async def receive_from_client(self) -> None:
        """Listen for and process messages from the glasses (audio input source).
        
        ONLY receives from glasses, not from web clients.
        Receives audio/text input and forwards to Gemini.
        """
        while True:
            try:
                data = await self.glasses_websocket.receive_json()
                logging.info(f"📥 Received from glasses: {json.dumps(data)[:200]}")  # 调试日志
                
                if isinstance(data, dict) and (
                    "realtimeInput" in data or "clientContent" in data
                ):
                    logging.info(f"✅ Forwarding to Gemini: {'realtimeInput' if 'realtimeInput' in data else 'clientContent'}")  # 调试日志
                    await self.session._ws.send(json.dumps(data))
                    logging.info(f"✅ Successfully sent to Gemini")  # 调试日志
                elif "setup" in data:
                    # Extract setup info from client but DO NOT forward to Gemini
                    # (Gemini already received our setup during connection establishment)
                    setup = data["setup"]
                    self.run_id = setup.get("run_id", f"glasses_{id(self)}")
                    self.user_id = setup.get("user_id", "glasses_user")
                    logging.info(f'✅ Received setup from client: {json.dumps(setup)[:200]}')
                    logging.info(f'ℹ️  Setup NOT forwarded to Gemini (already configured during connection)')
                else:
                    logging.warning(f"Received unexpected input from glasses: {data}")
            except ConnectionClosedError as e:
                logging.warning(f"Glasses {self.user_id} closed connection: {e}")
                self.connection_manager.disconnect(self.glasses_websocket)
                break
            except Exception as e:
                logging.error(f"Error receiving from glasses {self.user_id}: {str(e)}")
                import traceback
                logging.error(f"Traceback: {traceback.format_exc()}")  #完整错误堆栈
                break

    def _get_func(self, action_label: str) -> Optional[Callable]:
        """Get the tool function for a given action label."""
        return None if action_label == "" else self.tool_functions.get(action_label)

    async def _handle_tool_call(
        self, session: live.AsyncSession, tool_call: LiveServerToolCall
    ) -> None:
        """Process tool calls from Gemini - Execute tools on server side.
        
        IMPORTANT: Tools are executed by the service, not by the client.
        The client (glasses) only receives the final result.
        """
        for fc in tool_call.function_calls:
            try:
                logging.info(f"🔧 Executing tool function: {fc.name} with args: {fc.args}")
                
                # Execute tool on server side
                response = await self._get_func(fc.name)(**fc.args)
                logging.info(f"✅ Tool execution response keys: {list(response.keys())}")
                
                # If response has grounding metadata, broadcast to ALL clients (glasses + web)
                if 'grounding_metadata' in response:
                    grounding_msg = {
                        "groundingResponse": response,
                        "name": f"{fc.name}_result",
                    }
                    logging.info(f"🗺️  Sending groundingResponse to all clients: name={fc.name}_result, metadata_size={len(str(response.get('grounding_metadata', {})))}")
                    await self.connection_manager.send_json_to_all(grounding_msg)
                    logging.info(f"✅ groundingResponse sent successfully")
                else:
                    logging.warning(f"⚠️  Tool response has NO grounding_metadata! Keys: {list(response.keys())}")

                # Send tool response back to Gemini
                tool_response = types.LiveClientToolResponse(
                    function_responses=[
                        types.FunctionResponse(
                            name=fc.name, id=fc.id, response=response
                        )
                    ]
                )
                logging.info(f"Tool response: {tool_response}")
                await session.send(input=tool_response)
                
            except Exception as e:
                logging.error(f"Error processing tool call: {str(e)}")
                # Send error response to let model continue
                try:
                    error_response = types.LiveClientToolResponse(
                        function_responses=[
                            types.FunctionResponse(
                                name=fc.name,
                                id=fc.id,
                                response={"error": f"Tool execution failed: {str(e)}"},
                            )
                        ]
                    )
                    await session.send(input=error_response)
                except Exception as inner_e:
                    logging.error(f"Failed to send error response: {str(inner_e)}")

    async def receive_from_gemini(self) -> None:
        """Listen for and process messages from Gemini.
        
        Broadcasts ALL Gemini content to ALL clients (glasses + web), including:
        - Text responses
        - Audio responses
        - Input/Output audio transcriptions
        - Tool call responses (after server executes them)
        - All other Gemini content
        """
        logging.info("🎧 Starting to listen for Gemini responses...")
        try:
            while result := await self.session._ws.recv(decode=False):
                logging.info(f"📥 Received from Gemini: {result[:200]}")
                
                # Parse message to check for transcriptions and print full structure
                try:
                    message_dict = json.loads(result)
                    
                    # Print ALL top-level keys in the message
                    all_keys = list(message_dict.keys())
                    logging.info(f"🔑 Message contains keys: {all_keys}")
                    
                    # Log input transcription if present (in serverContent)
                    server_content = message_dict.get("serverContent", {})
                    if "inputTranscription" in server_content:
                        transcript = server_content["inputTranscription"].get("text", "")
                        logging.info(f"🎤 ✅ Input Transcription FOUND: {transcript}")
                    
                    # Log output transcription if present (in serverContent)
                    if "outputTranscription" in server_content:
                        transcript = server_content["outputTranscription"].get("text", "")
                        logging.info(f"🔊 ✅ Output Transcription FOUND: {transcript}")
                    
                    # Print COMPLETE message structure (remove audio data to avoid huge logs)
                    message_copy = json.loads(json.dumps(message_dict))
                    # Truncate audio data if present
                    if "serverContent" in message_copy and "modelTurn" in message_copy["serverContent"]:
                        parts = message_copy["serverContent"]["modelTurn"].get("parts", [])
                        for part in parts:
                            if "inlineData" in part and "data" in part["inlineData"]:
                                data_len = len(part["inlineData"]["data"])
                                part["inlineData"]["data"] = f"[AUDIO_DATA: {data_len} chars]"
                    
                    logging.info(f"📄 COMPLETE MESSAGE STRUCTURE:")
                    logging.info(json.dumps(message_copy, indent=2, ensure_ascii=False))
                    
                except (json.JSONDecodeError, KeyError) as e:
                    logging.debug(f"Could not parse message for transcription: {e}")
                
                # Broadcast ALL Gemini messages to ALL clients (glasses + web)
                # This includes input_audio_transcription and output_audio_transcription
                await self.connection_manager.broadcast_to_all(result)
                logging.info(f"✅ Broadcasted Gemini message to all clients (including transcriptions)")

                # Process tool calls asynchronously (server-side execution)
                try:
                    message = types.LiveServerMessage.model_validate(json.loads(result))
                    logging.info(f"📦 Parsed message type: {list(message.model_dump(exclude_none=True).keys())}")
                except ValidationError as ve:
                    logging.warning(f"⚠️  Validation error: {ve}")
                    continue

                if message.tool_call:
                    tool_call = LiveServerToolCall.model_validate(message.tool_call)
                    func_names = [fc.name for fc in tool_call.function_calls]
                    logging.info(f"🔧 Tool call detected: functions={func_names}")
                    # Execute tool on server side (async)
                    asyncio.create_task(self._handle_tool_call(self.session, tool_call))
                    
        except Exception as e:
            logging.error(f"Error receiving from Gemini: {str(e)}")
            import traceback
            logging.error(f"Traceback: {traceback.format_exc()}")


def get_connect_and_run_callable(
    glasses_websocket: WebSocket, 
    conn_manager: ConnectionManager
) -> Callable:
    """Create a callable that handles Gemini connection with retry logic."""

    async def on_backoff(details: backoff._typing.Details) -> None:
        await conn_manager.send_json_to_all(
            {
                "status": f"Service: Gemini connection error, retrying in {details['wait']} seconds..."
            }
        )

    @backoff.on_exception(
        backoff.expo, ConnectionClosedError, max_tries=10, on_backoff=on_backoff
    )
    async def connect_and_run(voice_name, text_only) -> None:
        async with genai_client.aio.live.connect(
            model=MODEL_ID, config=create_live_connect_config(voice_name, text_only)
        ) as session:
            # Manually construct and broadcast setupComplete
            # (genai SDK consumes the real setupComplete internally, so we reconstruct it)
            try:
                # Try to get session_id from session object if available
                session_id = getattr(session, 'session_id', None) or f"manual_{id(session)}"
                
                setup_complete_msg = {
                    "setupComplete": {
                        "sessionId": session_id
                    }
                }
                setup_complete_bytes = json.dumps(setup_complete_msg).encode('utf-8')
                
                logging.info(f"📥 Manually constructing setupComplete with sessionId: {session_id}")
                await conn_manager.broadcast_to_all(setup_complete_bytes)
                logging.info(f"✅ Broadcasted setupComplete to all clients")
            except Exception as e:
                logging.error(f"❌ Error broadcasting setupComplete: {e}")
            
            gemini_session = GeminiSession(
                session=session,
                glasses_websocket=glasses_websocket,
                tool_functions=tool_functions,
                connection_manager=conn_manager,
            )
            logging.info("Starting bidirectional communication with broadcast to all clients")
            await asyncio.gather(
                gemini_session.receive_from_client(),
                gemini_session.receive_from_gemini(),
            )

    return connect_and_run


def initialize_firestore():
    """Initializes Firestore and returns the client."""
    if not firebase_admin._apps:
        project_id = os.getenv("FIRESTORE_PROJECT")
        if not project_id:
            raise RuntimeError("FIRESTORE_PROJECT environment variable is required")
        app_options = {'projectId': project_id}
        firebase_admin.initialize_app(options=app_options)
    return firestore.client()


db = initialize_firestore()


def create_dated_title(base_title: str) -> str:
    """Adds the current date and time to a base title string."""
    now = datetime.datetime.now()
    formatted_date_time = now.strftime("%Y-%m-%d %H:%M:%S")
    dated_title = f"{base_title} - {formatted_date_time}"
    return dated_title


# ==================== API Endpoints ====================

_ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_ROUTES_FIELDS = "routes.polyline.geoJsonLinestring"


@app.get("/api/health")
async def api_health():
    """Health check endpoint (canonical path for integration tests and load balancers)."""
    return {"status": "healthy"}


@app.post("/api/routes")
async def proxy_routes(request: Request) -> Any:
    """Proxy the Routes API call server-side so the API key is never exposed to the browser."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Routes API key not configured")

    body = await request.body()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_ROUTES_API_URL}?fields={_ROUTES_FIELDS}",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
            },
        )
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@app.get("/test", response_class=HTMLResponse)
async def get_test_page():
    """Serve the WebSocket test page for debugging."""
    try:
        test_page = pathlib.Path(__file__).parent / "test_page.html"
        if test_page.exists():
            return test_page.read_text()
        else:
            return HTMLResponse(
                content="<h1>Test page not found</h1><p>test_page.html is missing</p>",
                status_code=404
            )
    except Exception as e:
        return HTMLResponse(
            content=f"<h1>Error loading test page</h1><p>{str(e)}</p>",
            status_code=500
        )

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        'status': 'healthy',
        'service': 'restaurant_guide',
        'mode': 'full_business_logic'
    }


@app.websocket("/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent")
async def gemini_api_proxy_endpoint(
    websocket: WebSocket,
    authorization: str = Header(None)
) -> None:
    """
    Gemini API compatible proxy endpoint for Go GenAI SDK.
    
    This endpoint provides full Gemini API compatibility, allowing the glasses team
    to use their existing Go GenAI SDK by simply changing the host to our service.
    
    Path: /ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent
    - Matches Vertex AI Gemini API path exactly
    - No query parameters required
    - Accepts Bearer Token (Vertex AI OAuth) but uses our own credentials internally
    - Automatically set as 'glasses' client type
    
    Headers:
        Authorization: Bearer <token> (received but not validated, we use our own Vertex AI credentials)
    """
    # Log the Bearer Token for debugging (optional)
    if authorization:
        token_preview = authorization[:20] + "..." if len(authorization) > 20 else authorization
        logging.info(f"🔐 Received Bearer Token: {token_preview}")
    else:
        logging.warning(f"⚠️  No Bearer Token provided by GenAI SDK")
    
    # Call the main websocket endpoint with glasses defaults
    # No query parameters, just like Gemini API
    logging.info(f"🔄 Proxying to Gemini API (compatible mode)")
    await websocket_endpoint(
        websocket=websocket,
        client_type="glasses",
        voice_name="Charon",
        text_only="false"
    )


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    client_type: str = "glasses",  # "glasses" or "web"
    voice_name: str = "Charon",  # Default voice if none specified
    text_only: str = 'false',
    secret: str = Query(default=""),
) -> None:
    """Main WebSocket endpoint for glasses and web clients.

    This endpoint handles:
    - Glasses: Audio input source, sends audio to Gemini
    - Web: Observer only, receives all Gemini responses for display
    - Broadcasting: All Gemini responses are sent to ALL connected clients

    Query Parameters:
        client_type: "glasses" (audio input) or "web" (observer)
        voice_name: AI voice name (Aoede, Charon, Fenrir, Puck, Kore)
        text_only: Whether to use text-only mode (true/false)
        secret: Shared secret (required when WS_SECRET env var is set)
    """
    # Validate shared secret before accepting the connection
    if _WS_SECRET and secret != _WS_SECRET:
        await websocket.close(code=1008, reason="Unauthorized")
        logging.warning(f"Rejected WebSocket connection: invalid secret from {websocket.client}")
        return

    await websocket.accept()
    client_info = f"type={client_type}, voice={voice_name}, text_only={text_only}"
    logging.info(f"🔌 Client connected - {client_info}")
    logging.info(f"📍 Connection from: {websocket.client.host if websocket.client else 'unknown'}")
    
    if client_type == "glasses":
        # Register glasses connection and start Gemini session
        logging.info(f"👓 Registering GLASSES client")
        connection_manager.connect_glasses(websocket)
        
        try:
            connect_and_run = get_connect_and_run_callable(websocket, connection_manager)
            await connect_and_run(voice_name=voice_name, text_only=text_only)
        finally:
            connection_manager.disconnect(websocket)
            
    elif client_type == "web":
        # Register web client connection (observer only)
        logging.info(f"🌐 Registering WEB client (observer mode)")
        connection_manager.connect_web(websocket)
        
        try:
            # Send welcome message
            welcome_msg = {"status": "Web client connected. You will receive all Gemini responses."}
            await websocket.send_json(welcome_msg)
            logging.info(f"✅ Sent welcome message to web client")
            
            # Keep connection alive, just waiting for disconnect
            while True:
                try:
                    # Web clients don't send data, but we need to keep the connection alive
                    await websocket.receive_text()
                except ConnectionClosedError:
                    break
        finally:
            connection_manager.disconnect(websocket)
    else:
        await websocket.send_json({"error": f"Invalid client_type: {client_type}. Must be 'glasses' or 'web'."})
        await websocket.close()


class Feedback(BaseModel):
    """Represents feedback for a conversation."""
    score: Union[int, float]
    text: Optional[str] = ""
    run_id: str
    user_id: Optional[str]
    log_type: Literal["feedback"] = "feedback"


@app.post("/feedback")
async def collect_feedback(feedback_dict: Feedback) -> None:
    """Collect and log feedback from clients."""
    feedback_data = feedback_dict.model_dump()
    logger.log_struct(feedback_data, severity="INFO")


class PlaceItem(BaseModel):
    """Represents a place in an itinerary."""
    placeId: str
    title: str
    order: int


class Itinerary(BaseModel):
    """Represents an itinerary with restaurant selection."""
    restaurant: PlaceItem


@app.post("/submititinerary")
async def submit_itinerary(itinerary: Itinerary) -> Dict[str, Any]:
    """Submit an itinerary to Firestore."""
    try:
        itinerary_dict = itinerary.model_dump()
        logging.info(f"Submitting itinerary: {itinerary}")

        # Add the itinerary to Firestore
        doc_ref = db.collection("itineraries").document()
        doc_ref.set(itinerary_dict)
        doc_id = doc_ref.id

        logging.info(f"Created itinerary with ID: {doc_id}")
        return {"documentId": f"{doc_id}"}
        
    except Exception as e:
        logging.error(f"Error submitting itinerary: {str(e)}")
        return {"error": "Failed to submit itinerary"}


@app.get("/")
async def serve_spa(request: Request) -> Any:
    """服务前端 React SPA（index.html）。"""
    return templates.TemplateResponse(request, "index.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

