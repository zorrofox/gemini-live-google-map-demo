import os
import re
import json
import httpx
import requests
import aiohttp
import google.auth
import logging
from google.cloud import logging as google_cloud_logging
from google.genai.types import FunctionDeclaration, Tool
import googlemaps

from typing import Any, Dict, List, Union

from app.templates import (
    RESTAURANT_DETAILS_SYSTEM_INSTRUCTIONS,
    RESTAURANT_SUGGESTION_SYSTEM_INSTRUCTIONS,
)

gmaps = googlemaps.Client(key=os.getenv("GOOGLE_API_KEY", ""))

logging_client = google_cloud_logging.Client()
logger = logging_client.logger(__name__)
logging.basicConfig(level=logging.INFO)


def get_access_token():
    """Retrieves a Google Cloud access token.
    Replace this with your preferred access token retrieval method.
    """
    try:
        credentials, _ = google.auth.default()
        # Refresh the access token if necessary
        if not credentials.valid:
            credentials.refresh(google.auth.transport.requests.Request())
        access_token = credentials.token
        return access_token
    except Exception as e:  # Handle potential exceptions
        print(f"Error getting access token: {e}")
        return None


def construct_maps_grounding_payload(
    model_id: str, system_instructions: str, prompt: str, api_key: str
) -> Union[List[Dict[str, Any]], Dict[str, Any]]:

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": {"text": system_instructions}},
        "groundingSpec": {
            "groundingSources": [{"googleMapsSource": {"apiKeyString": api_key}}]
        },
        "generationSpec": {"modelId": model_id},
    }
    return payload


def construct_vertex_maps_grounding_payload(
    model_id: str, system_instructions: str, prompt: str, api_key: str, enable_widget: bool = True
) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
    """Constructs payload for Maps grounding using REST API format.
    
    This matches the format used in the TypeScript fetchMapsGroundedResponseREST function.
    """
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "system_instruction": {
            "parts": [{"text": system_instructions}]
        },
        "tools": [
            {
                "google_maps": {
                    "enable_widget": enable_widget
                }
            }
        ],
        "generationConfig": {
            "thinkingConfig": {
                "thinkingBudget": 0
            }
        }
    }
    return payload


async def call_maps_grounding_api(
    model_id: str, system_instructions: str, prompt: str, api_key: str
) -> str:
    """Calls the Generative Language API for Maps grounding.
    
    This matches the REST API approach from the TypeScript fetchMapsGroundedResponseREST function.
    Uses x-goog-api-key header instead of OAuth Bearer token.
    """
    base_url = "https://generativelanguage.googleapis.com/v1beta"
    url = f"{base_url}/models/{model_id}:generateContent"
    
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    payload = construct_vertex_maps_grounding_payload(
        model_id, system_instructions, prompt, api_key
    )
    
    logging.info(f"URL: {url}")
    logging.info(f"Payload:\n{json.dumps(payload, indent=2)}")

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as response:
            logging.info(f"Status: {response.status}")
            logging.info(f"Content-type: {response.headers['content-type']}")
            
            if response.status != 200:
                error_body = await response.text()
                logging.error(f"Error from Generative Language API: {error_body}")
                raise Exception(
                    f"API request failed with status {response.status}: {error_body}"
                )
            
            json_response = await response.json()
            logging.info(f"Body: {json.dumps(json_response, indent=2)}")
            logger.log_struct(json_response, severity="INFO")
            
            return json_response


def get_model_text(json_response: object) -> str:
    parts = [p["text"] for p in json_response["candidates"][0]["content"]["parts"]]
    model_text = "\n\n".join(parts)
    return model_text


def get_place_names_from_model_text(json_response: object) -> list:
    model_text = get_model_text(json_response)
    matches = re.findall(r"\*\*([\w,\s]*):\*\*", model_text)
    return list(matches)


