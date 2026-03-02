"""
Pre-LLM Service
Called before LLM requests to ensure project pod is ready.
Checks if pod is running, if not, spins it up.
"""
from typing import Dict, Any, Optional
import subprocess
import re
from pathlib import Path
from services.run_pod_test import get_pod_name, get_pod_settings, allocate_port
from services.naming import parse_project_id


def find_requirements_file(project_path: str) -> str:
    """Find requirements.txt or requirements.md in project folder."""
    if not project_path:
        return None
    
    project_dir = Path(project_path)
    if not project_dir.exists():
        return None
    
    # Check for requirements.txt
    req_txt = project_dir / "requirements.txt"
    if req_txt.exists():
        return str(req_txt)
    
    # Check for requirements.md
    req_md = project_dir / "requirements.md"
    if req_md.exists():
        return str(req_md)
    
    return None


def parse_requirements_from_file(req_file: str) -> list:
    """Parse requirements from requirements.txt or requirements.md."""
    try:
        with open(req_file, 'r') as f:
            content = f.read()
        
        # Extract pip requirements from markdown or plain text
        requirements = []
        for line in content.split('\n'):
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            # Remove markdown code block markers
            line = re.sub(r'^```\w*$', '', line)
            line = line.strip()
            if line and not line.startswith('-') and not line.startswith('*'):
                requirements.append(line)
        
        return requirements
    except:
        return []


