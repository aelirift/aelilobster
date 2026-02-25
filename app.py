from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import os
import json
from pathlib import Path

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration file path
CONFIG_FILE = Path(__file__).parent / "config.json"

# Load config from file
def load_config() -> Dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

# Save config to file
def save_config(config: Dict[str, Any]) -> None:
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

# Get API keys from config or environment
def get_api_key(provider: str) -> str:
    config = load_config()
    if provider.lower() == "minimax":
        return config.get("minimax_api_key", os.getenv("MINIMAX_API_KEY", ""))
    elif provider.lower() == "openai":
        return config.get("openai_api_key", os.getenv("OPENAI_API_KEY", ""))
    return ""

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
    # Get API key from config or environment
    if "minimax" in request.model.lower():
        api_key = get_api_key("minimax")
        if not api_key:
            raise HTTPException(status_code=401, detail="MiniMax API key not configured")
    else:
        api_key = get_api_key("openai")
        if not api_key:
            raise HTTPException(status_code=401, detail="OpenAI API key not configured")
    
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

# Config endpoints
class ConfigRequest(BaseModel):
    minimax_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    default_model: Optional[str] = None

@app.get("/config")
async def get_config():
    """Get current configuration (without exposing API keys)."""
    config = load_config()
    return {
        "has_minimax_key": bool(config.get("minimax_api_key")),
        "has_openai_key": bool(config.get("openai_api_key")),
        "default_model": config.get("default_model", "MiniMax-M2.5")
    }

@app.post("/config")
async def save_config_endpoint(request: ConfigRequest):
    """Save configuration."""
    config = load_config()
    
    if request.minimax_api_key is not None:
        config["minimax_api_key"] = request.minimax_api_key
    if request.openai_api_key is not None:
        config["openai_api_key"] = request.openai_api_key
    if request.default_model is not None:
        config["default_model"] = request.default_model
    
    save_config(config)
    return {"status": "saved"}

# Static files - serve index.html at root
@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

@app.get("/config.html")
async def serve_config():
    return FileResponse("static/config.html")

# Static files
@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    return FileResponse(f"static/{file_path}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=51164)
