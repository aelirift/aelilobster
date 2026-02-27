"""
Pre-LLM Service
Called before LLM requests to ensure project pod is ready.
Checks if pod is running, if not, spins it up.
"""
from typing import Dict, Any, Optional
import subprocess
from services.run_pod_test import get_pod_name, get_pod_settings
from services.naming import parse_project_id


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


def start_pod(user_name: str, project_name: str, project_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Start a stopped pod or create a new one.
    
    Args:
        user_name: The username
        project_name: The project name
        project_path: Optional project path for the pod's working directory
    
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
            return {
                "success": True,
                "action": "started",
                "pod_name": pod_name,
                "message": f"Pod {pod_name} started successfully"
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
        work_dir = project_path if project_path else settings.get("work_dir", "/tmp")
        image = settings.get("shell_image", "alpine")
        
        create_result = subprocess.run(
            [
                'podman', 'run', '-d',
                '--name', pod_name,
                '-v', f'{work_dir}:{work_dir}:Z',
                '-w', work_dir,
                '-p', f"{settings.get('default_port', 8080)}:8080",
                image, 'tail', '-f', '/dev/null'
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if create_result.returncode == 0:
            return {
                "success": True,
                "action": "created",
                "pod_name": pod_name,
                "message": f"Pod {pod_name} created successfully"
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
    Get all pods for a project (by user name prefix).
    
    Args:
        project_id: The project identifier
    
    Returns:
        List of pod info dicts
    """
    user_name, project_name = parse_project_id(project_id)
    if not user_name:
        return []
    
    # Get all containers matching the user prefix
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
            pod_name = parts[0]
            status = parts[1]
            
            # Match pods for this user
            if pod_name.startswith(f"{user_name}-"):
                pods.append({
                    "name": pod_name,
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
