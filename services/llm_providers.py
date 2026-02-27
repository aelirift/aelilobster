"""
LLM Providers Service
Handles setup and calling of different LLM providers (MiniMax, OpenAI).
"""
import httpx
from typing import List, Dict, Any, Callable, Optional

# MiniMax 2.5 Anthropic-compatible endpoint
MINIMAX_ANTHROPIC_ENDPOINT = "https://api.minimax.io/anthropic/v1/messages"
# MiniMax OpenAI-compatible endpoint
MINIMAX_ENDPOINT = "https://api.minimax.io/v1/text/chatcompletion_v2"
# OpenAI endpoint
OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"


def get_provider_and_headers(model: str, api_key: str) -> Dict[str, Any]:
    """
    Determine the provider and set up headers based on the model.
    
    Args:
        model: The model name (e.g., "MiniMax-M2.5", "gpt-4")
        api_key: The API key for authentication
    
    Returns:
        Dict with provider, api_key, endpoint, and headers
    """
    model_lower = model.lower()
    
    # MiniMax models
    if "minimax" in model_lower:
        # Check if it's MiniMax 2.5
        if "2.5" in model_lower or "m2.5" in model_lower:
            # Use Anthropic-compatible endpoint for MiniMax 2.5
            return {
                "provider": "minimax_anthropic",
                "api_key": api_key,
                "endpoint": MINIMAX_ANTHROPIC_ENDPOINT,
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
            }
        else:
            # Use OpenAI-compatible endpoint for older MiniMax models
            return {
                "provider": "minimax",
                "api_key": api_key,
                "endpoint": MINIMAX_ENDPOINT,
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
            }
    
    # OpenAI models
    return {
        "provider": "openai",
        "api_key": api_key,
        "endpoint": OPENAI_ENDPOINT,
        "headers": {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    }


async def call_minimax_anthropic(
    model: str,
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    api_key: str
) -> Dict[str, Any]:
    """
    Call MiniMax 2.5 using Anthropic-compatible endpoint.
    
    Args:
        model: The model name
        messages: List of message dicts with role and content
        temperature: Sampling temperature
        max_tokens: Max tokens to generate
        api_key: API key for authentication
    
    Returns:
        Response dict in OpenAI format
    """
    # Debug: log the model being used
    print(f"[DEBUG] MiniMax model: {model}")
    
    # Use model as-is (user specifies the correct model name)
    api_model = model
    
    # Extract system messages and combine them
    system_content = ""
    user_messages = []
    
    for msg in messages:
        if msg.get("role") == "system":
            # Combine all system messages
            if system_content:
                system_content += "\n\n"
            system_content += msg.get("content", "")
        else:
            # For user messages, wrap content in the required format
            user_messages.append({
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}]
            })
    
    payload = {
        "model": api_model,
        "max_tokens": max_tokens,
        "temperature": float(temperature)
    }
    
    # Add system if present
    if system_content:
        payload["system"] = system_content
    
    # Add messages
    if user_messages:
        payload["messages"] = user_messages
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Debug: log the full payload
    import json
    print(f"[DEBUG] MiniMax payload: {json.dumps(payload)}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                MINIMAX_ANTHROPIC_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=60.0
            )
            if response.status_code != 200:
                error_detail = response.text
                raise Exception(f"MiniMax API error {response.status_code}: {error_detail}")
            result = response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"MiniMax API error: {e.response.status_code} - {e.response.text}")
        
        # Parse Anthropic response format
        content_blocks = result.get("content", [])
        response_text = ""
        thinking_text = ""
        
        for block in content_blocks:
            if block.get("type") == "text":
                response_text += block.get("text", "")
            elif block.get("type") == "thinking":
                thinking_text += block.get("thinking", "")
        
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }]
        }


async def call_openai_compatible(
    model: str,
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    endpoint: str,
    api_key: str
) -> Dict[str, Any]:
    """
    Call OpenAI-compatible API.
    
    Args:
        model: The model name
        messages: List of message dicts with role and content
        temperature: Sampling temperature
        max_tokens: Max tokens to generate
        endpoint: API endpoint URL
        api_key: API key for authentication
    
    Returns:
        Response dict from the API
    """
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(endpoint, json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        return response.json()


def get_llm_call_function(model: str, api_key: str) -> Callable:
    """
    Get the appropriate LLM call function based on model.
    
    Args:
        model: The model name
        api_key: API key for authentication
    
    Returns:
        Callable function to call the LLM
    """
    config = get_provider_and_headers(model, api_key)
    
    if config["provider"] == "minimax_anthropic":
        return lambda m, msgs, temp, tokens, ak: call_minimax_anthropic(m, msgs, temp, tokens, ak)
    else:
        return lambda m, msgs, temp, tokens, ak: call_openai_compatible(
            m, msgs, temp, tokens, config["endpoint"], ak
        )


async def call_llm(
    model: str,
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    api_key: str
) -> Dict[str, Any]:
    """
    Unified function to call any LLM based on model name.
    
    Args:
        model: The model name
        messages: List of message dicts
        temperature: Sampling temperature
        max_tokens: Max tokens to generate
        api_key: API key
    
    Returns:
        Response dict from the LLM
    """
    config = get_provider_and_headers(model, api_key)
    
    if config["provider"] == "minimax_anthropic":
        return await call_minimax_anthropic(
            model, messages, temperature, max_tokens, api_key
        )
    else:
        return await call_openai_compatible(
            model, messages, temperature, max_tokens,
            config["endpoint"], api_key
        )
