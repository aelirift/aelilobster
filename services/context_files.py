"""
Context Files Service
Handles CRUD operations for context files stored as markdown files.
"""
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

# Context files directory
CONTEXT_FILES_DIR = Path(__file__).parent.parent / "context_files"
FILE_TYPES_FILE = CONTEXT_FILES_DIR / "file_types.json"

# Projects directory for project-specific context files
PROJECTS_DIR = Path(__file__).parent.parent / "user_login"

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

# Create the context_files directory if it doesn't exist
CONTEXT_FILES_DIR.mkdir(exist_ok=True)


# =============================================================================
# File Types Management
# =============================================================================

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


# =============================================================================
# Context Files CRUD
# =============================================================================

def load_context_files(project_id: str = None) -> List[Dict[str, Any]]:
    """
    Load context files metadata from folder.
    
    Args:
        project_id: Optional project ID - if provided, loads from both global and project folders
                   (project files override global with same name/type)
        
    Returns:
        Dict with files list and optional notification
    """
    # Load defaults
    defaults = load_context_defaults()
    
    files = []
    notification = None
    
    file_dict = {}  # key: (name, type) -> file info
    
    # Always load global context files first (for dropdown selection)
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.name in ("file_types.json", "defaults.json"):
            continue
        try:
            with open(md_file, "r") as f:
                content = f.read()
            stem = md_file.stem
            parts = stem.rsplit("_", 1)
            if len(parts) == 2:
                name = parts[0]
                file_type = parts[1]
            else:
                name = stem
                file_type = "pre-llm"
            
            key = (name, file_type)
            file_dict[key] = {
                "id": f"{name}_{file_type}",
                "name": name,
                "type": file_type,
                "content": content,
                "source": "global"
            }
        except:
            pass
    
    # Then load project-specific files (override global ones)
    project_context_exists = False
    if project_id:
        parts = project_id.split('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            proj_context_dir = PROJECTS_DIR / user_name / project_name / "proj_context"
            project_context_exists = proj_context_dir.exists() and any(proj_context_dir.glob("*.md"))
            
            if proj_context_dir.exists():
                for md_file in proj_context_dir.glob("*.md"):
                    try:
                        with open(md_file, "r") as f:
                            content = f.read()
                        stem = md_file.stem
                        parts = stem.rsplit("_", 1)
                        if len(parts) == 2:
                            name = parts[0]
                            file_type = parts[1]
                        else:
                            name = stem
                            file_type = "pre-llm"
                        
                        key = (name, file_type)
                        file_dict[key] = {
                            "id": f"{name}_{file_type}",
                            "name": name,
                            "type": file_type,
                            "content": content,
                            "source": "project"
                        }
                    except:
                        pass
    
    # Convert dict to list and add is_default
    for key, file_info in file_dict.items():
        name, file_type = key
        file_info["is_default"] = defaults.get(file_type) == name
        files.append(file_info)
    
    # Add notification if project context folder doesn't exist but was requested
    if project_id and not project_context_exists:
        notification = f"No custom context files found for project {project_id}. Using global defaults."
    
    return {
        "files": files,
        "notification": notification
    }


def load_project_only_context_files(project_id: str) -> List[Dict[str, Any]]:
    """
    Load ONLY project-specific context files (no global fallback).
    Used when actually reading files for content.
    
    Args:
        project_id: Project ID to load from project's proj_context folder
        
    Returns:
        List of project context file dicts
    """
    if not project_id:
        return []
    
    defaults = load_context_defaults()
    files = []
    file_dict = {}
    
    parts = project_id.split('-', 1)
    if len(parts) == 2:
        user_name, project_name = parts
        proj_context_dir = PROJECTS_DIR / user_name / project_name / "proj_context"
        
        if proj_context_dir.exists() and any(proj_context_dir.glob("*.md")):
            # Only load from project folder - NO global fallback
            for md_file in proj_context_dir.glob("*.md"):
                try:
                    with open(md_file, "r") as f:
                        content = f.read()
                    stem = md_file.stem
                    parts = stem.rsplit("_", 1)
                    if len(parts) == 2:
                        name = parts[0]
                        file_type = parts[1]
                    else:
                        name = stem
                        file_type = "pre-llm"
                    
                    key = (name, file_type)
                    file_dict[key] = {
                        "id": f"{name}_{file_type}",
                        "name": name,
                        "type": file_type,
                        "content": content,
                        "source": "project"
                    }
                except:
                    pass
    
    # Convert dict to list
    for key, file_info in file_dict.items():
        name, file_type = key
        file_info["is_default"] = defaults.get(file_type) == name
        files.append(file_info)
    
    return files


def save_context_file(file_id: str, file_type: str, name: str, content: str, project_id: str = None, clear_existing: bool = True) -> dict:
    """
    Save a context file to disk as .md file.
    
    Args:
        file_id: The file identifier (used to lookup existing file)
        file_type: The type of context file
        name: The name of the file
        content: The content to save
        project_id: Optional project ID to save in project's proj_context folder
        clear_existing: If True, clears all .md files in proj_context before saving (default True)
        
    Returns:
        Dict with success status and notification message
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Determine target directory
    target_dir = CONTEXT_FILES_DIR
    was_created = False
    notification = None
    
    if project_id:
        # Parse project_id (format: user-projectname)
        parts = project_id.split('-', 1)
        if len(parts) == 2:
            user_name, project_name = parts
            proj_context_dir = PROJECTS_DIR / user_name / project_name / "proj_context"
            
            # Create proj_context directory if it doesn't exist
            if not proj_context_dir.exists():
                proj_context_dir.mkdir(parents=True, exist_ok=True)
                was_created = True
                notification = f"Created new proj_context folder for project {project_id}. Global context files will be used until you save custom ones."
                logger.info(f"[CONTEXT FILES SERVICE] Created new proj_context folder: {proj_context_dir}")
            
            target_dir = proj_context_dir
            
            # Clear ALL existing .md files in proj_context before saving (replace all files)
            # Only clear if clear_existing is True (to allow batch saving multiple files)
            if clear_existing:
                for md_file in target_dir.glob("*.md"):
                    logger.info(f"[CONTEXT FILES SERVICE] Clearing old file: {md_file}")
                    md_file.unlink()
            
            logger.info(f"[CONTEXT FILES SERVICE] Saving to project folder: project_id={project_id}, dir={target_dir}, clear_existing={clear_existing}")
    
    # Sanitize name for filename - REMOVE any type suffix if present
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_").strip()
    if not safe_name:
        safe_name = "untitled"
    
    # Remove type suffix from name if it already contains it
    if safe_name.endswith(f"_{file_type}"):
        safe_name = safe_name[:-len(f"_{file_type}")]
    
    # New format: {name}_{type}.md
    filename = f"{safe_name}_{file_type}.md"
    
    filepath = target_dir / filename
    
    logger.info(f"[CONTEXT FILES SERVICE] Saving file: file_id={file_id}, name={name}, type={file_type}, filepath={filepath}")
    
    with open(filepath, "w") as f:
        f.write(content)
    
    return {
        "success": True,
        "notification": notification,
        "project_context_created": was_created
    }


def delete_context_file(file_id: str) -> bool:
    """
    Delete a context file from disk.
    
    Args:
        file_id: The file identifier in format {name}_{type}
    
    Returns:
        True if deleted, False if not found
    """
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.stem == file_id:
            md_file.unlink()
            return True
    return False


# =============================================================================
# Defaults Management
# =============================================================================

def load_context_defaults() -> Dict[str, str]:
    """Load default context file mappings from defaults.json."""
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    if defaults_file.exists():
        try:
            with open(defaults_file, "r") as f:
                return json.load(f)
        except:
            pass
    return {}


def save_context_defaults(defaults: Dict[str, str]) -> None:
    """
    Save default context file mappings to defaults.json.
    
    Args:
        defaults: Dict mapping file types to default file names
    """
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    with open(defaults_file, "w") as f:
        json.dump(defaults, f, indent=2)


def set_context_file_default(file_id: str) -> Dict[str, str]:
    """
    Set a context file as the default for its type.
    
    Args:
        file_id: The file identifier
    
    Returns:
        Dict with status, type, and name
    """
    import logging
    logger = logging.getLogger(__name__)
    
    result = load_context_files()
    logger.info(f"[CONTEXT FILES] set_context_file_default called with file_id={file_id}")
    logger.info(f"[CONTEXT FILES] load_context_files returned type: {type(result)}, keys: {result.keys() if isinstance(result, dict) else 'N/A'}")
    
    # Fix: Handle the dict return format
    if isinstance(result, dict):
        files_list = result.get("files", [])
    else:
        files_list = result
    
    logger.info(f"[CONTEXT FILES] Files list type: {type(files_list)}, length: {len(files_list) if isinstance(files_list, list) else 'N/A'}")
    
    # Find the file
    target_file = None
    for f in files_list:
        if f["id"] == file_id:
            target_file = f
            break
    
    if not target_file:
        raise FileNotFoundError(f"File not found: {file_id}")
    
    # Load current defaults
    defaults = load_context_defaults()
    # Set this file as default for its type
    defaults[target_file["type"]] = target_file["name"]
    save_context_defaults(defaults)
    
    return {"status": "success", "type": target_file["type"], "name": target_file["name"]}


# =============================================================================
# Project Context Settings
# =============================================================================

def get_pre_llm_context() -> Optional[Dict[str, Any]]:
    """
    Get the default pre-llm context file content.
    This ensures the pre-llm instructions are always included in LLM calls.
    
    Returns:
        Dict with pre-llm context file data, or None if not found
    """
    result = load_context_files()
    # Handle dict return format
    if isinstance(result, dict):
        files = result.get("files", [])
    else:
        files = result
    
    defaults = load_context_defaults()
    
    # Get the default pre-llm file name from defaults
    default_pre_llm_name = defaults.get("pre-llm")
    
    # First try to find the default pre-llm file by name from defaults
    if default_pre_llm_name:
        for f in files:
            if f.get("name") == default_pre_llm_name and f.get("type") == "pre-llm":
                return f
    
    # Fallback: look for any file with type "pre-llm" or filename containing "pre-llm"
    for f in files:
        if f.get("type") == "pre-llm":
            return f
        # Also check if filename contains "pre-llm"
        file_id = f.get("id", "")
        if "pre-llm" in file_id.lower():
            return f
    
    return None


def load_project_context_settings(project_id: str) -> Dict[str, str]:
    """
    Load context file settings for a specific project.
    
    Args:
        project_id: The project identifier
    
    Returns:
        Dict of context settings for the project
    """
    from services.config import load_config, save_config
    config = load_config()
    return config.get("project_context_settings", {}).get(project_id, {})


def save_project_context_settings(project_id: str, settings: Dict[str, str]) -> None:
    """
    Save context file settings for a specific project.
    
    Args:
        project_id: The project identifier
        settings: Dict of context settings
    """
    from services.config import load_config, save_config
    config = load_config()
    if "project_context_settings" not in config:
        config["project_context_settings"] = {}
    config["project_context_settings"][project_id] = settings
    save_config(config)


# =============================================================================
# ContextFile Model (for API requests)
# =============================================================================

class ContextFile:
    """Model for context file API requests."""
    def __init__(self, name: str, type: str, content: str):
        self.name = name
        self.type = type
        self.content = content
