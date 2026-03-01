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
from pathlib import Path
import json
import os
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
from services import trace_log
from services import pre_llm
from services import project_settings_db

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
        "default_model": cfg.get("default_model", "MiniMax-M2.5"),
        "default_user": cfg.get("default_user", "default")
    }


@app.get("/api/user")
async def get_current_user():
    """Get current user from config."""
    cfg = load_config()
    return {"user": cfg.get("default_user", "default")}


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
# Simple Chat Endpoint (No Code Execution)
# =============================================================================

class SimpleChatRequest(BaseModel):
    prompt: str
    model: str = "MiniMax-M2.5"
    messages: List[Dict[str, str]] = []


@app.post("/api/chat")
async def simple_chat(request: SimpleChatRequest):
    """
    Simple chat endpoint - just LLM conversation, no code execution.
    Use this for chat mode, use terminal for command execution.
    """
    # Get API key
    if "minimax" in request.model.lower():
        api_key = get_api_key("minimax")
        if not api_key:
            raise HTTPException(status_code=401, detail="MiniMax API key not configured")
    else:
        api_key = get_api_key("openai")
        if not api_key:
            raise HTTPException(status_code=401, detail="OpenAI API key not configured")
    
    # Build messages
    messages = request.messages + [{"role": "user", "content": request.prompt}]
    
    # Call LLM
    result = await llm_providers.call_llm(
        request.model,
        messages,
        0.7,
        4096,
        api_key
    )
    
    llm_output = result["choices"][0]["message"]["content"]
    
    return {
        "type": "chat",
        "output": llm_output,
        "model": request.model
    }

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
    
    # Ensure pre-llm context is always included in the system prompt
    # This guarantees the pre-llm instructions are always part of LLM calls
    pre_llm_context = context_files_service.get_pre_llm_context()
    if pre_llm_context:
        # Check if pre-llm is already in context_files (it should be, but ensure it's included)
        has_pre_llm = any(ctx.get('type') == 'pre-llm' for ctx in context_files)
        if not has_pre_llm:
            # Add pre-llm context to the list if not present
            context_files.append(pre_llm_context)
    
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
        
        while state.is_running or last_index < len(trace_logger):
            # Check for new entries - use get_all() for thread-safe access
            all_entries = trace_logger.get_all()
            if last_index < len(all_entries):
                # Send new entries
                new_entries = all_entries[last_index:]
                for entry in new_entries:
                    yield f"data: {json.dumps(entry)}\n\n"
                    last_index += 1
            
            # Small delay to avoid tight loop
            await asyncio.sleep(0.5)
        
        # Send done signal
        yield f"data: {json.dumps({'type': 'done', 'label': 'Stream Complete', 'data': {}})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/trace/start")
async def start_trace():
    """
    Start a new trace session and get a trace ID.
    Returns a trace ID that can be used to identify this trace session.
    """
    trace_id = trace_log.create_trace_id()
    # Set trace ID for the logger
    trace_logger.set_trace_id(trace_id)
    # Clear previous trace
    trace_logger.clear()
    return {"trace_id": trace_id}


@app.get("/api/trace/{trace_id}")
async def get_trace(trace_id: str, since_index: int = 0):
    """
    Get trace entries for a specific trace ID from the persistent log file.
    This allows the frontend to read trace entries even after page refresh.
    
    Args:
        trace_id: The trace session ID
        since_index: Return entries from this index onwards
    """
    entries = trace_log.get_trace_entries(trace_id, since_index)
    return {"entries": entries, "trace_id": trace_id}


@app.delete("/api/trace/{trace_id}")
async def clear_trace_id(trace_id: str):
    """Clear trace entries for a specific trace ID."""
    trace_log.clear_trace_log(trace_id)
    return {"status": "cleared", "trace_id": trace_id}


@app.post("/api/trace/clear")
async def clear_trace():
    """Clear all trace entries from both in-memory logger and persistent file."""
    # Clear in-memory logger
    trace_logger.clear()
    
    # Also clear the persistent trace file
    try:
        from services.trace_log import clear_trace_log
        clear_trace_log()  # Clear all entries from trace.json
    except Exception as e:
        pass
    
    return {"status": "cleared"}

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

@app.get("/agents.html")
async def serve_agents():
    return FileResponse("static/agents.html")

@app.get("/command.html")
async def serve_command():
    return FileResponse("static/command.html")

@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    return FileResponse(f"static/{file_path}")

# =============================================================================
# Agents Endpoints
# =============================================================================

