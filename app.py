"""
Aelilobster - Main FastAPI Application

This is the entry point for the Aelilobster application.
All business logic has been moved to modular services in the services/ directory.
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import asyncio

# =============================================================================
# App Setup
# =============================================================================

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# Import Services
# =============================================================================

from services import config
from services import llm_providers
from services import context_files as context_files_service
from services import projects as projects_service
from services import pod_manager
from services.command_service import is_linux_command, execute_command
from services.code_stripper import extract_code_blocks
from services.run_pod_test import run_code_in_pod
from services.looper import (
    run_looper as run_looper_service,
    set_trace_callback,
    get_looper_state,
    trace_logger,
)

# Alias for backward compatibility
load_config = config.load_config
save_config = config.save_config
get_api_key = config.get_api_key
parse_project_id = config.parse_project_id
PROJECTS_DIR = config.PROJECTS_DIR

# =============================================================================
# Health Check
# =============================================================================

@app.get("/health")
async def health():
    return {"status": "healthy"}

# =============================================================================
# Config Endpoints
# =============================================================================

class ConfigRequest(BaseModel):
    minimax_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    default_model: Optional[str] = None


@app.get("/config")
async def get_config():
    """Get current configuration (without exposing API keys)."""
    cfg = load_config()
    return {
        "has_minimax_key": bool(cfg.get("minimax_api_key")),
        "has_openai_key": bool(cfg.get("openai_api_key")),
        "default_model": cfg.get("default_model", "MiniMax-M2.5")
    }


@app.post("/config")
async def save_config_endpoint(request: ConfigRequest):
    """Save configuration."""
    cfg = load_config()
    
    if request.minimax_api_key is not None:
        cfg["minimax_api_key"] = request.minimax_api_key
    if request.openai_api_key is not None:
        cfg["openai_api_key"] = request.openai_api_key
    if request.default_model is not None:
        cfg["default_model"] = request.default_model
    
    save_config(cfg)
    return {"status": "saved"}

# =============================================================================
# Command Execution Endpoint
# =============================================================================

class CommandRequest(BaseModel):
    command: str


@app.post("/execute")
async def execute_command_endpoint(request: CommandRequest):
    """Execute a shell command and return the output."""
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

# =============================================================================
# Chat Completions Endpoint
# =============================================================================

class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2048
    stream: Optional[bool] = False


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
    
    # Convert messages to dict format
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # Route to appropriate handler
    result = await llm_providers.call_llm(
        request.model,
        messages,
        request.temperature,
        request.max_tokens,
        api_key
    )
    
    return result

# =============================================================================
# Process Prompt Endpoint
# =============================================================================

class PromptRequest(BaseModel):
    prompt: str
    model: str = "MiniMax-M2.5"
    messages: List[Dict[str, str]] = []
    project_id: Optional[str] = None


@app.post("/prompt")
async def process_prompt(request: PromptRequest):
    """Process a prompt - execute as command or pass to LLM with code execution."""
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
        
        # Call LLM
        llm_result = await llm_providers.call_llm(
            request.model,
            messages,
            0.7,
            4096,
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

# =============================================================================
# Looper Endpoints
# =============================================================================

class LooperRequest(BaseModel):
    prompt: str
    model: str = "MiniMax-M2.5"
    messages: List[Dict[str, str]] = []
    project_id: Optional[str] = None
    user_name: Optional[str] = None
    project_name: Optional[str] = None


@app.post("/api/looper/run")
async def run_looper(request: LooperRequest):
    """Run the looper - a loop that handles: call API -> code stripper -> run pod test -> results -> debugger"""
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
        cfg = load_config()
        user_name = cfg.get("default_user", "default")
    
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
    call_llm_func = llm_providers.get_llm_call_function(request.model, api_key)
    
    # Load context files (debugger context)
    context_files = context_files_service.load_context_files()
    
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
    state = get_looper_state()
    state.stop()
    
    return {"status": "stopped", "was_running": state.is_running}


@app.get("/api/looper/trace-stream")
async def trace_stream():
    """
    Server-Sent Events endpoint for real-time trace updates.
    Frontend connects to this to receive trace entries as they're generated.
    """
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

# =============================================================================
# Static Files
# =============================================================================

@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

@app.get("/config.html")
async def serve_config():
    return FileResponse("static/config.html")

@app.get("/files.html")
async def serve_files():
    return FileResponse("static/files.html")

@app.get("/projects.html")
async def serve_projects():
    return FileResponse("static/projects.html")

@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    return FileResponse(f"static/{file_path}")

# =============================================================================
# Context Files Endpoints
# =============================================================================

class ContextFileRequest(BaseModel):
    name: str
    type: str
    content: str


@app.get("/api/file-types")
async def get_file_types_endpoint():
    """Get the list of file types."""
    return context_files_service.get_file_types()


@app.get("/api/context-files")
async def get_context_files():
    """Get all context files."""
    return context_files_service.load_context_files()


@app.post("/api/context-files")
async def add_context_file(file: ContextFileRequest):
    """Add a new context file."""
    # New ID format: {name}_{type}
    file_id = f"{file.name}_{file.type}"
    context_files_service.save_context_file(file_id, file.type, file.name, file.content)
    return {
        "id": file_id,
        "name": file.name,
        "type": file.type,
        "content": file.content
    }


@app.put("/api/context-files/{file_id}")
async def update_context_file(file_id: str, file: ContextFileRequest):
    """Update an existing context file."""
    # Delete old file and create new one
    context_files_service.delete_context_file(file_id)
    # Use new ID format: {name}_{type}
    new_file_id = f"{file.name}_{file.type}"
    context_files_service.save_context_file(new_file_id, file.type, file.name, file.content)
    return {
        "id": new_file_id,
        "name": file.name,
        "type": file.type,
        "content": file.content
    }


@app.delete("/api/context-files/{file_id}")
async def delete_context_file_endpoint(file_id: str):
    """Delete a context file."""
    context_files_service.delete_context_file(file_id)
    return {"status": "deleted"}


@app.post("/api/context-files/{file_id}/set-default")
async def set_context_file_default(file_id: str):
    """Set a context file as the default for its type."""
    result = context_files_service.set_context_file_default(file_id)
    return result


@app.get("/api/context-files/defaults")
async def get_context_defaults():
    """Get default context files by type."""
    return context_files_service.load_context_defaults()


@app.get("/api/projects/{project_id}/context-settings")
async def get_project_context_settings(project_id: str):
    """Get context file settings for a project."""
    settings = context_files_service.load_project_context_settings(project_id)
    # If no settings, return defaults
    if not settings:
        settings = context_files_service.load_context_defaults()
    return settings


@app.post("/api/projects/{project_id}/context-settings")
async def update_project_context_settings(project_id: str, settings: Dict[str, str]):
    """Update context file settings for a project."""
    context_files_service.save_project_context_settings(project_id, settings)
    return {"status": "success", "project_id": project_id, "settings": settings}

# =============================================================================
# Projects Endpoints
# =============================================================================

class ProjectRequest(BaseModel):
    name: str
    user: str


@app.get("/api/projects")
async def get_projects():
    """Get all projects."""
    return projects_service.load_projects()


@app.post("/api/projects")
async def create_project(request: ProjectRequest):
    """Create a new project."""
    # Check if project already exists
    existing = projects_service.load_projects()
    for p in existing:
        if p["name"] == request.name and p["user"] == request.user:
            raise HTTPException(status_code=400, detail="Project already exists")
    
    return projects_service.create_project_folder(request.user, request.name)


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    # Parse user and name from project_id
    user, name = parse_project_id(project_id)
    if not user or not name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    if projects_service.delete_project_folder(user, name):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Project not found")

# =============================================================================
# Pod Management Endpoints
# =============================================================================

class RunPodRequest(BaseModel):
    project_id: str
    code: str


@app.post("/api/run-pod-test")
async def run_pod_test(request: RunPodRequest):
    """Run code in an isolated pod."""
    result = pod_manager.run_pod_test(
        code=request.code,
        project_id=request.project_id
    )
    return result


class KillPodRequest(BaseModel):
    user_name: str
    project_name: str


@app.post("/api/kill-pod")
async def kill_pod_endpoint(request: KillPodRequest):
    """Kill a pod by user and project name."""
    result = pod_manager.kill_pod(request.user_name, request.project_name)
    return result

# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=51164)
