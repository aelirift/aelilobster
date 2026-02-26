"""
Executor module - Runs code in pods.
Provides execution functionality for the looper.
"""
import subprocess
from typing import Optional, Dict, Any

from services.run_pod_test import (
    run_code_in_pod,
    ensure_podman_installed,
    get_pod_name,
    get_pod_settings
)


class Executor:
    """
    Executes code in pods.
    """
    
    def __init__(self):
        """Initialize the executor."""
        self.settings = get_pod_settings()
    
    def is_podman_available(self) -> bool:
        """
        Check if podman is available on the system.
        
        Returns:
            True if podman is available
        """
        return ensure_podman_installed()
    
    def get_pod_name(self, user_name: Optional[str] = None, project_name: Optional[str] = None, suffix: str = None) -> str:
        """
        Get the container name for a pod.
        
        Args:
            user_name: User name
            project_name: Project name
            suffix: Optional suffix for the container name
            
        Returns:
            Container name
        """
        if user_name and project_name:
            base_name = get_pod_name(user_name, project_name)
        else:
            base_name = "test-pod"
        
        if suffix:
            return f"{base_name}-{suffix}"
        return base_name
    
    def execute(
        self,
        code: str,
        project_path: Optional[str] = None,
        user_name: Optional[str] = None,
        project_name: Optional[str] = None,
        node_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute code in a pod.
        
        Args:
            code: The code to execute
            project_path: Optional project path
            user_name: Optional user name
            project_name: Optional project name
            node_id: Optional node ID for container naming
            
        Returns:
            Execution result dict with 'output', 'exit_code', 'is_error', etc.
        """
        # Check if podman is available first
        if not self.is_podman_available():
            return {
                "output": "Podman is not installed. Please install podman first: https://podman.io/getting-started/installation",
                "exit_code": 1,
                "is_error": True,
                "podman_missing": True,
                "access_info": None
            }
        
        # Run the code in pod
        return run_code_in_pod(code, project_path, user_name, project_name)
    
    def verify_pod_destroyed(self, container_name: str) -> bool:
        """
        Verify that a pod has been destroyed.
        
        Args:
            container_name: Name of the container
            
        Returns:
            True if pod is destroyed, False otherwise
        """
        result = subprocess.run(
            ['podman', 'ps', '-a', '--filter', f'name={container_name}', '--format', '{{.Names}}'],
            capture_output=True,
            text=True
        )
        pods_remaining = [
            p.strip() for p in result.stdout.strip().split('\n')
            if p.strip() and container_name in p
        ]
        return len(pods_remaining) == 0
    
    def cleanup_pod(self, container_name: str) -> bool:
        """
        Clean up a pod by killing it if it still exists.
        
        Args:
            container_name: Name of the container
            
        Returns:
            True if cleanup was needed and performed, False otherwise
        """
        if self.verify_pod_destroyed(container_name):
            return False
        
        subprocess.run(['podman', 'kill', container_name], capture_output=True)
        return True


# Standalone function for backward compatibility
def execute_code_with_podman_check(
    code: str,
    project_path: Optional[str] = None,
    user_name: str = None,
    project_name: str = None
) -> Dict[str, Any]:
    """
    Execute code, handling podman not installed scenario.
    Returns execution result with special flag if podman missing.
    
    Args:
        code: The code to execute
        project_path: Optional project path
        user_name: Optional user name
        project_name: Optional project name
        
    Returns:
        Execution result dict
    """
    executor = Executor()
    return executor.execute(code, project_path, user_name, project_name)


# Project utilities (kept here for convenience)
def ensure_project_requirements(project_path: str) -> Dict[str, Any]:
    """Find or create requirements.txt for a project."""
    from pathlib import Path
    
    if not project_path:
        return {"exists": False, "created": False, "path": None, "message": "No project path"}
    
    project_dir = Path(project_path)
    if not project_dir.exists():
        return {"exists": False, "created": False, "path": None, "message": "No project dir"}
    
    req_txt = project_dir / "requirements.txt"
    req_md = project_dir / "requirements.md"
    
    if req_txt.exists():
        return {"exists": True, "created": False, "path": str(req_txt), "message": "Found requirements.txt"}
    if req_md.exists():
        return {"exists": True, "created": False, "path": str(req_md), "message": "Found requirements.md"}
    
    try:
        req_txt.touch()
        return {"exists": True, "created": True, "path": str(req_txt), "message": "Created requirements.txt"}
    except Exception as e:
        return {"exists": False, "created": False, "path": None, "message": str(e)}


def list_project_files(project_path: str) -> list:
    """List all files in a project."""
    from pathlib import Path
    
    if not project_path:
        return []
    project_dir = Path(project_path)
    if not project_dir.exists():
        return []
    files = []
    try:
        for item in project_dir.rglob("*"):
            if item.is_file():
                rel_path = item.relative_to(project_dir)
                files.append(str(rel_path))
    except:
        pass
    return sorted(files)