AGENTS_FILE = "agents.json"

def _load_agents():
    if os.path.exists(AGENTS_FILE):
        with open(AGENTS_FILE, 'r') as f:
            return json.load(f)
    return []

def _save_agents(agents):
    with open(AGENTS_FILE, 'w') as f:
        json.dump(agents, f, indent=2)

class AgentRequest(BaseModel):
    name: str
    role: str = "assistant"
    status: str = "active"
    description: str = ""

@app.get("/api/agents")
async def get_agents():
    """Get all agents."""
    return _load_agents()

@app.post("/api/agents")
async def create_agent(request: AgentRequest):
    """Create a new agent."""
    agents = _load_agents()
    agent_id = str(uuid.uuid4())[:8]
    agent = {
        "id": agent_id,
        "name": request.name,
        "role": request.role,
        "status": request.status,
        "description": request.description,
    }
    agents.append(agent)
    _save_agents(agents)
    return agent

@app.put("/api/agents/{agent_id}")
async def update_agent(agent_id: str, request: AgentRequest):
    """Update an existing agent."""
    agents = _load_agents()
    for agent in agents:
        if agent["id"] == agent_id:
            agent["name"] = request.name
            agent["role"] = request.role
            agent["status"] = request.status
            agent["description"] = request.description
            _save_agents(agents)
            return agent
    raise HTTPException(status_code=404, detail="Agent not found")

