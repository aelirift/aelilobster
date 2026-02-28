"""
Projects Service
Handles project management - loading, creating, and deleting projects.
"""
from pathlib import Path
from typing import List, Dict, Any, Optional
import shutil

from services.config import PROJECTS_DIR, parse_project_id
from services.naming import get_project_dir, normalize_for_pod
from services.pre_llm import start_pod, get_pod_settings


def load_projects() -> List[Dict[str, Any]]:
    """
    Load all projects from the projects directory.
    
    Returns:
        List of project dicts with id, name, user, and path
    """
    projects = []
    if not PROJECTS_DIR.exists():
        return projects
    
    for user_dir in PROJECTS_DIR.iterdir():
        if user_dir.is_dir():
            user_name = user_dir.name
            for project_dir in user_dir.iterdir():
                if project_dir.is_dir():
                    projects.append({
                        "id": f"{user_name}-{project_dir.name}",
                        "name": project_dir.name,
                        "user": user_name,
                        "path": str(project_dir)
                    })
    return projects


def get_user_projects(user: str) -> List[Dict[str, Any]]:
    """
    Load projects for a specific user only.
    
    Args:
        user: The username to filter by
    
    Returns:
        List of project dicts belonging to the user
    """
    all_projects = load_projects()
    return [p for p in all_projects if p.get("user") == user]


def create_project_folder(user: str, name: str) -> Dict[str, Any]:
    """
    Create a new project folder and its pod.
    
    Args:
        user: The username
        name: The project name
    
    Returns:
        Dict with id, name, user, path, and pod_status
    
    Raises:
        ValueError: If project already exists
    """
    user_dir = PROJECTS_DIR / user
    project_dir = user_dir / name
    
    if project_dir.exists():
        raise ValueError("Project already exists")
    
    project_dir.mkdir(parents=True, exist_ok=True)
    
    # Create a default requirements file if it doesn't exist
    requirements_file = project_dir / "requirements.txt"
    if not requirements_file.exists():
        requirements_file.write_text("# Add your Python dependencies here\n# One package per line, e.g.:\n# requests\n# numpy\n")
    
    # Create pod for this project
    project_path = str(project_dir)
    pod_result = start_pod(user, name, project_path)
    
    return {
        "id": f"{user}-{name}",
        "name": name,
        "user": user,
        "path": str(project_dir),
        "pod_status": pod_result
    }


def delete_project_folder(user: str, name: str) -> bool:
    """
    Delete a project folder.
    
    Args:
        user: The username
        name: The project name
    
    Returns:
        True if deleted, False if not found
    """
    project_dir = PROJECTS_DIR / user / name
    if project_dir.exists():
        shutil.rmtree(project_dir)
        return True
    return False


def get_project_path(project_id: str) -> Optional[str]:
    """
    Get the full path for a project by its ID.
    
    Args:
        project_id: The project identifier (supports user-project or user_project format)
    
    Returns:
        Full path as string, or None if not found
    """
    user_name, project_name = parse_project_id(project_id)
    if user_name and project_name:
        project_path = PROJECTS_DIR / user_name / project_name
        if project_path.exists():
            return str(project_path)
    return None


def project_exists(project_id: str) -> bool:
    """
    Check if a project exists.
    
    Args:
        project_id: The project identifier
    
    Returns:
        True if exists, False otherwise
    """
    return get_project_path(project_id) is not None


def list_project_files(project_id: str) -> List[str]:
    """
    List files in a project directory.
    
    Args:
        project_id: The project identifier
    
    Returns:
        List of file paths relative to project root
    """
    project_path = get_project_path(project_id)
    if not project_path:
        return []
    
    files = []
    project_dir = Path(project_path)
    for item in project_dir.rglob("*"):
        if item.is_file():
            files.append(str(item.relative_to(project_dir)))
    return files


# =============================================================================
# ProjectRequest Model
# =============================================================================

class ProjectRequest:
    """Model for project API requests."""
    def __init__(self, name: str, user: str):
        self.name = name
        self.user = user
