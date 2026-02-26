from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import os
import json
import subprocess
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

# Projects directory
PROJECTS_DIR = Path(__file__).parent / "user_login"


def parse_project_id(project_id: str) -> tuple:
    """
    Parse project_id into (user_name, project_name).
    
    Supports formats:
    - user-project (hyphen): "test_user-myproject" -> ("test_user", "myproject")
    - user_project (underscore): "test_user_myproject" -> ("test_user", "myproject")
    
    Returns (None, None) if invalid format.
    """
    if not project_id:
        return None, None
    
    # Try hyphen first (preferred format per naming_conventions.md)
    if "-" in project_id:
        parts = project_id.split("-", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
    
    # Try underscore (legacy format)
    if "_" in project_id:
        parts = project_id.split("_", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
    
    return None, None

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
    print(f"[DEBUG] MiniMax payload: {json.dumps(payload)}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(endpoint, json=payload, headers=headers, timeout=60.0)
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

# Command execution endpoint
class CommandRequest(BaseModel):
    command: str

@app.post("/execute")
async def execute_command(request: CommandRequest):
    """Execute a shell command and return the output."""
    from services.command_service import is_linux_command, execute_command
    
    cmd = request.command.strip()
    
    # Use the command service to check and execute
    is_cmd, command = is_linux_command(cmd)
    
    if not is_cmd:
        return {"output": "Not a recognized Linux command", "exit_code": 1, "is_command": False}
    
    if command is None:
        return {"output": "Command blocked for safety", "exit_code": 1, "is_command": True, "is_error": True}
    
    result = execute_command(command)
    return {
        "output": result["output"],
        "exit_code": result["exit_code"],
        "is_command": True,
        "is_error": result["is_error"]
    }

# Process prompt - detects command vs LLM, then extracts and runs code from LLM response
class PromptRequest(BaseModel):
    prompt: str
    model: str = "MiniMax-M2.5"
    messages: List[Dict[str, str]] = []
    project_id: Optional[str] = None

@app.post("/prompt")
async def process_prompt(request: PromptRequest):
    """Process a prompt - execute as command or pass to LLM with code execution."""
    from services.command_service import is_linux_command, execute_command
    from services.code_stripper import extract_code_blocks, strip_codes
    from services.run_pod_test import run_code_in_pod
    
    prompt = request.prompt.strip()
    
    # Get project path if project_id is provided
    project_path = None
    user_name, project_name = parse_project_id(request.project_id) if request.project_id else (None, None)
    if user_name and project_name:
        project_path = str(PROJECTS_DIR / user_name / project_name)
    
    # Check if it's a command
    is_cmd, command = is_linux_command(prompt)
    
    if is_cmd and command:
        # Execute command directly (not in pod for direct commands)
        result = execute_command(command)
        return {
            "type": "command",
            "output": result["output"],
            "exit_code": result["exit_code"],
            "is_error": result["is_error"]
        }
    elif is_cmd and command is None:
        # Blocked command
        return {
            "type": "error",
            "output": "Command blocked for safety reasons"
        }
    else:
        # Pass to LLM - build messages and call API
        messages = request.messages + [{"role": "user", "content": prompt}]
        
        # Get API key
        if "minimax" in request.model.lower():
            api_key = get_api_key("minimax")
            if not api_key:
                raise HTTPException(status_code=401, detail="MiniMax API key not configured")
        else:
            api_key = get_api_key("openai")
            if not api_key:
                raise HTTPException(status_code=401, detail="OpenAI API key not configured")
        
        # Get provider config
        config = get_provider_and_headers(request.model, api_key)
        
        # Route to appropriate handler
        if config["provider"] == "minimax_anthropic":
            llm_result = await call_minimax_anthropic(
                request.model,
                messages,
                0.7,
                4096,
                api_key
            )
        else:
            llm_result = await call_openai_compatible(
                request.model,
                messages,
                0.7,
                4096,
                config["endpoint"],
                api_key
            )
        
        llm_output = llm_result["choices"][0]["message"]["content"]
        
        # Extract and execute code from LLM response
        code_blocks = extract_code_blocks(llm_output)
        execution_results = []
        
        # If a project is selected, use run_pod_test; otherwise use local execution
        use_pod = project_path is not None
        
        for block in code_blocks:
            if use_pod:
                # Run in pod with project context
                exec_result = run_code_in_pod(block['code'], project_path)
                execution_results.append({
                    "code": block['code'],
                    "language": block['language'],
                    "output": exec_result["output"],
                    "exit_code": exec_result["exit_code"],
                    "is_error": exec_result["is_error"],
                    "access_info": exec_result.get("access_info"),
                    "ran_in_pod": True
                })
            else:
                # Run locally (no project selected)
                exec_result = execute_command(block['code'])
                execution_results.append({
                    "code": block['code'],
                    "language": block['language'],
                    "output": exec_result["output"],
                    "exit_code": exec_result["exit_code"],
                    "is_error": exec_result["is_error"],
                    "access_info": None,
                    "ran_in_pod": False
                })
        
        return {
            "type": "llm",
            "output": llm_output,
            "code_blocks": execution_results,
            "has_code": len(code_blocks) > 0,
            "ran_in_pod": use_pod
        }


# Looper endpoints
class LooperRequest(BaseModel):
    prompt: str
    model: str = "MiniMax-M2.5"
    messages: List[Dict[str, str]] = []
    project_id: Optional[str] = None
    user_name: Optional[str] = None
    project_name: Optional[str] = None


def get_llm_call_function(model: str, api_key: str):
    """Get the appropriate LLM call function based on model."""
    config = get_provider_and_headers(model, api_key)
    
    if config["provider"] == "minimax_anthropic":
        return lambda m, msgs, temp, tokens, ak: call_minimax_anthropic(m, msgs, temp, tokens, ak)
    else:
        return lambda m, msgs, temp, tokens, ak: call_openai_compatible(m, msgs, temp, tokens, config["endpoint"], ak)


@app.post("/api/looper/run")
async def run_looper(request: LooperRequest):
    """Run the looper - a loop that handles: call API -> code stripper -> run pod test -> results -> debugger"""
    from services.looper import run_looper as run_looper_service, set_trace_callback, get_looper_state
    from services.run_pod_test import find_requirements_file
    from services.command_service import is_linux_command, execute_command
    
    prompt = request.prompt.strip()
    
    # Check if it's a Linux command - execute directly if so
    is_cmd, command = is_linux_command(prompt)
    
    if is_cmd and command:
        # Execute command directly and return result
        result = execute_command(command)
        return {
            "success": True,
            "type": "command",
            "response": result["output"],
            "output": result["output"],
            "exit_code": result["exit_code"],
            "is_error": result["is_error"],
            "command_tree": []
        }
    elif is_cmd and command is None:
        # Blocked command
        return {
            "success": False,
            "type": "error",
            "output": "Command blocked for safety reasons"
        }
    
    # Get project path if project_id is provided
    project_path = None
    user_name = request.user_name
    project_name = request.project_name
    
    if request.project_id:
        parsed_user, parsed_project = parse_project_id(request.project_id)
        if parsed_user and parsed_project:
            project_path = str(PROJECTS_DIR / parsed_user / parsed_project)
            # Use project_id parts as user_name and project_name if not provided
            if not user_name:
                user_name = parsed_user
            if not project_name:
                project_name = parsed_project
    
    # Use default user from config if not provided
    if not user_name:
        config = load_config()
        user_name = config.get("default_user", "default")
    
    # Use default project if not provided
    if not project_name:
        project_name = "default"
    
    # Get API key
    if "minimax" in request.model.lower():
        api_key = get_api_key("minimax")
        if not api_key:
            raise HTTPException(status_code=401, detail="MiniMax API key not configured")
    else:
        api_key = get_api_key("openai")
        if not api_key:
            raise HTTPException(status_code=401, detail="OpenAI API key not configured")
    
    # Get LLM call function
    call_llm_func = get_llm_call_function(request.model, api_key)
    
    # Load context files (debugger context)
    context_files = load_context_files()
    
    # Run the looper
    result = await run_looper_service(
        initial_prompt=prompt,
        model=request.model,
        api_key=api_key,
        project_path=project_path,
        call_llm_func=call_llm_func,
        context_files=context_files,
        trace_callback=None,
        user_name=user_name,
        project_name=project_name
    )
    
    return result


@app.post("/api/looper/stop")
async def stop_looper():
    """Stop the running looper."""
    from services.looper import stop_looper as stop_looper_service, get_looper_state
    
    state = get_looper_state()
    state.stop()
    
    return {"status": "stopped", "was_running": state.is_running}


@app.get("/api/looper/trace-stream")
async def trace_stream():
    """
    Server-Sent Events endpoint for real-time trace updates.
    Frontend connects to this to receive trace entries as they're generated.
    """
    from services.looper import trace_logger, get_looper_state
    import asyncio
    
    async def event_generator():
        last_index = 0
        state = get_looper_state()
        
        while state.is_running or last_index < len(trace_logger.entries):
            # Check for new entries
            current_entries = trace_logger.entries
            if last_index < len(current_entries):
                # Send new entries
                new_entries = current_entries[last_index:]
                for entry in new_entries:
                    yield f"data: {json.dumps(entry.to_dict())}\n\n"
                    last_index += 1
            
            # Small delay to avoid tight loop
            await asyncio.sleep(0.5)
        
        # Send done signal
        yield f"data: {json.dumps({'type': 'done', 'label': 'Stream Complete', 'data': {}})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


# Static files - serve index.html at root
@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

@app.get("/config.html")
async def serve_config():
    return FileResponse("static/config.html")

@app.get("/files.html")
async def serve_files():
    return FileResponse("static/files.html")

# Context Files - Folder-based storage
CONTEXT_FILES_DIR = Path(__file__).parent / "context_files"
FILE_TYPES_FILE = CONTEXT_FILES_DIR / "file_types.json"

# Create the context_files directory if it doesn't exist
CONTEXT_FILES_DIR.mkdir(exist_ok=True)

# Default file types (permanent list)
DEFAULT_FILE_TYPES = [
    "pre-llm",
    "post-llm",
    "pre-code",
    "post-code",
    "pre-pod",
    "post-pod",
    "pre-execute",
    "post-execute",
    "pre-display"
]

def get_file_types() -> List[str]:
    """Get the list of file types (creates file if not exists)."""
    if FILE_TYPES_FILE.exists():
        try:
            with open(FILE_TYPES_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    # Create the file with default types
    with open(FILE_TYPES_FILE, "w") as f:
        json.dump(DEFAULT_FILE_TYPES, f, indent=2)
    return DEFAULT_FILE_TYPES

def load_context_files() -> List[Dict[str, Any]]:
    """Load context files metadata from folder."""
    # Load defaults
    defaults = load_context_defaults()
    
    files = []
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.name in ("file_types.json", "defaults.json"):
            continue
        try:
            with open(md_file, "r") as f:
                content = f.read()
            # Parse metadata from filename: {name}_{type}.md
            stem = md_file.stem
            parts = stem.rsplit("_", 1)  # Split from right to get type
            if len(parts) == 2:
                name = parts[0]
                file_type = parts[1]
            else:
                # Single word filename - default to pre-llm type
                name = stem
                file_type = "pre-llm"
            
            # Check if this file is the default for its type
            is_default = defaults.get(file_type) == name
            
            files.append({
                "id": f"{name}_{file_type}",
                "name": name,
                "type": file_type,
                "content": content,
                "is_default": is_default
            })
        except:
            pass
    return files

def load_context_defaults() -> Dict[str, str]:
    """Load default context file mappings from defaults.json."""
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    if defaults_file.exists():
        try:
            import json
            with open(defaults_file, "r") as f:
                return json.load(f)
        except:
            pass
    return {}

def save_context_defaults(defaults: Dict[str, str]) -> None:
    """Save default context file mappings to defaults.json."""
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    import json
    with open(defaults_file, "w") as f:
        json.dump(defaults, f, indent=2)

def load_project_context_settings(project_id: str) -> Dict[str, str]:
    """Load context file settings for a specific project."""
    config = load_config()
    return config.get("project_context_settings", {}).get(project_id, {})

def save_project_context_settings(project_id: str, settings: Dict[str, str]) -> None:
    """Save context file settings for a specific project."""
    config = load_config()
    if "project_context_settings" not in config:
        config["project_context_settings"] = {}
    config["project_context_settings"][project_id] = settings
    save_config(config)

def save_context_file(file_id: str, file_type: str, name: str, content: str) -> None:
    """Save a context file to disk as .md file."""
    # Sanitize name for filename
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_").strip()
    if not safe_name:
        safe_name = "untitled"
    # New format: {name}_{type}.md
    filename = f"{safe_name}_{file_type}.md"
    filepath = CONTEXT_FILES_DIR / filename
    with open(filepath, "w") as f:
        f.write(content)

def delete_context_file(file_id: str) -> bool:
    """Delete a context file from disk."""
    # file_id is in format {name}_{type}
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.stem == file_id:
            md_file.unlink()
            return True
    return False

class ContextFile(BaseModel):
    name: str
    type: str
    content: str

@app.get("/api/file-types")
async def get_file_types_endpoint():
    """Get the list of file types."""
    return get_file_types()

@app.get("/api/context-files")
async def get_context_files():
    """Get all context files."""
    return load_context_files()

@app.post("/api/context-files")
async def add_context_file(file: ContextFile):
    """Add a new context file."""
    # New ID format: {name}_{type}
    file_id = f"{file.name}_{file.type}"
    save_context_file(file_id, file.type, file.name, file.content)
    return {
        "id": file_id,
        "name": file.name,
        "type": file.type,
        "content": file.content
    }

@app.put("/api/context-files/{file_id}")
async def update_context_file(file_id: str, file: ContextFile):
    """Update an existing context file."""
    # Delete old file and create new one
    delete_context_file(file_id)
    # Use new ID format: {name}_{type}
    new_file_id = f"{file.name}_{file.type}"
    save_context_file(new_file_id, file.type, file.name, file.content)
    return {
        "id": new_file_id,
        "name": file.name,
        "type": file.type,
        "content": file.content
    }

@app.delete("/api/context-files/{file_id}")
async def delete_context_file_endpoint(file_id: str):
    """Delete a context file."""
    delete_context_file(file_id)
    return {"status": "deleted"}

@app.post("/api/context-files/{file_id}/set-default")
async def set_context_file_default(file_id: str):
    """Set a context file as the default for its type."""
    files = load_context_files()
    # Find the file
    target_file = None
    for f in files:
        if f["id"] == file_id:
            target_file = f
            break
    
    if not target_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Load current defaults
    defaults = load_context_defaults()
    # Set this file as default for its type
    defaults[target_file["type"]] = target_file["name"]
    save_context_defaults(defaults)
    
    return {"status": "success", "type": target_file["type"], "name": target_file["name"]}

@app.get("/api/context-files/defaults")
async def get_context_defaults():
    """Get default context files by type."""
    return load_context_defaults()

@app.get("/api/projects/{project_id}/context-settings")
async def get_project_context_settings(project_id: str):
    """Get context file settings for a project."""
    settings = load_project_context_settings(project_id)
    # If no settings, return defaults
    if not settings:
        settings = load_context_defaults()
    return settings

@app.post("/api/projects/{project_id}/context-settings")
async def update_project_context_settings(project_id: str, settings: Dict[str, str]):
    """Update context file settings for a project."""
    save_project_context_settings(project_id, settings)
    return {"status": "success", "project_id": project_id, "settings": settings}

# Projects API

class ProjectRequest(BaseModel):
    name: str
    user: str

def load_projects() -> List[Dict[str, Any]]:
    """Load projects from folders."""
    projects = []
    if not PROJECTS_DIR.exists():
        return projects
    
    for user_dir in PROJECTS_DIR.iterdir():
        if user_dir.is_dir():
            user_name = user_dir.name
            for project_dir in user_dir.iterdir():
                if project_dir.is_dir():
                    projects.append({
                        "id": f"{user_name}_{project_dir.name}",
                        "name": project_dir.name,
                        "user": user_name,
                        "path": str(project_dir)
                    })
    return projects

def create_project_folder(user: str, name: str) -> Dict[str, Any]:
    """Create a new project folder."""
    user_dir = PROJECTS_DIR / user
    project_dir = user_dir / name
    
    if project_dir.exists():
        raise HTTPException(status_code=400, detail="Project already exists")
    
    project_dir.mkdir(parents=True, exist_ok=True)
    
    return {
        "id": f"{user}_{name}",
        "name": name,
        "user": user,
        "path": str(project_dir)
    }

def delete_project_folder(user: str, name: str) -> bool:
    """Delete a project folder."""
    project_dir = PROJECTS_DIR / user / name
    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)
        return True
    return False

@app.get("/projects.html")
async def serve_projects():
    return FileResponse("static/projects.html")

@app.get("/api/projects")
async def get_projects():
    """Get all projects."""
    return load_projects()

@app.post("/api/projects")
async def create_project(request: ProjectRequest):
    """Create a new project."""
    # Check if project already exists
    existing = load_projects()
    for p in existing:
        if p["name"] == request.name and p["user"] == request.user:
            raise HTTPException(status_code=400, detail="Project already exists")
    
    return create_project_folder(request.user, request.name)

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    # Parse user and name from project (_id using helpersupports hyphen and underscore)
    user, name = parse_project_id(project_id)
    if not user or not name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    if delete_project_folder(user, name):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Project not found")

# Run Pod Test API
class RunPodRequest(BaseModel):
    project_id: str
    code: str

@app.post("/api/run-pod-test")
async def run_pod_test(request: RunPodRequest):
    """Run code in an isolated pod."""
    from services.run_pod_test import run_code_in_pod
    
    # Get project path and extract user_name and project_name using helper
    # Supports both hyphen (test-project) and underscore (test_project) formats
    project_path = None
    user_name = None
    project_name = None
    if request.project_id:
        user_name, project_name = parse_project_id(request.project_id)
        if user_name and project_name:
            project_path = str(PROJECTS_DIR / user_name / project_name)
    
    result = run_code_in_pod(request.code, project_path, user_name, project_name)
    return result


# Kill Pod API
class KillPodRequest(BaseModel):
    user_name: str
    project_name: str


@app.post("/api/kill-pod")
async def kill_pod_endpoint(request: KillPodRequest):
    """Kill a pod by user and project name."""
    from services.run_pod_test import kill_pod
    
    result = kill_pod(request.user_name, request.project_name)
    return result


# Static files
@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    return FileResponse(f"static/{file_path}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=51164)