@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent."""
    agents = _load_agents()
    agents = [a for a in agents if a["id"] != agent_id]
    _save_agents(agents)
    return {"status": "deleted"}

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
    
    # Check if file already exists
    existing_files = context_files_service.load_context_files()
    existing_file = next((f for f in existing_files if f["id"] == file_id), None)
    
    if existing_file:
        # Update existing file instead of creating duplicate
        context_files_service.save_context_file(file_id, file.type, file.name, file.content)
        return {
            "id": file_id,
            "name": file.name,
            "type": file.type,
            "content": file.content,
            "status": "updated"
        }
    
    context_files_service.save_context_file(file_id, file.type, file.name, file.content)
    return {
        "id": file_id,
        "name": file.name,
        "type": file.type,
        "content": file.content,
        "status": "created"
    }


@app.put("/api/context-files/{file_id}")
async def update_context_file(file_id: str, file: ContextFileRequest):
    """Update an existing context file."""
    import logging
    logger = logging.getLogger(__name__)
    
    # Use new ID format: {name}_{type}
    new_file_id = f"{file.name}_{file.type}"
    
    logger.info(f"[CONTEXT FILES] PUT update: old_id={file_id}, new_id={new_file_id}, name={file.name}, type={file.type}")
    
    # If name/type changed, handle the file renaming
    if new_file_id != file_id:
        logger.info(f"[CONTEXT FILES] ID changed, deleting old file: {file_id}")
        # First, check if a file already exists with the new ID
        existing_files = context_files_service.load_context_files()
        existing_file = next((f for f in existing_files if f["id"] == new_file_id), None)
        
        if existing_file:
            logger.info(f"[CONTEXT FILES] Conflicting file found, deleting: {new_file_id}")
            # Update existing file instead of creating new one
            context_files_service.delete_context_file(new_file_id)
        
        # Delete the old file
        context_files_service.delete_context_file(file_id)
    
    # Save the file (either with new ID or same ID)
    logger.info(f"[CONTEXT FILES] Saving file: {new_file_id}")
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
async def get_projects(user: str = None):
    """Get all projects, optionally filtered by user."""
    if user:
        return projects_service.get_user_projects(user)
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
# Project Pods Endpoints
# =============================================================================

@app.get("/api/projects/{project_id}/pods")
async def get_project_pods(project_id: str):
    """Get all pods for a project."""
    pods = pre_llm.get_project_pods(project_id)
    return {"pods": pods, "project_id": project_id}


@app.post("/api/projects/{project_id}/pods/start")
async def start_project_pod(project_id: str):
    """Start or create a pod for the project."""
    user_name, project_name = parse_project_id(project_id)
    if not user_name or not project_name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Get project path
    project_path = str(PROJECTS_DIR / user_name / project_name)
    
    result = pre_llm.ensure_pod_ready(user_name, project_name, project_path)
    return result


@app.post("/api/projects/{project_id}/pods/kill")
async def kill_project_pod(project_id: str):
    """Kill a pod for the project."""
    user_name, project_name = parse_project_id(project_id)
    if not user_name or not project_name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    result = pre_llm.kill_project_pod(user_name, project_name)
    return result


@app.post("/api/projects/{project_id}/pods/remove")
async def remove_project_pod(project_id: str):
    """Remove (delete) a pod for the project."""
    user_name, project_name = parse_project_id(project_id)
    if not user_name or not project_name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    result = pre_llm.remove_project_pod(user_name, project_name)
    return result


@app.post("/api/projects/{project_id}/pods/reset")
async def reset_project_pod(project_id: str):
    """Reset a pod for the project - remove and recreate with fresh requirements."""
    user_name, project_name = parse_project_id(project_id)
    if not user_name or not project_name:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Get project path
    project_path = str(PROJECTS_DIR / user_name / project_name)
    
    result = pre_llm.reset_project_pod(user_name, project_name, project_path)
    return result

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
# Pod Name-based Endpoints (for UI buttons)
# =============================================================================

@app.post("/api/pods/{pod_name}/start")
async def start_pod_by_name(pod_name: str):
    """Start a pod by its name."""
    # Parse pod name to get user/project info
    # Format: {user}-{project}-pod
    if pod_name.endswith('-pod'):
        base_name = pod_name[:-4]  # Remove '-pod' suffix
        parts = base_name.rsplit('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            result = pre_llm.start_pod(user_name, project_name)
            return result
    
    return {"success": False, "message": "Invalid pod name format"}


@app.post("/api/pods/{pod_name}/kill")
async def kill_pod_by_name(pod_name: str):
    """Kill a pod by its name."""
    # Parse pod name to get user/project info
    # Format: {user}-{project}-pod
    if pod_name.endswith('-pod'):
        base_name = pod_name[:-4]  # Remove '-pod' suffix
        parts = base_name.rsplit('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            result = pre_llm.kill_project_pod(user_name, project_name)
            return result
    
    return {"success": False, "message": "Invalid pod name format"}


@app.post("/api/pods/{pod_name}/remove")
async def remove_pod_by_name(pod_name: str):
    """Remove a pod by its name."""
    # Parse pod name to get user/project info
    # Format: {user}-{project}-pod
    if pod_name.endswith('-pod'):
        base_name = pod_name[:-4]  # Remove '-pod' suffix
        parts = base_name.rsplit('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            result = pre_llm.remove_project_pod(user_name, project_name)
            return result
    
    return {"success": False, "message": "Invalid pod name format"}


@app.post("/api/pods/{pod_name}/reset")
async def reset_pod_by_name(pod_name: str):
    """Reset a pod by its name - remove and recreate with fresh requirements."""
    # Parse pod name to get user/project info
    # Format: {user}-{project}-pod
    if pod_name.endswith('-pod'):
        base_name = pod_name[:-4]  # Remove '-pod' suffix
        parts = base_name.rsplit('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            # Get project path
            project_path = str(PROJECTS_DIR / user_name / project_name)
            result = pre_llm.reset_project_pod(user_name, project_name, project_path)
            return result
    
    return {"success": False, "message": "Invalid pod name format"}


# =============================================================================
# Terminal Endpoints (Interactive Command Mode)
# =============================================================================
import uuid
from services import terminal as terminal_service
from services import secrets as secrets_service


class TerminalStartRequest(BaseModel):
    cwd: Optional[str] = "/home/aeli/projects/aelilobster"


class TerminalCommandRequest(BaseModel):
    command: str


class TerminalInputRequest(BaseModel):
    input: str


@app.post("/api/terminal/start")
async def start_terminal(request: TerminalStartRequest):
    """Start an interactive terminal session."""
    session_id = str(uuid.uuid4())
    session = terminal_service.create_session(session_id, request.cwd or "/home/aeli/projects/aelilobster")
    result = session.start()
    return result


@app.get("/api/terminal/sessions")
async def list_terminal_sessions():
    """List all active terminal sessions."""
    return terminal_service.list_sessions()


@app.post("/api/terminal/{session_id}/exec")
async def terminal_exec(session_id: str, request: TerminalCommandRequest):
    """Execute a command in an existing terminal session."""
    # Log to trace
    trace_logger.add(
        "terminal_command",
        f"Command: {request.command[:50]}",
        {"session_id": session_id, "command": request.command}
    )
    
    result = terminal_service.execute_in_terminal(session_id, request.command)
    
    # Log result to trace
    trace_logger.add(
        "terminal_result",
        f"Exit: {result.get('exit_code', -1)}",
        {"session_id": session_id, "success": result.get("success", False)}
    )
    
    return result


@app.post("/api/terminal/{session_id}/input")
async def terminal_input(session_id: str, request: TerminalInputRequest):
    """Send interactive input to a terminal session."""
    # Log to trace
    trace_logger.add(
        "terminal_input",
        "User Input",
        {"session_id": session_id, "input": request.input}
    )
    
    result = terminal_service.send_terminal_input(session_id, request.input)
    
    return result


@app.post("/api/terminal/{session_id}/close")
async def close_terminal(session_id: str):
    """Close a terminal session."""
    result = terminal_service.close_terminal_session(session_id)
    
    # Log to trace
    trace_logger.add(
        "terminal_close",
        "Session Closed",
        {"session_id": session_id, "result": result}
    )
    
    return result


# =============================================================================
# Project Secrets API
# =============================================================================

class SecretCreateRequest(BaseModel):
    name: str
    value: str
    tags: Optional[List[str]] = []


class SecretUpdateRequest(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    tags: Optional[List[str]] = None


@app.get("/api/projects/{project_id}/secrets")
async def get_project_secrets(project_id: str):
    """Get all secrets for a project (without values)."""
    secrets = secrets_service.get_secrets(project_id)
    return {"success": True, "secrets": secrets}


@app.post("/api/projects/{project_id}/secrets")
async def create_project_secret(project_id: str, request: SecretCreateRequest):
    """Create a new secret for a project."""
    result = secrets_service.create_secret(
        project_id=project_id,
        name=request.name,
        value=request.value,
        tags=request.tags
    )
    # Never log the secret value
    trace_logger.add(
        "secret_create",
        "Secret Created",
        {"project_id": project_id, "name": request.name, "tags": request.tags}
    )
    return result


@app.put("/api/projects/{project_id}/secrets/{secret_id}")
async def update_project_secret(project_id: str, secret_id: str, request: SecretUpdateRequest):
    """Update a secret."""
    # Don't log the value
    result = secrets_service.update_secret(
        project_id=project_id,
        secret_id=secret_id,
        name=request.name,
        value=request.value,
        tags=request.tags
    )
    if result.get("success"):
        trace_logger.add(
            "secret_update",
            "Secret Updated",
            {"project_id": project_id, "secret_id": secret_id, "name": request.name}
        )
    return result


@app.delete("/api/projects/{project_id}/secrets/{secret_id}")
async def delete_project_secret(project_id: str, secret_id: str):
    """Delete a secret."""
    result = secrets_service.delete_secret(project_id, secret_id)
    if result.get("success"):
        trace_logger.add(
            "secret_delete",
            "Secret Deleted",
            {"project_id": project_id, "secret_id": secret_id}
        )
    return result


# =============================================================================
# Project Settings (stored in context file - "### Project Settings" section)
# =============================================================================

class ProjectSettings(BaseModel):
    chat_mode: Optional[str] = None  # "chat" or "terminal"
    trace_panel_width: Optional[int] = None


def _parse_settings_from_context_file(content: str) -> Dict[str, Any]:
    """Parse settings from context file content.
    
    Settings are stored in the "### Project Settings" section as:
    - **key**: `value`
    """
    settings = {}
    
    # Find the Project Settings section
    lines = content.split('\n')
    in_settings_section = False
    
    for line in lines:
        # Check for section header
        if '### Project Settings' in line:
            in_settings_section = True
            continue
        
        # Stop at next section (## or ###)
        if in_settings_section and line.strip().startswith('##'):
            break
        
        # Parse key: value pairs - format: - **key**: `value`
        if in_settings_section and '**' in line and ':' in line:
            # Extract key between ** **
            key_match = line.split('**')
            if len(key_match) >= 3:
                key = key_match[1]
                # Extract value between ` `
                value_match = line.split('`')
                if len(value_match) >= 2:
                    value = value_match[1]
                    settings[key] = value
    
    return settings


def _update_settings_in_context_file(content: str, settings: Dict[str, Any]) -> str:
    """Update settings in context file content.
    
    Settings are stored in the "### Project Settings" section.
    """
    lines = content.split('\n')
    new_lines = []
    in_settings_section = False
    # Track which keys have been processed to skip duplicates
    processed_keys = set()
    
    for line in lines:
        # Check for section header
        if '### Project Settings' in line:
            in_settings_section = True
            new_lines.append(line)
            continue
        
        # End of settings section - only add settings that weren't in the file at all
        if in_settings_section and line.strip().startswith('##'):
            for key, value in settings.items():
                if key not in processed_keys:
                    new_lines.append(f"- **{key}**: `{value}`")
                    processed_keys.add(key)
            in_settings_section = False
            new_lines.append(line)
            continue
        
        # Update existing setting (skip duplicates - don't add them)
        if in_settings_section and ':**' in line:
            import re
            match = re.search(r'\*\*(\w+)\*\*:', line)
            if match:
                key = match.group(1)
                # Check processed_keys FIRST - if already processed, skip (duplicate)
                if key in processed_keys:
                    # This is a duplicate entry for a key we've already processed - SKIP it
                    continue
                elif key in settings:
                    # Update with new value
                    new_lines.append(f"- **{key}**: `{settings[key]}`")
                    processed_keys.add(key)
                    continue
        
        new_lines.append(line)
    
    # If we never hit the end of settings section, add remaining settings at end
    if in_settings_section and settings:
        new_lines.append("")
        for key, value in settings.items():
            if key not in processed_keys:
                new_lines.append(f"- **{key}**: `{value}`")
                processed_keys.add(key)
    
    return '\n'.join(new_lines)


@app.get("/api/projects/{project_id}/settings")
async def get_project_settings(project_id: str):
    """Get project settings - from database for chat_mode/chat_window_size, else from context file."""
    try:
        # First, try to get chat_mode and chat_window_size from database
        db_settings = project_settings_db.get_project_settings(project_id)
        
        # Build settings dict - database takes priority for these two settings
        settings = {}
        
        # Get from database (these take priority) - use underscore for frontend compatibility
        if 'chat_mode' in db_settings:
            settings['chat_mode'] = db_settings['chat_mode']
        if 'chat_window_size' in db_settings:
            settings['chat_window_size'] = db_settings['chat_window_size']
        
        # For other settings, fall back to context file
        context_settings = context_files_service.load_project_context_settings(project_id)
        if not context_settings:
            context_settings = context_files_service.load_context_defaults()
        
        requirements_name = context_settings.get('requirements')
        
        if requirements_name:
            requirements_file_id = f"{requirements_name}_requirements"
            context_files = context_files_service.load_context_files()
            req_file = next((f for f in context_files if f['id'] == requirements_file_id), None)
            
            if req_file:
                file_settings = _parse_settings_from_context_file(req_file.get('content', ''))
                # Only add settings that are NOT already in database
                for key, value in file_settings.items():
                    if key not in ('chat_mode', 'chat_window_size', 'chat-mode', 'chat-size-setting'):
                        settings[key] = value
        
        return {"settings": settings}
        
    except Exception as e:
        return {"settings": {}, "error": str(e)}


@app.put("/api/projects/{project_id}/settings")
async def update_project_settings(project_id: str, settings: ProjectSettings):
    """Update project settings - save chat_mode/chat_window_size to database, others to context file."""
    try:
        # Save chat_mode and chat_window_size to DATABASE (not context file)
        if settings.chat_mode is not None:
            project_settings_db.set_setting(project_id, 'chat_mode', settings.chat_mode)
        if settings.trace_panel_width is not None:
            project_settings_db.set_setting(project_id, 'chat_window_size', str(settings.trace_panel_width))
        
        # For other settings, still save to context file
        context_settings = context_files_service.load_project_context_settings(project_id)
        if not context_settings:
            context_settings = context_files_service.load_context_defaults()
        
        requirements_name = context_settings.get('requirements')
        
        existing_settings = {}
        if requirements_name:
            requirements_file_id = f"{requirements_name}_requirements"
            context_files = context_files_service.load_context_files()
            req_file = next((f for f in context_files if f['id'] == requirements_file_id), None)
            
            if req_file:
                existing_settings = _parse_settings_from_context_file(req_file.get('content', ''))
                
                # Update non-chat settings
                # Note: chat-mode and chat-size-setting now come from database, not context file
                
                # Update the content
                updated_content = _update_settings_in_context_file(req_file.get('content', ''), existing_settings)
                
                # Save back to context file
                file_type = "requirements"
                context_files_service.save_context_file(requirements_file_id, file_type, requirements_name, updated_content)
        
        # Return combined settings (from database + context file)
        return_settings = project_settings_db.get_project_settings(project_id)
        return_settings['chat-mode'] = return_settings.get('chat_mode', 'chat')
        return_settings['chat-size-setting'] = return_settings.get('chat_window_size', '300')
        
        return {"success": True, "settings": return_settings}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=51164)
