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

import firebase_admin
from firebase_admin import firestore, credentials, initialize_app
import firebase_admin
import asyncio
import json
import logging
import os
import datetime
from typing import Any, Callable, Dict, Literal, Optional, Union

from app.agent import MODEL_ID, genai_client, create_live_connect_config, tool_functions
import backoff

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
from firebase_admin import firestore_async

from google.cloud import logging as google_cloud_logging
from google.genai import types, live
from google.genai.types import LiveServerToolCall
from pydantic import BaseModel, ValidationError
from websockets.exceptions import ConnectionClosedError

app = FastAPI()

# Sets the templates directory to the `build` folder from `npm run build`
# this is where you'll find the index.html file.
templates = Jinja2Templates(directory="./frontend/dist/")

# Mounts the `static` folder within the `build` folder to the `/static` route.
app.mount('/assets', StaticFiles(directory="./frontend/dist/assets/"), 'assets')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
logging_client = google_cloud_logging.Client()
logging_client.setup_logging()
logger = logging_client.logger(__name__)
logging.basicConfig(level=logging.INFO)


class GeminiSession:
    """Manages bidirectional communication between a client and the Gemini model."""

    def __init__(
        self,
        session: live.AsyncSession,
        websocket: WebSocket,
        tool_functions: Dict[str, Callable],
    ) -> None:
        """Initialize the Gemini session.

        Args:
            session: The Gemini session
            websocket: The client websocket connection
            user_id: Unique identifier for this client
            tool_functions: Dictionary of available tool functions
        """
        self.session = session
        self.websocket = websocket
        self.run_id = "n/a"
        self.user_id = "n/a"
        self.tool_functions = tool_functions

    async def receive_from_client(self) -> None:
        """Listen for and process messages from the client.

        Continuously receives messages and forwards audio data to Gemini.
        Handles connection errors gracefully.
        """
        while True:
            try:
                data = await self.websocket.receive_json()
                if isinstance(data, dict) and (
                    "realtimeInput" in data or "clientContent" in data
                ):
                    await self.session._ws.send(json.dumps(data))
                elif "setup" in data:
                    self.run_id = data["setup"]["run_id"]
                    self.user_id = data["setup"]["user_id"]
                    logging.info(f'Setup data: {data["setup"]}')
                else:
                    logging.warning(f"Received unexpected input from client: {data}")
            except ConnectionClosedError as e:
                logging.warning(f"Client {self.user_id} closed connection: {e}")
                break
            except Exception as e:
                logging.error(f"Error receiving from client {self.user_id}: {str(e)}")
                break

    def _get_func(self, action_label: str) -> Optional[Callable]:
        """Get the tool function for a given action label."""
        return None if action_label == "" else self.tool_functions.get(action_label)

    async def _handle_tool_call(
        self, session: live.AsyncSession, tool_call: LiveServerToolCall
    ) -> None:
        """Process tool calls from Gemini and send back responses."""
        for fc in tool_call.function_calls:
            try:
                logging.info(f"Calling tool function: {fc.name} with args: {fc.args}")
                response = await self._get_func(fc.name)(**fc.args)

                if 'grounding_metadata' in response:
                    await self.websocket.send_json(
                        {
                            "groundingResponse": response,
                            "name": f"{fc.name}_result",
                        }
                    )

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
        """Listen for and process messages from Gemini."""
        try:
            while result := await self.session._ws.recv(decode=False):
                # Send the message to the client immediately
                await self.websocket.send_bytes(result)

                # Process any tool calls asynchronously
                try:
                    message = types.LiveServerMessage.model_validate(json.loads(result))
                except ValidationError:
                    continue

                if message.tool_call:
                    tool_call = LiveServerToolCall.model_validate(message.tool_call)
                    # Create task for handling tool call
                    asyncio.create_task(self._handle_tool_call(self.session, tool_call))
        except Exception as e:
            logging.error(f"Error receiving from Gemini: {str(e)}")


def get_connect_and_run_callable(websocket: WebSocket) -> Callable:
    """Create a callable that handles Gemini connection with retry logic.

    Args:
        websocket: The client websocket connection

    Returns:
        Callable: An async function that establishes and manages the Gemini connection
    """

    async def on_backoff(details: backoff._typing.Details) -> None:
        await websocket.send_json(
            {
                "status": f"Model connection error, retrying in {details['wait']} seconds..."
            }
        )

    @backoff.on_exception(
        backoff.expo, ConnectionClosedError, max_tries=10, on_backoff=on_backoff
    )
    async def connect_and_run(voice_name, text_only) -> None:
        async with genai_client.aio.live.connect(
            model=MODEL_ID, config=create_live_connect_config(voice_name, text_only)
        ) as session:
            await websocket.send_json({"status": "Backend is ready for conversation"})
            gemini_session = GeminiSession(
                session=session, websocket=websocket, tool_functions=tool_functions
            )
            logging.info("Starting bidirectional communication")
            await asyncio.gather(
                gemini_session.receive_from_client(),
                gemini_session.receive_from_gemini(),
            )

    return connect_and_run


