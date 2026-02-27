"""
Pod Manager Service
Handles pod execution and management endpoints.
"""
from typing import Dict, Any, Optional
from services.run_pod_test import run_code_in_pod as _run_code_in_pod, kill_pod as _kill_pod
from services.config import parse_project_id, PROJECTS_DIR


def run_pod_test(
    code: str,
    project_id: Optional[str] = None,
    user_name: Optional[str] = None,
    project_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run code in a pod for a given project.
    
    Args:
        code: The code to execute
        project_id: Optional project identifier (supports user-project or user_project)
        user_name: Optional username (used if project_id not provided)
        project_name: Optional project name (used if project_id not provided)
    
    Returns:
        Dict with execution results
    """
    # Get project path and extract user_name and project_name
    project_path = None
    
    if project_id:
        parsed_user, parsed_project = parse_project_id(project_id)
        if parsed_user and parsed_project:
            project_path = str(PROJECTS_DIR / parsed_user / parsed_project)
            # Use project_id parts as user_name and project_name if not provided
            if not user_name:
                user_name = parsed_user
            if not project_name:
                project_name = parsed_project
    
    return _run_code_in_pod(code, project_path, user_name, project_name)


def kill_pod(user_name: str, project_name: str) -> Dict[str, Any]:
    """
    Kill a pod by user and project name.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Dict with kill result
    """
    return _kill_pod(user_name, project_name)


# =============================================================================
# Request Models
# =============================================================================

class RunPodRequest:
    """Model for pod test API requests."""
    def __init__(self, project_id: str, code: str):
        self.project_id = project_id
        self.code = code


class KillPodRequest:
    """Model for kill pod API requests."""
    def __init__(self, user_name: str, project_name: str):
        self.user_name = user_name
        self.project_name = project_name