def install_requirements_in_running_pod(pod_name: str, requirements: list) -> Dict[str, Any]:
    """Install requirements in an already running pod using podman exec."""
    if not requirements:
        return {"success": True, "message": "No requirements to install", "output": ""}
    
    # Create pip install command - use --break-system-packages for Ubuntu 24.04
    reqs = ' '.join(requirements)
    cmd = f"pip3 install --break-system-packages --no-cache-dir {reqs}"
    
    result = subprocess.run(
        ['podman', 'exec', pod_name, 'sh', '-c', cmd],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    if result.returncode == 0:
        return {
            "success": True,
            "message": f"Installed {len(requirements)} requirements",
            "output": result.stdout
        }
    else:
        return {
            "success": False,
            "message": f"Failed to install requirements: {result.stderr}",
            "output": result.stdout + result.stderr
        }


def install_project_requirements(pod_name: str, project_path: str) -> Dict[str, Any]:
    """Find and install requirements from project directory into the running pod."""
    if not project_path:
        return {"success": True, "message": "No project path provided", "requirements_installed": False}
    
    req_file = find_requirements_file(project_path)
    if not req_file:
        return {"success": True, "message": "No requirements file found", "requirements_installed": False}
    
    requirements = parse_requirements_from_file(req_file)
    if not requirements:
        return {"success": True, "message": "No requirements found in file", "requirements_installed": False}
    
    print(f"[PRE_LLM] Installing requirements from {Path(req_file).name}: {requirements}")
    result = install_requirements_in_running_pod(pod_name, requirements)
    
    return {
        "success": result["success"],
        "message": result["message"],
        "requirements_installed": result["success"],
        "requirements_count": len(requirements),
        "output": result.get("output", "")
    }


def is_pod_running(user_name: str, project_name: str) -> bool:
    """
    Check if a pod is currently running for the given user/project.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        True if pod is running, False otherwise
    """
    pod_name = get_pod_name(user_name, project_name)
    
    result = subprocess.run(
        ['podman', 'ps', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    return pod_name in result.stdout


def is_pod_stopped(user_name: str, project_name: str) -> bool:
    """
    Check if a pod exists but is stopped for the given user/project.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        True if pod exists but is stopped, False otherwise
    """
    pod_name = get_pod_name(user_name, project_name)
    
    # Check running containers
    running_result = subprocess.run(
        ['podman', 'ps', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    if pod_name in running_result.stdout:
        return False  # It's running
    
    # Check all containers (including stopped)
    all_result = subprocess.run(
        ['podman', 'ps', '-a', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    return pod_name in all_result.stdout


def start_pod(user_name: str, project_name: str, project_path: Optional[str] = None, install_requirements: bool = True) -> Dict[str, Any]:
    """
    Start a stopped pod or create a new one.
    
    Args:
        user_name: The username
        project_name: The project name
        project_path: Optional project path for the pod's working directory
        install_requirements: If True, install requirements from project directory
    
    Returns:
        Dict with success status and details
    """
    pod_name = get_pod_name(user_name, project_name)
    settings = get_pod_settings()
    
    # Check current state
    result = subprocess.run(
        ['podman', 'ps', '-a', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    if pod_name in result.stdout:
        # Pod exists but not running - start it
        start_result = subprocess.run(
            ['podman', 'start', pod_name],
            capture_output=True,
            text=True
        )
        
        if start_result.returncode == 0:
            # Install requirements after starting
            req_result = {}
            if install_requirements and project_path:
                req_result = install_project_requirements(pod_name, project_path)
            
            return {
                "success": True,
                "action": "started",
                "pod_name": pod_name,
                "message": f"Pod {pod_name} started successfully",
                "requirements": req_result
            }
        else:
            return {
                "success": False,
                "action": "start_failed",
                "pod_name": pod_name,
                "message": f"Failed to start pod: {start_result.stderr}"
            }
    else:
        # Pod doesn't exist - create it
        # FIX: Use container-internal path instead of host path
        if project_path:
            host_path = project_path
            container_work_dir = "/workspace"
        else:
            host_path = settings.get("work_dir", "/tmp")
            container_work_dir = "/tmp"
        work_dir = container_work_dir
        image = settings.get("shell_image", "ubuntu:latest")
        
        # Allocate a port dynamically (check if default port is available)
        allocated_port = allocate_port(pod_name, settings.get("default_port", 8080))
        print(f"[PRE_LLM] Allocated port {allocated_port} for pod {pod_name}")
        
        create_result = subprocess.run(
            [
                'podman', 'run', '-d',
                '--name', pod_name,
                '-v', f'{host_path}:{container_work_dir}:Z',
                '-w', container_work_dir,
                '-p', f"{allocated_port}:8080",
                image, 'tail', '-f', '/dev/null'
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if create_result.returncode == 0:
            # Install Python and Flask after creating pod (for Ubuntu images)
            import time
            time.sleep(2)
            
            # Install Python and Flask in the new pod
            print(f"[PRE_LLM] Installing Python and Flask in new pod {pod_name}")
            install_result = subprocess.run(
                ['podman', 'exec', pod_name, 'sh', '-c', 
                 'apt-get update && apt-get install -y python3 python3-pip python3-venv && pip3 install --break-system-packages flask'],
                capture_output=True,
                text=True,
                timeout=180
            )
            print(f"[PRE_LLM] Python/Flask install result: {install_result.returncode}")
            
            # Install requirements after creating
            req_result = {}
            if install_requirements and project_path:
                time.sleep(1)
                req_result = install_project_requirements(pod_name, project_path)
            
            return {
                "success": True,
                "action": "created",
                "pod_name": pod_name,
                "message": f"Pod {pod_name} created successfully with Python/Flask",
                "requirements": req_result
            }
        else:
            return {
                "success": False,
                "action": "create_failed",
                "pod_name": pod_name,
                "message": f"Failed to create pod: {create_result.stderr}"
            }


def ensure_pod_ready(
    user_name: str,
    project_name: str,
    project_path: Optional[str] = None,
    auto_start: bool = True
) -> Dict[str, Any]:
    """
    Ensure the project pod is ready for execution.
    Checks if pod is running, starts it if stopped, creates if doesn't exist.
    
    Args:
        user_name: The username
        project_name: The project name
        project_path: Optional project path
        auto_start: If True, automatically start/create pod if not running
    
    Returns:
        Dict with:
        - ready: bool - Whether pod is ready
        - running: bool - Whether pod is currently running
        - action: str - Action taken (none, started, created)
        - pod_name: str - The pod name
        - message: str - Status message
    """
    pod_name = get_pod_name(user_name, project_name)
    
    # Check if running
    if is_pod_running(user_name, project_name):
        return {
            "ready": True,
            "running": True,
            "action": "none",
            "pod_name": pod_name,
            "message": f"Pod {pod_name} is already running"
        }
    
    # Check if stopped
    if is_pod_stopped(user_name, project_name):
        if auto_start:
            result = start_pod(user_name, project_name, project_path)
            return {
                "ready": result["success"],
                "running": result["success"],
                "action": result.get("action", "unknown"),
                "pod_name": pod_name,
                "message": result.get("message", "Unknown error")
            }
        else:
            return {
                "ready": False,
                "running": False,
                "action": "stopped",
                "pod_name": pod_name,
                "message": f"Pod {pod_name} exists but is stopped"
            }
    
    # Pod doesn't exist
    if auto_start:
        result = start_pod(user_name, project_name, project_path)
        return {
            "ready": result["success"],
            "running": result["success"],
            "action": result.get("action", "unknown"),
            "pod_name": pod_name,
            "message": result.get("message", "Unknown error")
        }
    else:
        return {
            "ready": False,
            "running": False,
            "action": "none",
            "pod_name": pod_name,
            "message": f"Pod {pod_name} does not exist"
        }


def get_project_pods(project_id: str) -> list:
    """
    Get all pods for a specific project.
    
    Args:
        project_id: The project identifier (format: user-project)
    
    Returns:
        List of pod info dicts
    """
    user_name, project_name = parse_project_id(project_id)
    if not user_name or not project_name:
        return []
    
    # Get pod name for this specific project
    pod_name = get_pod_name(user_name, project_name)
    
    # Get all containers matching the project pod name
    result = subprocess.run(
        ['podman', 'ps', '-a', '--format', '{{.Names}}\t{{.Status}}'],
        capture_output=True,
        text=True
    )
    
    pods = []
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            container_name = parts[0]
            status = parts[1]
            
            # Match exact pod name for this specific project
            if container_name == pod_name:
                pods.append({
                    "name": container_name,
                    "status": status,
                    "project_id": project_id
                })
    
    return pods


def kill_project_pod(user_name: str, project_name: str) -> Dict[str, Any]:
    """
    Kill a specific project pod.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Dict with success status
    """
    pod_name = get_pod_name(user_name, project_name)
    
    result = subprocess.run(
        ['podman', 'kill', pod_name],
        capture_output=True,
        text=True
    )
    
    return {
        "success": result.returncode == 0,
        "pod_name": pod_name,
        "message": result.stderr if result.returncode != 0 else "Pod killed"
    }


def remove_project_pod(user_name: str, project_name: str) -> Dict[str, Any]:
    """
    Remove (delete) a specific project pod.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Dict with success status
    """
    pod_name = get_pod_name(user_name, project_name)
    
    # First kill if running, then remove
    subprocess.run(['podman', 'kill', pod_name], capture_output=True)
    
    result = subprocess.run(
        ['podman', 'rm', pod_name],
        capture_output=True,
        text=True
    )
    
    return {
        "success": result.returncode == 0,
        "pod_name": pod_name,
        "message": result.stderr if result.returncode != 0 else "Pod removed"
    }


def reset_project_pod(user_name: str, project_name: str, project_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Reset a project pod - remove existing pod and create a new one with fresh requirements.
    
    Args:
        user_name: The username
        project_name: The project name
        project_path: Optional project path for requirements
    
    Returns:
        Dict with success status and details
    """
    pod_name = get_pod_name(user_name, project_name)
    
    # First, remove the existing pod
    print(f"[PRE_LLM] Resetting pod: {pod_name}")
    
    # Kill if running
    subprocess.run(['podman', 'kill', pod_name], capture_output=True)
    
    # Remove the container
    rm_result = subprocess.run(
        ['podman', 'rm', pod_name],
        capture_output=True,
        text=True
    )
    
    if rm_result.returncode != 0 and "no such container" not in rm_result.stderr.lower():
        return {
            "success": False,
            "action": "remove_failed",
            "pod_name": pod_name,
            "message": f"Failed to remove pod: {rm_result.stderr}"
        }
    
    print(f"[PRE_LLM] Pod {pod_name} removed, creating new one...")
    
    # Now create a new pod with fresh requirements
    # Always install requirements on reset
    result = start_pod(user_name, project_name, project_path, install_requirements=True)
    
    result["action"] = "reset_" + result.get("action", "unknown")
    
    return result


# =============================================================================
# Pre-LLM Context Functions
# =============================================================================

def get_pre_llm_context_content(project_id: str) -> str:
    """
    Get the pre-LLM context content for a project.
    
    This function:
    1. Loads project context settings to find which pre-llm file to use
    2. Loads context files from project folder ONLY (no global fallback)
    3. Returns the content of the pre-llm file
    
    Args:
        project_id: The project ID (format: user-projectname)
        
    Returns:
        The content of the pre-LLM context file, or empty string if not found
    """
    from services.context_files import load_project_only_context_files, load_project_context_settings, load_context_defaults
    
    # Load context files from PROJECT FOLDER ONLY (no global fallback)
    context_files = load_project_only_context_files(project_id)
    
    print(f"[PRE_LLM DEBUG] project_id={project_id}, project context_files count={len(context_files)}")
    
    # Get project context settings to find which context files to use
    context_settings = {}
    if project_id:
        context_settings = load_project_context_settings(project_id)
        print(f"[PRE_LLM DEBUG] project_settings for {project_id}: {context_settings}")
        if not context_settings:
            context_settings = load_context_defaults()
            print(f"[PRE_LLM DEBUG] fell back to defaults: {context_settings}")
    
    # Get pre_llm context file name (handle both hyphen and underscore keys)
    pre_llm_name = context_settings.get('pre_llm') or context_settings.get('pre-llm') or 'default'
    pre_llm_file_id = f"{pre_llm_name}_pre-llm"
    
    print(f"[PRE_LLM DEBUG] pre_llm_name={pre_llm_name}, pre_llm_file_id={pre_llm_file_id}")
    print(f"[PRE_LLM DEBUG] available files: {[f.get('id') for f in context_files]}")
    
    # Find the matching context file (use get to avoid KeyError)
    pre_llm_file = next((f for f in context_files if f.get('id') == pre_llm_file_id), None)
    
    print(f"[PRE_LLM DEBUG] found file: {pre_llm_file}")
    
    if pre_llm_file:
        content = pre_llm_file.get('content', '')
        print(f"[PRE_LLM DEBUG] content length: {len(content)}")
        return content
    
    return ""


def prepare_design_prompt(user_prompt: str, project_id: str, chat_history: list = None) -> dict:
    """
    Prepare the prompt for the design chat by concatenating pre-LLM context with user prompt.
    
    This function:
    1. Gets the pre-LLM context content
    2. Concatenates: pre_llm_content + "\n\n" + user_prompt
    3. Returns a dict with:
       - pre_llm_content: the raw pre-llm context
       - full_prompt: pre_llm_content + user_prompt
       - messages: chat_history + [user message with full_prompt]
    
    Args:
        user_prompt: The user's input prompt
        project_id: The project ID
        chat_history: Previous chat messages (list of {role, content} dicts)
        
    Returns:
        Dict with pre_llm_content, full_prompt, and messages
    """
    # Get pre-LLM context
    pre_llm_content = get_pre_llm_context_content(project_id)
    
    # Concatenate pre-LLM context with user prompt
    if pre_llm_content:
        full_prompt = f"{pre_llm_content}\n\nUser: {user_prompt}"
    else:
        full_prompt = user_prompt
    
    # Build messages list with chat history
    messages = []
    if chat_history:
        messages.extend(chat_history)
    
    # Add the user message with pre-LLM context concatenated
    messages.append({"role": "user", "content": full_prompt})
    
    return {
        "pre_llm_content": pre_llm_content,
        "full_prompt": full_prompt,
        "messages": messages
    }