def initialize_firestore():
    """Initializes Firestore and returns the client."""
    if not firebase_admin._apps:
        # project_id = os.getenv("FIRESTORE_PROJECT", "MISSING_FIRESTORE_PROJECT")
        project_id = "boat-demo-fintech"
        private_key = os.getenv(
            "FIRESTORE_PRIVATE_KEY", "MISSING_FIRESTORE_PRIVATE_KEY"
        )
        client_email = os.getenv(
            "FIRESTORE_CLIENT_EMAIL", "MISSING_FIRESTORE_CLIENT_EMAIL"
        )
        app_options = {'projectId': project_id}
        firebase_admin.initialize_app(options=app_options)
        '''
        firebase_admin.initialize_app(
            credential=credentials.Certificate(
                {
                    "type": "service_account",
                    "project_id": project_id,
                    "private_key": private_key.replace('\\n', '\n'),
                    "client_email": client_email,
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            ),
        )
        '''
    return firestore.client()


db = initialize_firestore()


def create_dated_title(base_title: str) -> str:
    """
    Adds the current date and time to a base title string.

    Args:
        base_title: The original title string.

    Returns:
        The title string with the current date and time appended.
    """
    now = datetime.datetime.now()
    formatted_date_time = now.strftime("%Y-%m-%d %H:%M:%S")  # Example format
    dated_title = f"{base_title} - {formatted_date_time}"
    return dated_title


@app.get("/firestore")
async def get_firestore_data(
    create: Optional[bool] = False, title: Optional[str] = "[test] Shake Shack"
):
    """Retrieves or creates a document in the 'itineraries' collection."""
    if create:
        data = {
            "restaurant": {
                "placeId": "ChIJde3NKjPEyIARm8J1SdIBGuI",
                "title": create_dated_title(title),
                "order": 1,
            },
        }
        # update_time, doc_ref = await db.collection("itineraries").document().add(data)
        doc_ref = db.collection("itineraries").document().set(data)

        # Get the document ID
        return {"message": f"Document created successfully: {doc_ref}"}
    else:
        # docs = await db.collection("itineraries").get()
        docs = db.collection("itineraries").get()
        itineraries = [{"id": doc.id, "itinerary": doc.to_dict()} for doc in docs]
        return {"data": itineraries}


# sets up a health check route. This is used to show how you can hit
# the API and the React App url's
@app.get('/api/health')
async def health():
    return {'status': 'healthy'}


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    voice_name: str = "Charon",  # Default voice if none specified
    text_only='false',
) -> None:
    """Handle new websocket connections with optional voice parameter."""
    await websocket.accept()
    connect_and_run = get_connect_and_run_callable(websocket)
    await connect_and_run(voice_name=voice_name, text_only=text_only)


class Feedback(BaseModel):
    """Represents feedback for a conversation."""

    score: Union[int, float]
    text: Optional[str] = ""
    run_id: str
    user_id: Optional[str]
    log_type: Literal["feedback"] = "feedback"


class PlaceItem(BaseModel):
    """Represents a place in an itinerary."""

    placeId: str
    title: str
    order: int


class Itinerary(BaseModel):
    """Represents an itinerary with restaurant selection."""

    restaurant: PlaceItem


@app.post("/feedback")
async def collect_feedback(feedback_dict: Feedback) -> None:
    """Collect and log feedback."""
    feedback_data = feedback_dict.model_dump()
    logger.log_struct(feedback_data, severity="INFO")


@app.post("/submititinerary")
async def submit_itinerary(itinerary: Itinerary) -> Dict[str, Any]:
    """Submit an itinerary to Firestore."""

    try:
        itinerary_dict = itinerary.model_dump()
        # Log the itinerary
        logging.info(f"Submitting itinerary: {itinerary}")

        # Add the itinerary to Firestore
        doc_ref = db.collection(
            "itineraries"
        ).document()  # Create reference with auto-generated ID
        doc_ref.set(itinerary_dict)  # Set the document data
        doc_id = doc_ref.id  # Get the document ID

        logging.info(f"Created itinerary with ID: {doc_id}")

        return {"documentId": f"{doc_id}"}
    except Exception as e:
        logging.error(f"Error submitting itinerary: {str(e)}")
        return {"error": "Failed to submit itinerary"}


@app.get("/")
async def serve_spa(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
