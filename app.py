from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import os
import json

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2048
    stream: Optional[bool] = False

def get_provider_and_headers(model: str, api_key: str):
    """Determine the provider and set up headers based on the model."""
    model_lower = model.lower()
    
    # MiniMax models
    if "minimax" in model_lower:
        # Check if it's MiniMax 2.5
        if "2.5" in model_lower or "m2.5" in model_lower:
            # Use Anthropic-compatible endpoint for MiniMax 2.5
            return {
                "provider": "minimax_anthropic",
                "api_key": api_key,
                "endpoint": "https://api.minimax.io/anthropic/v1/messages",
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
                "endpoint": "https://api.minimax.io/v1/text/chatcompletion_v2",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
            }
    
    # OpenAI models
    return {
        "provider": "openai",
        "api_key": api_key,
        "endpoint": "https://api.openai.com/v1/chat/completions",
        "headers": {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    }

async def call_minimax_anthropic(model: str, messages: List[Dict], temperature: float, max_tokens: int, api_key: str):
    """Call MiniMax 2.5 using Anthropic-compatible endpoint."""
    endpoint = "https://api.minimax.io/anthropic/v1/messages"
    
    # Convert messages to Anthropic format
    anthropic_messages = []
    for msg in messages:
        anthropic_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    payload = {
        "model": model,
        "messages": anthropic_messages,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(endpoint, json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        result = response.json()
        
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

async def call_openai_compatible(model: str, messages: List[Dict], temperature: float, max_tokens: int, endpoint: str, api_key: str):
    """Call OpenAI-compatible API."""
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

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    """Handle chat completion requests."""
    # Get API key - prefer MiniMax if model contains minimax
    if "minimax" in request.model.lower():
        if not MINIMAX_API_KEY:
            raise HTTPException(status_code=401, detail="MiniMax API key not configured")
        api_key = MINIMAX_API_KEY
    else:
        if not OPENAI_API_KEY:
            raise HTTPException(status_code=401, detail="OpenAI API key not configured")
        api_key = OPENAI_API_KEY
    
    # Get provider configuration
    config = get_provider_and_headers(request.model, api_key)
    
    # Convert messages to dict format
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # Route to appropriate handler
    if config["provider"] == "minimax_anthropic":
        result = await call_minimax_anthropic(
            request.model,
            messages,
            request.temperature,
            request.max_tokens,
            api_key
        )
    else:
        result = await call_openai_compatible(
            request.model,
            messages,
            request.temperature,
            request.max_tokens,
            config["endpoint"],
            api_key
        )
    
    return result

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=51164)
