"""
Naming Utilities Service
Centralized naming conventions to ensure consistency across the entire codebase.
All name creation/parsing should go through these functions.

Based on context_files/naming_conventions.md:
- Project ID: {user_name}-{project_name} (hyphen separated)
- Pod Name: {user_name}-{project_name}-pod
- Context Files: {type}_{name}.md

Rules:
- Use hyphens (-) for separating user/project names
- Use underscores (_) only in user names when part of the login (e.g., test_user)
- All internal lookups should normalize to ensure consistency
"""
import re
from typing import Tuple, Optional


def normalize_project_id(user_name: str, project_name: str) -> str:
    """
    Normalize project ID to standard format.
    Always uses hyphen between user and project.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Normalized project ID like "user-project"
    """
    # Ensure no hyphens in user_name or project_name by replacing with underscores
    # But wait - per naming conventions, user_name can have underscores (test_user)
    # and project_name should use hyphens
    return f"{user_name}-{project_name}"


def parse_project_id(project_id: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse project_id into (user_name, project_name).
    
    Supports both hyphen and underscore formats:
    - user-project -> ("user", "project") 
    - user_project -> ("user", "project")
    
    Args:
        project_id: The project identifier
    
    Returns:
        Tuple of (user_name, project_name) or (None, None) if invalid
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


def get_pod_name(user_name: str, project_name: str) -> str:
    """
    Generate pod name following naming conventions.
    
    Format: {user_name}-{project_name}-pod
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Pod name like "test_user-myproject-pod"
    """
    return f"{user_name}-{project_name}-pod"


def normalize_for_pod(user_name: str, project_name: str) -> Tuple[str, str]:
    """
    Normalize user_name and project_name for pod naming.
    Ensures consistent format for pod container names.
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Tuple of (normalized_user_name, normalized_project_name)
    """
    # User name can have underscores but no hyphens
    # Project name should use hyphens
    normalized_user = user_name.replace("-", "_")  # Ensure underscores in username
    normalized_project = project_name.replace("_", "-")  # Ensure hyphens in project
    
    return normalized_user, normalized_project


def get_pod_name_normalized(user_name: str, project_name: str) -> str:
    """
    Generate pod name with normalization.
    Ensures consistent pod naming regardless of input format.
    
    Args:
        user_name: The username (may have underscores or hyphens)
        project_name: The project name (may have underscores or hyphens)
    
    Returns:
        Normalized pod name like "test_user-myproject-pod"
    """
    norm_user, norm_project = normalize_for_pod(user_name, project_name)
    return f"{norm_user}-{norm_project}-pod"


def get_context_file_name(file_type: str, name: str) -> str:
    """
    Generate context file name following naming conventions.
    
    Format: {type}_{name}.md
    
    Args:
        file_type: The type (e.g., "pre-llm", "debugger", "pod")
        name: The descriptive name
    
    Returns:
        File name like "pre-llm_default.md"
    """
    # Use hyphens in names for consistency
    normalized_name = name.replace("_", "-")
    return f"{file_type}_{normalized_name}.md"


def parse_context_file_name(filename: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse context file name to get type and name.
    
    Args:
        filename: The file name (e.g., "pre-llm_default.md")
    
    Returns:
        Tuple of (file_type, name) or (None, None) if invalid
    """
    # Remove .md extension
    if filename.endswith(".md"):
        filename = filename[:-3]
    
    # Split on last underscore to get type and name
    if "_" in filename:
        parts = filename.rsplit("_", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
    
    return None, None


def get_project_dir(user_name: str, project_name: str) -> str:
    """
    Get project directory path components.
    
    Format: {user_name}/{project_name}
    
    Args:
        user_name: The username
        project_name: The project name
    
    Returns:
        Path like "test_user/myproject"
    """
    norm_user, norm_project = normalize_for_pod(user_name, project_name)
    return f"{norm_user}/{norm_project}"