def get_grounding_metadata(json_response: object) -> object:
    """Extract grounding metadata from the new API response format.
    
    Filters chunks to only include places that are mentioned in the model's response.
    The new format includes placeId directly in the response, eliminating
    the need for geocoding lookups.
    """
    model_text = get_model_text(json_response)
    chunks = json_response["candidates"][0]["groundingMetadata"]["groundingChunks"]
    
    # Extract place names from the model's JSON response
    try:
        # Remove markdown code fence if present
        json_text = model_text.strip()
        if json_text.startswith('```json'):
            json_text = json_text[7:]  # Remove ```json
        if json_text.startswith('```'):
            json_text = json_text[3:]  # Remove ```
        if json_text.endswith('```'):
            json_text = json_text[:-3]  # Remove ```
        json_text = json_text.strip()
        
        # Parse the JSON to get place names
        places_dict = json.loads(json_text)
        mentioned_place_names = set(places_dict.keys())
        
        logging.info(f"Places mentioned in model response: {mentioned_place_names}")
        
        # Filter chunks to only include places mentioned in the response
        filtered_chunks = [
            chunk for chunk in chunks
            if chunk["maps"]["title"] in mentioned_place_names
        ]
        
        logging.info(f"Filtered chunks from {len(chunks)} to {len(filtered_chunks)}")
        
    except (json.JSONDecodeError, KeyError) as e:
        logging.warning(f"Could not parse model text as JSON, returning all chunks: {e}")
        filtered_chunks = chunks
    
    # Hard limit to maximum 3 results as specified in system instructions
    filtered_chunks = filtered_chunks[:3]

    return [
        {
            "sourceMetadata": {
                "title": chunk["maps"]["title"],
                "document_id": chunk["maps"]["placeId"],
                "text": model_text,
            }
        }
        for chunk in filtered_chunks
    ]


async def maps_grounding(prompt: str, system_instructions: str) -> Dict[str, Any]:
    """Main function for Maps grounding requests.
    
    Uses the Generative Language API with API key authentication,
    matching the TypeScript implementation.
    """
    model_id = 'gemini-2.5-flash'
    api_key = os.getenv("GOOGLE_API_KEY", "")
    
    json_response = await call_maps_grounding_api(
        model_id, system_instructions, prompt, api_key
    )
    
    tool_response = {"model_text": "", "grounding_metadata": {"supportChunks": []}}
    tool_response["model_text"] = get_model_text(json_response)
    tool_response["grounding_metadata"]["supportChunks"] = get_grounding_metadata(
        json_response
    )
    return tool_response


async def get_restaurant_suggestions(prompt: str):
    """Used to get a list of restaurant suggestions for the user from the maps
    grounding agent.

    Args:
        prompt: a string describing the search parameters. The prompt needs to
        include a location and quisine type and user preferences.

    Returns:
        A response from the maps grounding restaurant agent, which will include a
        conversational description and supporting meta data.
        Suggested restaurants will be in the model_text.
    """
    return await maps_grounding(prompt, RESTAURANT_SUGGESTION_SYSTEM_INSTRUCTIONS)


async def get_place_information(prompt: str):
    """Used to get details of the restaurant provided by the user from the maps
    grounding agent. Call this when the user wants to know more about a specific restaurant.

    Args:
        prompt: a string with the name of the restaurant. The prompt needs to
        include a location.

    Returns:
        A response from the maps grounding agent, which will include a
        conversational description and supporting meta data. Relevant data will be
        in the model_text.
    """

    return await maps_grounding(prompt, RESTAURANT_DETAILS_SYSTEM_INSTRUCTIONS)


async def show_place_photos(prompt: str):
    """Used to get photos of the restaurant provided by the user from the maps
    grounding agent. Call this when the user wants to see photos or images of a specific restaurant.

    Args:
        prompt: a string with the name of the restaurant. The prompt needs to
        include a location.

    Returns:
        A response from the maps grounding agent, which will include a
        conversational description and supporting meta data. Relevant data will be
        in the model_text.
    """

    return await maps_grounding(prompt, RESTAURANT_DETAILS_SYSTEM_INSTRUCTIONS)


async def hide_photos() -> Dict[str, str]:
    """Used to alert the client that photos should be hidden now.
    Call this when you determine that the user wants to move on
    or explicitly asks to hide them.

    Returns:
        A status that must be ignored
    """

    return {"status": "Photos have been hidden successfully"}


async def select_restaurant(prompt: str):
    """Used to get details of the selected restaurant for the user from the maps
    grounding agent. Call this when you determine where the user wants to eat.


    Args:
        prompt: a string with the name of the restaurant. The prompt needs to
        include a location.

    Returns:
        A response from the maps grounding agent, which will include a
        conversational description and supporting meta data.
        Selected restaurant will be in the model_text.
    """

    return await maps_grounding(prompt, RESTAURANT_DETAILS_SYSTEM_INSTRUCTIONS)


async def get_weather() -> Dict[str, str]:
    """This function can be used to provide the user with a weather update,
    allowing the agent to factor weather conditions into restaurant recommendations.

    Args:
        None

    Returns:
         A dictionary with a 'weather' key containing a comprehensive weather summary
        including temperature, conditions, humidity, wind, rain probability, and UV index.
    """
    url = "https://weather.googleapis.com/v1/currentConditions:lookup"
    api_key = os.getenv("GOOGLE_API_KEY", "")
    params = {
        "key": api_key,
        "units_system": "METRIC",
        "location.latitude": 25.2048,
        "location.longitude": 55.2708,
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()  # Raise an exception for HTTP errors

            data = response.json()
            # Extract only the most relevant data
            is_daytime = data.get("isDaytime", False)
            time_of_day = "day" if is_daytime else "night"
            weather_condition = (
                data.get("weatherCondition", {})
                .get("description", {})
                .get("text", "Unknown")
            )
            temperature = data.get("temperature", {}).get("degrees", 0)
            humidity = data.get("relativeHumidity", 0)
            wind_speed = data.get("wind", {}).get("speed", {}).get("value", 0)
            wind_direction = (
                data.get("wind", {}).get("direction", {}).get("cardinal", "Unknown")
            )
            rain_probability = (
                data.get("precipitation", {}).get("probability", {}).get("percent", 0)
            )
            uv_index = data.get("uvIndex", 0)

            # Convert UV index to a descriptive category
            uv_description = "Low"
            if uv_index >= 3 and uv_index <= 5:
                uv_description = "Moderate"
            elif uv_index >= 6 and uv_index <= 7:
                uv_description = "High"
            elif uv_index >= 8 and uv_index <= 10:
                uv_description = "Very High"
            elif uv_index >= 11:
                uv_description = "Extreme"

            # Skip UV info at night when it's always 0
            uv_info = (
                f" UV index is {uv_description} ({uv_index})." if is_daytime else ""
            )

            # Create a concise weather description
            weather_summary = (
                f"Current weather in Dubai: {weather_condition} with {temperature}°C. "
                f"It's currently {time_of_day}time with {humidity}% humidity. "
                f"Wind is {wind_speed} km/h from the {wind_direction}. "
                f"There is a {rain_probability}% chance of rain.{uv_info}"
            )

            return {"weather": weather_summary}

        except Exception as e:
            return {
                "weather": f"Unable to retrieve weather information. Error: {str(e)}"
            }


async def submit_itinerary(itinerary: str) -> Dict[str, str]:
    return {"status": "Itinerary submitted successfully"}


def get_tools(genai_client):
    # 只保留餐厅相关工具
    restaurant_tool = Tool(
        function_declarations=[
            FunctionDeclaration.from_callable(
                client=genai_client, callable=get_restaurant_suggestions
            ),
            FunctionDeclaration.from_callable(
                client=genai_client, callable=select_restaurant
            ),
        ]
    )

    get_weather_tool = Tool(
        function_declarations=[
            FunctionDeclaration.from_callable(client=genai_client, callable=get_weather)
        ]
    )

    submit_itinerary_tool = Tool(
        function_declarations=[
            FunctionDeclaration.from_callable(
                client=genai_client, callable=submit_itinerary
            )
        ]
    )

    place_information_tool = Tool(
        function_declarations=[
            FunctionDeclaration.from_callable(
                client=genai_client, callable=show_place_photos
            ),
            FunctionDeclaration.from_callable(
                client=genai_client, callable=hide_photos
            ),
            FunctionDeclaration.from_callable(
                client=genai_client, callable=get_place_information
            ),
        ]
    )

    # 只保留餐厅相关的工具函数
    tool_functions = {
        "get_restaurant_suggestions": get_restaurant_suggestions,
        "select_restaurant": select_restaurant,
        "get_place_information": get_place_information,
        "show_place_photos": show_place_photos,
        "hide_photos": hide_photos,
        "get_weather": get_weather,
        "submit_itinerary": submit_itinerary,
    }

    tools_config = [
        restaurant_tool,
        place_information_tool,
        submit_itinerary_tool,
        get_weather_tool,
    ]

    return tools_config, tool_functions
